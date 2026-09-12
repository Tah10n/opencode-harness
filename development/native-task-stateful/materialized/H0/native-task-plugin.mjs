import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { reviewContext } from './native-review-context.mjs';
import { prepareObservations } from './native-task-observations.mjs';
import { runWorkflow, nativePermissionDenial } from './native-task-workflow.mjs';

// Native sessions in another worktree load a separate plugin instance. The
// module-level registry connects only explicitly created workflow children.
const armed = new Map(), children = new Map();
function stopRun(run, kind, message, facts) {
  if (run.sealed || run.terminalReason) return;
  run.terminalReason = {kind, message, facts};
  run.violation = message;
  run.save('terminal-reason.json', run.terminalReason);
  // Do not await session.abort inside a native tool/event callback: abort may
  // need that callback to return before the active prompt can settle.
  run.cancel();
}
// Internal options are used only by installed diagnostic wrappers. The native
// command exposes no arguments or additional public continuation mode.
export default async function nativeTaskPlugin({ client, directory }, workflowOptions = {}) {
  const data = async promise => { const r = await promise; if (r.error || !r.data) throw Error(`Native API failed: ${JSON.stringify(r.error)}`); return r.data; };
  const get = id => data(client.session.get({ path: { id } }));
  return {
    'command.execute.before': async (input) => {
      if (input.command !== 'harness-task') return;
      if (input.arguments.trim()) throw Error('/harness-task takes no arguments; supply HARNESS_TASK_FILE before launch');
      if (armed.has(input.sessionID)) throw Error('This session already invoked a workflow; use a new native session');
      const budget = Number(process.env.HARNESS_TASK_TIMEOUT_MS ?? 600000);
      if (!Number.isSafeInteger(budget) || budget < 1000 || budget > 3600000) throw Error('HARNESS_TASK_TIMEOUT_MS must be 1000..3600000');
      const run = { state: 'armed', taskFile: process.env.HARNESS_TASK_FILE, startedAt: Date.now(), budget };
      run.timer = setTimeout(() => {
        run.timedOut = true; run.cancel?.();
        data(client.session.abort({ path: { id: input.sessionID } })).catch(error => { run.abortError = error.message; });
      }, budget);
      armed.set(input.sessionID, run);
    },
    event: async ({ event }) => {
      if (event.type === 'command.executed' && event.properties.name === 'harness-task')
        clearTimeout(armed.get(event.properties.sessionID)?.timer);
      if (event.type === 'permission.replied' && event.properties.reply === 'reject') {
        const deniedRun = children.get(event.properties.sessionID);
        if (deniedRun && !deniedRun.sealed) {
          deniedRun.save('permission-reply-violation.json', event.properties);
          stopRun(deniedRun, 'permission_denied', 'Native permission boundary rejected a tool; no evidence correction admitted', event.properties);
        }
      }
      const part = event.type === 'message.part.updated' ? event.properties.part : null;
      const run = part?.type === 'tool' ? children.get(part.sessionID) : null;
      if (run?.sealed) return;
      const pending = run?.pending.get(part.callID);
      // Permission rejection can occur before tool.execute.before, so there may
      // be no pending entry. Latch the native error independently of that hook.
      if (run && part.state.status === 'error' && nativePermissionDenial(part.state.error)) {
        const facts = {callID:part.callID, tool:part.tool, args:part.state.input, error:part.state.error};
        if (!run.terminalReason) run.save('permission-violation.json', facts);
        stopRun(run, 'permission_denied', 'Native permission boundary rejected a tool; no evidence correction admitted', facts);
      }

      if (run && part.state.status === 'error' && !run.log.some(e => e.callID === part.callID)) {
        const after = run.capture();
        if (after.status !== 'captured') { stopRun(run, 'capture_failed', after.error); return; }
        const rejected = run.rejectedBefore.get(part.callID);
        run.rejectedBefore.delete(part.callID);
        const unchangedRejection = !pending && rejected === run.expected && after.snapshotSha256 === run.expected;
        const unexpectedChange = !pending && after.snapshotSha256 !== run.expected;
        if (unexpectedChange) stopRun(run, 'scope_violation', 'Worktree changed before native tool admission; workflow stopped', {callID:part.callID});
        run.log.push({ ...(unchangedRejection ? { stateObservation: { basis: 'host-rejected-before-execution', snapshot: run.expected } } : {}), scopeViolation: unexpectedChange, ...(pending ?? {tool: part.tool, callID: part.callID, before: null}), permissionDenied: nativePermissionDenial(part.state.error), after: after.snapshotSha256, completedAt: Date.now(),
          args: part.state.input, output: part.state.error, state: 'error' });
        run.pending.delete(part.callID);
        if (!unexpectedChange) run.expected = after.snapshotSha256;
        run.save('tool-events.json', run.log);
      }
    },
    'chat.params': async input => {
      children.get(input.sessionID)?.checkActive();
      // The parent already has the factual tool result; a fatal decision must
      // not spend another model request rewriting that terminal result.
      const reason = armed.get(input.sessionID)?.terminalReason;
      if (reason) throw Error(reason.message);
    },
    'experimental.text.complete': async (input, output) => {
      const run = armed.get(input.sessionID);
      if (!run) return;
      output.text = run.result
        ? `Native task workflow: ${run.result.status}. Delivery worktree: ${run.executionDirectory}. Original checkout unchanged by workflow transfer. Artifacts: ${run.artifacts}. Remaining obligations and limitations: ${JSON.stringify({ remaining: run.result.remaining, limits: run.result.limits })}. This is factual check evidence, not a correctness certificate.`
        : 'Native task workflow incomplete: no completed workflow result is available. See native tool/error events.';
    },
    'chat.message': async (input, output) => {
      const run = armed.get(input.sessionID);
      if (!run || run.state !== 'armed') return;
      run.model = output.message.model; run.variant = output.message.variant ?? input.variant;
      run.agent = output.message.agent;
    },
    'tool.execute.before': async (input) => {
      const parent = armed.get(input.sessionID);
      if (parent && (input.tool !== 'harness_task' || parent.state !== 'armed'))
        throw Error('The task command parent may only invoke its workflow tool once');
      const run = children.get(input.sessionID);
      if (!run) return;
      run.checkActive();
      const reading = ['read', 'glob', 'grep'];
      if (run.pending.size && (!reading.includes(input.tool) || [...run.pending.values()].some(p => !reading.includes(p.tool)))) {
        // This call has not reached native execution. Record the trusted state
        // separately; the error event must still capture and compare actual bytes.
        run.rejectedBefore.set(input.callID, run.expected);
        throw Error('Mutation/check tools must execute sequentially; source reads may run together');
      }
      const before = run.capture();
      if (before.status !== 'captured' || before.snapshotSha256 !== run.expected) {
        stopRun(run, 'scope_violation', 'Worktree changed outside the preceding native tool; workflow stopped to preserve user work', {callID:input.callID});
        throw Error(run.violation);
      }
      run.pending.set(input.callID, { tool: input.tool, callID: input.callID, before: before.snapshotSha256, startedAt: Date.now() });
    },
    'tool.execute.after': async (input, output) => {
      const run = children.get(input.sessionID);
      if (!run || run.sealed) return;
      const pending = run.pending.get(input.callID);
      if (!pending) throw Error('Missing native before-tool evidence');
      const after = run.capture();
      if (after.status !== 'captured') throw Error(after.error);
      const event = { ...pending, after: after.snapshotSha256, completedAt: Date.now(), args: input.args,
        output: output.output, exit: output.metadata?.exit, state: 'completed' };
      run.log.push(event); run.pending.delete(input.callID);
      run.expected = after.snapshotSha256;
      run.save('tool-events.json', run.log);

    },
    tool: {
      harness_task: {
        description: 'Execute an explicitly armed /harness-task workflow via native sessions. No arguments. Unavailable outside that command.',
        args: {},
        async execute(_args, context) {
          const run = armed.get(context.sessionID);
          if (!run || run.state !== 'armed' || !run.model || !run.agent) throw Error('Invoke /harness-task explicitly first');
          run.state = 'running';
          if (!path.isAbsolute(run.taskFile ?? '')) throw Error('HARNESS_TASK_FILE must name an absolute original task file');
          await context.ask({ permission: 'task', patterns: [run.agent], always: [],
            metadata: { description: 'Experimental task implementation and up to three factual corrective replies in one session' } });
          const parent = await get(context.sessionID);
          const agents = await data(client.app.agents());
          const author = agents.find(a => a.name === run.agent);
          if (!author || !Array.isArray(author.permission)) throw Error('Native author permissions unavailable');
          if ([...author.permission, ...(parent.permission ?? [])]
            .some(rule => rule.pattern?.replaceAll('\\', '/').startsWith(directory.replaceAll('\\', '/') + '/')))
            throw Error('Project-absolute permission patterns cannot be relocated safely; use workspace-relative rules for an isolated task');
          const rules = [...author.permission, ...(parent.permission ?? [])];
          const baseResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' });
          if (baseResult.status !== 0) throw Error('Task needs a Git worktree with a committed base');
          const base = baseResult.stdout.trim();
          run.capture = () => reviewContext({ cwd: directory, base, taskFile: run.taskFile, permissionRules: rules });
          const initial = run.capture();
          if (initial.status !== 'captured' || !initial.task) throw Error(initial.error ?? 'Original task is empty');
          const gitdir = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: directory, encoding: 'utf8' });
          if (gitdir.status !== 0) throw Error('Cannot locate local artifact directory');
          const artifacts = path.join(gitdir.stdout.trim(), 'harness-task', randomUUID());
          fs.mkdirSync(artifacts, { recursive: true, mode: 0o700 });
          run.save = (name, value) => fs.writeFileSync(path.join(artifacts, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
          run.save('original.json', initial); run.save('original.patch', initial.diff);
          // No result is ever applied back to the user's evolving checkout.
          // Standard Git worktree plumbing is deliberately limited to creating
          // one new, retained delivery workspace at the exact captured base.
          const executionDirectory = path.join(artifacts, 'worktree');
          run.executionDirectory = executionDirectory; run.artifacts = artifacts;
          const created = spawnSync('git', ['worktree', 'add', '--detach', executionDirectory, base], { cwd: directory, encoding: 'utf8' });
          if (created.status !== 0) throw Error(`Cannot create task worktree: ${created.stderr}`);
          if (initial.diff) {
            const applied = spawnSync('git', ['apply', '--binary', '--whitespace=nowarn', '-'], { cwd: executionDirectory, input: initial.diff, encoding: 'utf8' });
            if (applied.status !== 0) throw Error(`Cannot seed task worktree; original unchanged: ${applied.stderr}`);
          }
          run.capture = () => {
            // Original task was permission-checked and captured once in its
            // original workspace; never reread an external task from the child.
            const snapshot = reviewContext({ cwd: executionDirectory, base, taskFile: null, permissionRules: rules });
            if (snapshot.status !== 'captured') return snapshot;
            return { ...snapshot, task: initial.task, taskSha256: initial.taskSha256, scope: 'original-task-review',
              snapshotSha256: createHash('sha256').update(snapshot.snapshotSha256 + initial.taskSha256).digest('hex') };
          };
          const observe = prepareObservations({ directory: executionDirectory, artifacts, permissionRules: rules, task: initial.task });
          const seeded = run.capture();
          if (seeded.status !== 'captured' || seeded.diff !== initial.diff || seeded.task !== initial.task)
            throw Error('Task worktree does not match captured user input');
          run.log = []; run.pending = new Map(); run.rejectedBefore = new Map(); run.expected = seeded.snapshotSha256;
          const controller = new AbortController();
          const sessions = new Map();
          const cancellations = new Map();
          const cancel = () => {
            controller.abort();
            for (const id of sessions.values()) if (!cancellations.has(id)) {
              const pending = data(client.session.abort({ path: { id }, query: { directory: executionDirectory } }));
              cancellations.set(id, pending);
              pending.catch(() => {}); // Awaited before terminal capture.
            }
          };
          const remaining = run.budget - (Date.now() - run.startedAt);
          run.cancel = cancel;
          context.abort.addEventListener('abort', cancel, { once: true });
          if (context.abort.aborted || remaining <= 0) cancel();
          run.checkActive = () => {
            if (run.violation) throw Error(run.violation);
            if (controller.signal.aborted) throw Error('Task cancelled or total time budget exhausted');
            if (Date.now() - run.startedAt >= run.budget) throw Error('Total time budget exhausted');
          };
          const prompt = async (role, text, schema) => {
            run.checkActive();
            if (run.capture().snapshotSha256 !== run.expected) throw Error('External worktree change between stages');
            let id = sessions.get(role);
            if (!id) {
              const permission = [...(parent.permission ?? []), { permission: 'harness_task', pattern: '*', action: 'deny' }];
              permission.push({ permission: 'task', pattern: '*', action: 'deny' });
              const session = await data(client.session.create({ query: { directory: executionDirectory }, body: { parentID: context.sessionID, title: `Harness task: ${role}`, permission } }));
              id = session.id; sessions.set(role, id); children.set(id, run);
              if (controller.signal.aborted) cancel(); // Includes create/abort races.
              run.checkActive();
            }
            run.role = role;
            await context.metadata({ title: `Harness task: ${role}`, metadata: { artifacts, sessions: Object.fromEntries(sessions) } });
            run.checkActive();
            return data(client.session.prompt({ path: { id }, query: { directory: executionDirectory }, body: { model: run.model, variant: run.variant,
              agent: run.agent,
              parts: [{ type: 'text', text: text + (schema ? '\nReturn only a JSON object matching this schema. No markdown or universal correctness verdict:\n' + JSON.stringify(schema) : '') }] } }));
          };
          try {
            const result = await runWorkflow({
              capture: run.capture, save: run.save, checkActive: run.checkActive,
              aborted: () => controller.signal.aborted, terminalReason: () => run.terminalReason, events: () => run.log, prompt,
              observe: snapshot => { if (run.pending.size) throw Error('Native processes have unresolved tool events'); return observe(run.log, snapshot); },
              messages: role => data(client.session.messages({ path: { id: sessions.get(role) }, query: { directory: executionDirectory } })),
            }, workflowOptions);
            // The active prompt has settled. Confirm native tools are terminal
            // before publishing a patch, including when abort returned an error.
            const native = await Promise.all([...sessions.values()].map(id =>
              data(client.session.messages({path:{id},query:{directory:executionDirectory}}))));
            // Include cancellation that raced with the native message read.
            const stopped = await Promise.allSettled(cancellations.values());
            const activeTools = native.flat().flatMap(m => m.parts ?? []).filter(p =>
              p.type === 'tool' && ['pending','running'].includes(p.state?.status));
            const termination = {verified:stopped.every(r => r.status === 'fulfilled') &&
              !run.pending.size && !activeTools.length, abortRequests:cancellations.size,
              pendingTools:run.pending.size, activeTools:activeTools.length,
              abortErrors:stopped.filter(r => r.status === 'rejected').map(r => String(r.reason))};
            run.save('termination.json', termination);
            run.sealed = true; // Late native events cannot rewrite terminal evidence.
            if (termination.verified) {
              const terminal = run.capture();
              run.save('terminal.json', terminal);
              if (terminal.status === 'captured') run.save('terminal.patch', terminal.diff);
              if (terminal.status !== 'captured' || terminal.snapshotSha256 !== run.expected) {
                result.status = 'incomplete'; result.limits.push('Terminal state differs from the observed delivery');
              }
            } else {
              result.status = 'incomplete'; result.limits.push('Native tool termination unverified; no terminal patch published');
            }
            if (run.terminalReason) {
              result.status = 'incomplete'; result.terminalReason = run.terminalReason;
              if (!result.limits.includes(run.terminalReason.message)) result.limits.push(run.terminalReason.message);
            }
            result.termination = termination; run.save('result.json', result);
            run.result = result;
            return JSON.stringify({ ...result, artifacts, executionDirectory, sessions: Object.fromEntries(sessions),
              notice: 'checks_passed records observed project checks only; task completeness and coverage equivalence remain separate' });
          } finally {
            context.abort.removeEventListener('abort', cancel); run.state = 'finished';
            for (const id of sessions.values()) children.delete(id);
          }
        },
      },
    },
  };
}
