import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { reviewContext } from './native-review-context.mjs';
import { runWorkflow, productionDiff, verificationPath } from './native-task-workflow.mjs';

// Native sessions in another worktree load a separate plugin instance. The
// module-level registry connects only explicitly created workflow children.
const armed = new Map(), children = new Map();
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
      const part = event.type === 'message.part.updated' ? event.properties.part : null;
      const run = part?.type === 'tool' ? children.get(part.sessionID) : null;
      const pending = run?.pending.get(part.callID);
      if (pending && part.state.status === 'error') {
        const after = run.capture();
        if (after.status !== 'captured') { run.violation = after.error; return; }
        run.log.push({ ...pending, after: after.snapshotSha256, completedAt: Date.now(),
          args: part.state.input, output: part.state.error, state: 'error' });
        run.pending.delete(part.callID);
        if (run.role === 'reviewer' && after.snapshotSha256 !== run.expected ||
          run.probeFiles && productionDiff(after, run.probeFiles) !== run.probeProduction)
          run.violation = 'Failed native tool mutated a protected stage';
        run.expected = after.snapshotSha256;
        run.save('tool-events.json', run.log);
      }
    },
    'experimental.text.complete': async (input, output) => {
      const run = armed.get(input.sessionID);
      if (!run) return;
      output.text = run.result
        ? `Native task workflow: ${run.result.status}. Delivery worktree: ${run.executionDirectory}. Original checkout unchanged by workflow transfer. Artifacts: ${run.artifacts}. Remaining obligations and limitations: ${JSON.stringify({ remaining: run.result.remaining, limits: run.result.limits })}. This is scoped review, not a correctness certificate.`
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
      if (run.role === 'format') throw Error('Format-only stage has no tool authority');
      const reading = ['read', 'glob', 'grep'];
      if (run.pending.size && (!reading.includes(input.tool) || [...run.pending.values()].some(p => !reading.includes(p.tool))))
        throw Error('Mutation/check tools must execute sequentially; source reads may run together');
      const before = run.capture();
      if (before.status !== 'captured' || before.snapshotSha256 !== run.expected)
        throw Error('Worktree changed outside the preceding native tool; workflow stopped to preserve user work');
      run.pending.set(input.callID, { tool: input.tool, callID: input.callID, before: before.snapshotSha256, startedAt: Date.now() });
    },
    'tool.execute.after': async (input, output) => {
      const run = children.get(input.sessionID);
      if (!run) return;
      const pending = run.pending.get(input.callID);
      if (!pending) throw Error('Missing native before-tool evidence');
      const after = run.capture();
      if (after.status !== 'captured') throw Error(after.error);
      const event = { ...pending, after: after.snapshotSha256, completedAt: Date.now(), args: input.args,
        output: output.output, exit: output.metadata?.exit, state: 'completed' };
      run.log.push(event); run.pending.delete(input.callID);
      if (run.probeFiles && productionDiff(after, run.probeFiles) !== run.probeProduction) {
        run.violation = 'Production changed during reproduction; no repair admitted';
        run.save('reproduction-violation.json', after);
        throw Error(run.violation);
      }
      if (run.role === 'reviewer' && after.snapshotSha256 !== run.expected) throw Error('Reviewer mutated worktree');
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
          await context.ask({ permission: 'task', patterns: [run.agent, 'harness-task-reviewer'], always: [],
            metadata: { description: 'Explicit task implementation, separate review and at most two repairs' } });
          const parent = await get(context.sessionID);
          const agents = await data(client.app.agents());
          const reviewer = agents.find(a => a.name === 'harness-task-reviewer');
          if (!reviewer || !Array.isArray(reviewer.permission)) throw Error('Native reviewer permissions unavailable');
          const author = agents.find(a => a.name === run.agent);
          if (!author || !Array.isArray(author.permission)) throw Error('Native author permissions unavailable');
          if ([...reviewer.permission, ...author.permission, ...(parent.permission ?? [])]
            .some(rule => rule.pattern?.replaceAll('\\', '/').startsWith(directory.replaceAll('\\', '/') + '/')))
            throw Error('Project-absolute permission patterns cannot be relocated safely; use workspace-relative rules for an isolated task');
          const rules = [...reviewer.permission, ...(parent.permission ?? [])];
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
          const seeded = run.capture();
          if (seeded.status !== 'captured' || seeded.diff !== initial.diff || seeded.task !== initial.task)
            throw Error('Task worktree does not match captured user input');
          run.log = []; run.pending = new Map(); run.expected = seeded.snapshotSha256;
          const controller = new AbortController();
          const sessions = new Map();
          let cancellation;
          const cancel = () => {
            controller.abort();
            cancellation ??= Promise.all([...sessions.values()].map(id => data(client.session.abort({ path: { id }, query: { directory: executionDirectory } }))));
            cancellation.catch(() => {}); // Awaited below; cancellation failure is never a success.
          };
          const remaining = run.budget - (Date.now() - run.startedAt);
          run.cancel = cancel;
          context.abort.addEventListener('abort', cancel, { once: true });
          if (context.abort.aborted || remaining <= 0) cancel();
          run.checkActive = () => {
            if (controller.signal.aborted) throw Error('Task cancelled or total time budget exhausted');
            if (run.violation) throw Error(run.violation);
          };
          const prompt = async (role, text, schema) => {
            run.checkActive();
            if (run.capture().snapshotSha256 !== run.expected) throw Error('External worktree change between stages');
            let id = sessions.get(role);
            if (!id) {
              const permission = [...(parent.permission ?? []), { permission: 'harness_task', pattern: '*', action: 'deny' }];
              if (role === 'reviewer') for (const p of ['edit', 'bash', 'task', 'todowrite']) permission.push({ permission: p, pattern: '*', action: 'deny' });
              const session = await data(client.session.create({ query: { directory: executionDirectory }, body: { parentID: context.sessionID, title: `Harness task: ${role}`, permission } }));
              id = session.id; sessions.set(role, id); children.set(id, run);
              run.checkActive();
            }
            run.role = role;
            await context.metadata({ title: `Harness task: ${role}`, metadata: { artifacts, sessions: Object.fromEntries(sessions) } });
            return data(client.session.prompt({ path: { id }, query: { directory: executionDirectory }, body: { model: run.model, variant: run.variant,
              agent: role === 'author' ? run.agent : 'harness-task-reviewer',
              parts: [{ type: 'text', text: text + (schema ? '\nReturn only a JSON object matching this schema. No markdown or universal correctness verdict:\n' + JSON.stringify(schema) : '') }] } }));
          };
          const format = async payload => {
            run.checkActive();
            const created = await data(client.session.create({ query: { directory: executionDirectory }, body: {
              parentID: context.sessionID, title: 'Harness task: format correction',
              permission: [{ permission: '*', pattern: '*', action: 'deny' }],
            } }));
            const key = `format-${sessions.size}`;
            sessions.set(key, created.id); children.set(created.id, run); run.role = 'format';
            const toolIDs = await data(client.tool.ids({ query: { directory: executionDirectory } }));
            const result = await data(client.session.prompt({ path: { id: created.id }, query: { directory: executionDirectory }, body: {
              model: run.model, variant: run.variant, agent: 'harness-task-reviewer',
              tools: Object.fromEntries(toolIDs.map(name => [name, false])),
              parts: [{ type: 'text', text: 'FORMAT_ONLY: Correct the already received response using only the schema and specific validation error below. No tools, files, investigation, new findings or invented meaning. Preserve all obligations and uncertainty. Copy obligations, coverageLost, finding IDs/classifications/basis/expected and disposition decisions exactly, without paraphrasing. Preserve every unverified string, optionally moving provenance-only strings to evidenceLimitations. Never replace missing semantic content with empty arrays or confirmed expectations. If meaning is missing and cannot be recovered from the response, return the unchanged response so validation fails. Return JSON only.\n' + JSON.stringify(payload) }],
            } }));
            run.checkActive();
            run.save(`${key}-messages.json`, await data(client.session.messages({ path: { id: created.id }, query: { directory: executionDirectory } })));
            return result;
          };
          const verificationScope = proposed => {
            const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: executionDirectory, encoding: 'utf8' });
            if (listed.status !== 0) throw Error('Cannot determine host verification scope');
            const writableCandidate = p => {
              if (!verificationPath(p)) return false;
              // Reject symlink parents/targets: names alone cannot grant access.
              let cursor = executionDirectory;
              for (const part of p.split('/')) {
                cursor = path.join(cursor, part);
                try { if (fs.lstatSync(cursor).isSymbolicLink()) return false; }
                catch (e) { if (e.code !== 'ENOENT') throw e; }
              }
              const match = (value, pattern) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(value);
              for (const name of [p, path.join(executionDirectory, p)]) {
                let action;
                for (const rule of [...author.permission, ...(parent.permission ?? [])])
                  if (['*', 'edit'].includes(rule.permission) && match(name, rule.pattern)) action = rule.action;
                if (action === 'deny') return false;
              }
              return true; // Native allow/ask remains authoritative at execution.
            };
            const allowed = [...new Set([...listed.stdout.split('\0'), ...proposed].filter(writableCandidate))];
            return { allowed, rejected: proposed.filter(p => !allowed.includes(p)) };
          };
          try {
            const result = await runWorkflow({
              capture: run.capture, save: run.save, checkActive: run.checkActive,
              setProbe: files => { run.probeFiles = files; run.probeProduction = files ? productionDiff(run.capture(), files) : null; },
              aborted: () => controller.signal.aborted, events: () => run.log, prompt, format, verificationScope,
              messages: role => data(client.session.messages({ path: { id: sessions.get(role) }, query: { directory: executionDirectory } })),
            }, workflowOptions);
            if (cancellation) await cancellation;
            const terminal = run.capture();
            run.save('terminal.json', terminal);
            if (terminal.status === 'captured') run.save('terminal.patch', terminal.diff);
            run.result = result;
            return JSON.stringify({ ...result, artifacts, executionDirectory, sessions: Object.fromEntries(sessions),
              notice: 'reviewed_delivery is scoped model review plus observed checks, not a correctness certificate; independent evaluation remains separate' });
          } finally {
            context.abort.removeEventListener('abort', cancel); run.state = 'finished';
            for (const id of sessions.values()) children.delete(id);
          }
        },
      },
    },
  };
}
