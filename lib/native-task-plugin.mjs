import {investigationEnabled, investigationInstruction, investigationTestPath, investigationDeliverySummary, prepareInvestigation, integrateInvestigation} from './native-task-investigation.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { reviewContext } from './native-review-context.mjs';
import { prepareObservations } from './native-task-observations.mjs';
import { runWorkflow, nativePermissionKind, finalChecks } from './native-task-workflow.mjs';

// Full artifacts remain unchanged. Native tool output must not repeat whole
// test hunks and command logs until OpenCode truncates the delivery paths.
export function compactTaskResult(result, details = {}) {
  const row = ({ output, before, after, key, requirementSource, ...rest }) => rest;
  const { initialSummary, preparationSummary, ...summary } = result;
  if (result.observations) {
    summary.observations = { ...result.observations };
    for (const key of ['checks', 'latestChecks', 'unresolvedFailures', 'unclassifiedFailures'])
      if (result.observations[key]) summary.observations[key] = result.observations[key].map(row);
    if (result.observations.testChanges)
      summary.observations.testChanges = result.observations.testChanges.map(({ path }) => ({ path }));
    if (result.observations.addedTests)
      summary.observations.addedTests = result.observations.addedTests.map(({ path }) => ({ path }));
  }
  const notice = 'Command exits are observations, not certification of task correctness. Full explanations, outputs and test diffs remain in result.json and tool-events.json under artifacts.';
  const projected = { ...summary, ...details, notice };
  if (Buffer.byteLength(JSON.stringify(projected)) <= 16000) return projected;
  return { revision: result.revision, status: result.status, repairs: result.repairs,
    ...details, terminalPatch: result.terminalPatch ?? null,
    terminationVerified: result.termination?.verified === true,
    remainingCount: result.remaining?.length ?? 0, limitationCount: result.limits?.length ?? 0,
    completedCommandCount: result.completedCommands?.length ?? 0,
    detailOmitted: 'Large report: inspect result.json for all checks, failures and remaining work.', notice };
}

export function taskResultText(result, details) {
  const summary = compactTaskResult(result, details);
  const lines = [`Native task workflow: ${summary.status}.`,
    `Delivery worktree: ${details.executionDirectory}.`,
    `Terminal patch: ${result.terminalPatch ?? 'unavailable; inspect termination evidence'}.`,
    `Full report and tool outputs: ${details.artifacts}.`,
    'Original checkout unchanged by workflow transfer.'];
  if (summary.detailOmitted) lines.push(summary.detailOmitted);
  else {
    lines.push('Successful native commands on the final captured state (exit 0; not a correctness certificate):',
      ...(summary.completedCommands?.length ? summary.completedCommands.map(c => `- ${JSON.stringify(c.command)}`) : ['- None observed.']),
      `Remaining work: ${JSON.stringify(summary.remaining ?? [])}.`,
      `Limitations: ${JSON.stringify(summary.limits ?? [])}.`);
    for (const c of summary.observations?.latestChecks ?? []) {
      if (c.interpretation?.status === 'supported') continue;
      lines.push(`Project command ${JSON.stringify(c.command)} (cwd ${JSON.stringify(c.workdir)}): ${c.execution?.status ?? 'completion unconfirmed'}${c.exit === null ? '' : `; exit ${c.exit}`}; ${c.current ? 'current captured state' : 'not current verification'}. Internal runner results not interpreted by a supported adapter; task completeness remains unverified.`);
    }
    if (summary.authorSummary) lines.push(`Author explanation (not independent verification):\n${summary.authorSummary}`);
  }
  return lines.join('\n');
}

// Native sessions in another worktree load a separate plugin instance. The
// module-level registry connects only explicitly created workflow children.
const armed = new Map(), children = new Map();
const readingTool = tool => ['read', 'glob', 'grep'].includes(tool);
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
  const {sensitivityEnabled} = await import('./native-sensitivity.mjs');
  const senseTools = {};
  if (sensitivityEnabled()) {
    const {tool} = await import('@opencode-ai/plugin');
    senseTools.harness_sense = tool({
      description: 'Check whether project tests distinguish real Stryker changes to recently changed JS/TS production code. Returns baseline, concrete mutation diffs and actual test output to this session. Before dismissing a meaningful survivor as equivalent, try a small public API scenario on both implementations using its replay example. Retain required regressions in the normal suite; no difference found is not proof of equivalence. Inspect the task contract independently of the mutation. Up to 8 variants; shared task diagnostic budget 180 seconds. Available in an active direct /harness-task author session.',
      args: {
        path: tool.schema.string().optional().describe('Relative production file or changed (default).'),
        variant: tool.schema.string().optional().describe('Reference returned with a previous diff in this workflow. Reruns fresh baseline and only this variant with current tests; production file must be unchanged. Use the returned replay example.'),
        check: tool.schema.string().optional().describe('Existing npm check: test (default), npm test, npm run test, test:unit, or npm run test:unit. No extra flags or shell chains.'),
      },
      async execute(_args, context) {
        const run = children.get(context.sessionID);
        const pending = [...(run?.pending?.values() ?? [])].find(p => p.tool === 'harness_sense');
        if (!run?.sense || !pending?.sensitivity) throw Error('harness_sense requires an enabled direct task author session');
        return run.sense.execute(pending.sensitivity, context);
      },
    });
  }
  if (investigationEnabled()) {
    const {tool} = await import('@opencode-ai/plugin');
    senseTools.harness_investigate = tool({
      description: 'One optional focused public-API investigation by the same model in a separate copy. Returns actual test patch and command evidence. Use investigate with question/location/reason, then accept with contract rationale or decline. No production edits or recursive delegation; shared task deadline and diagnostic budget.',
      args: {
        action: tool.schema.enum(['investigate', 'accept', 'decline']),
        question: tool.schema.string().optional(), location: tool.schema.string().optional(),
        reason: tool.schema.string().optional(), rationale: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const run = children.get(context.sessionID);
        if (!run?.investigate || run.investigator) throw Error('Investigation is available only to the enabled main author');
        return run.investigate(args, context);
      },
    });
  }
  return {
    'command.execute.before': async (input) => {
      if (input.command !== 'harness-task') return;
      if (input.arguments.trim()) throw Error('/harness-task takes no arguments; supply HARNESS_TASK_FILE before launch');
      if (armed.has(input.sessionID)) throw Error('This session already invoked a workflow; use a new native session');
      const budget = Number(process.env.HARNESS_TASK_TIMEOUT_MS ?? 600000);
      if (!Number.isSafeInteger(budget) || budget < 1000 || budget > 3600000) throw Error('HARNESS_TASK_TIMEOUT_MS must be 1000..3600000');
      const strategy = process.env.HARNESS_TASK_STRATEGY ?? 'D';
      if (!['D', 'check-first', 'direct'].includes(strategy)) throw Error('HARNESS_TASK_STRATEGY must be D, check-first or direct');
      const {componentFlags} = await import('./native-project-config.mjs');
      const components = componentFlags();
      const {sensitivityEnabled} = await import('./native-sensitivity.mjs');
      const sensitivity = sensitivityEnabled();
      const investigation = investigationEnabled();
      const commandHints = process.env.HARNESS_TASK_COMMAND_HINTS ?? '0';
      if (!['0', '1'].includes(commandHints)) throw Error('HARNESS_TASK_COMMAND_HINTS must be 0 or 1');
      if (investigation && strategy !== 'direct') throw Error('Investigation requires direct');
      if (sensitivity && strategy !== 'direct') throw Error('Sensitivity requires direct');
      if ((components.A || components.B) && strategy !== 'direct') throw Error('Project context/check components require direct');
      const run = { state: 'armed', taskFile: process.env.HARNESS_TASK_FILE, startedAt: Date.now(), budget, strategy, components, sensitivity, investigation, commandHints: commandHints === '1' };
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
      if (!run || run.sealed) return;
      const recorded = run.log.find(e => e.callID === part.callID);
      if (['pending','running'].includes(part.state.status)) {
        if (!recorded) run.liveTools.add(part.callID);
        return;
      }
      if (part.state.status === 'completed' && recorded?.state === 'error') {
        stopRun(run, 'tool_state_unknown', 'Conflicting terminal native tool events', {callID:part.callID, tool:part.tool});
        return;
      }
      run.liveTools.delete(part.callID);
      if (part.state.status === 'error') {
        const kind = nativePermissionKind(part.state.error);
        const facts = {callID:part.callID, tool:part.tool, args:part.state.input, error:part.state.error};
        // Reject always wins, even if it follows an automatic error for the
        // same call. Identical redelivery must not spend the allowance again.
        if (kind === 'user_reject') stopRun(run, 'permission_denied', 'Native permission boundary rejected a tool; no evidence correction admitted', facts);
        if (recorded) {
          if (recorded.state !== 'error' || recorded.tool !== part.tool || recorded.output !== part.state.error || JSON.stringify(recorded.nativeTime) !== JSON.stringify(part.state.time) || JSON.stringify(recorded.args) !== JSON.stringify(part.state.input))
            stopRun(run, 'tool_state_unknown', 'Conflicting terminal native tool events', facts);
          return;
        }
        const pending = run.pending.get(part.callID);
        const after = run.capture();
        if (after.status !== 'captured') { stopRun(run, 'capture_failed', after.error); return; }
        const rejected = run.rejectedBefore.get(part.callID);
        run.rejectedBefore.delete(part.callID);
        const unchangedRejection = !pending && rejected === run.expected && after.snapshotSha256 === run.expected;
        // OpenCode 1.18.26 native bash asks for permissions before shell.env
        // and process spawn. Require the matching before hook, and exclude any
        // error after that preflight. No attempt to infer a path or winning rule.
        const preflight = kind === 'automatic' && part.tool === 'bash' && pending?.tool === 'bash' && pending.executionAdmitted === false;
        // These native file tools finish their operation before publishing the
        // terminal error; they do not leave a shell process to reconcile. Use
        // lifecycle evidence, not a catalogue of read/edit failure messages.
        const fileTool = readingTool(part.tool) || ['edit','apply_patch'].includes(part.tool);
        // A native pending/running part can still be waiting in our before
        // hook. Only an identified queued call is known not to have executed.
        const liveExecution = [...run.liveTools].some(id => !run.toolQueue.some(ticket => ticket.callID === id));
        // OpenCode 1.18.26 glob awaits scoped ripgrep: process close/finalization
        // precedes rejection and the terminal event (including spawn failure).
        // A completed read/glob/grep error can coexist with already admitted source
        // reads. They cannot mutate the worktree, and queued writers still
        // wait until every pending read finishes. Unknown/live execution is
        // not covered; edit/apply_patch errors keep the exclusive condition.
        const onlyAdmittedReads = readingTool(part.tool) &&
          [...run.pending.values()].every(p => readingTool(p.tool) && p.before === run.expected) &&
          [...run.liveTools].every(id => run.toolQueue.some(ticket => ticket.callID === id) || readingTool(run.pending.get(id)?.tool));
        const time = part.state.time;
        const completedFileError = !run.cancelled && !run.timedOut && !run.terminalReason &&
          Date.now() - run.startedAt < run.budget && kind === 'unknown' && fileTool && pending?.tool === part.tool &&
          !['Cancelled', 'Tool execution aborted'].includes(part.state.error) &&
          (pending.admittedArgs === undefined || JSON.stringify(pending.admittedArgs) === JSON.stringify(part.state.input)) &&
          Number.isFinite(time?.start) && Number.isFinite(time?.end) && time.end >= time.start && time.end >= pending.startedAt &&
          pending.before === run.expected && after.snapshotSha256 === run.expected &&
          ((run.pending.size === 1 && !liveExecution) || onlyAdmittedReads);
        if (completedFileError && onlyAdmittedReads)
          for (const [id, sibling] of run.pending) if (id !== part.callID) sibling.readErrorSnapshot = run.expected;
        const unexpectedChange = (!pending || preflight || fileTool) && after.snapshotSha256 !== run.expected;
        if (unexpectedChange) stopRun(run, 'scope_violation', 'Worktree changed before native tool admission; workflow stopped', {callID:part.callID});
        const notExecuted = preflight && pending.before === run.expected && !unexpectedChange;
        const continuation = notExecuted && !run.permissionContinuations.length && !run.terminalReason &&
          !run.cancelled && !run.timedOut && Date.now() - run.startedAt < run.budget &&
          run.pending.size === 1 && !liveExecution;
        if (continuation) {
          run.permissionContinuations.push({sessionID:part.sessionID, deniedCallID:part.callID, permittedAt:Date.now()});
          run.save('permission-continuations.json', run.permissionContinuations);
        } else if (!run.cancelled && kind !== 'unknown') {
          if (!run.terminalReason) run.save('permission-violation.json', facts);
          stopRun(run, 'permission_denied', 'Native permission boundary rejected a tool; no further continuation admitted', facts);
        } else if (!run.cancelled && !unchangedRejection && !completedFileError) {
          stopRun(run, 'tool_error', 'Native tool error has unconfirmed execution or state', facts);
        }
        run.log.push({ ...(unchangedRejection ? { stateObservation: { basis: 'host-rejected-before-execution', snapshot: run.expected } } : {}), scopeViolation: unexpectedChange, ...(pending ?? {tool: part.tool, callID: part.callID, before: null}), permissionDenied: kind !== 'unknown', denialKind: kind,
          ...(notExecuted ? {execution:'native-bash-permission-preflight'} : {}), after: after.snapshotSha256, completedAt: Date.now(),
          args: part.state.input, output: part.state.error, nativeTime: time, state: 'error' });
        run.pending.delete(part.callID);
        run.hintAdmissions?.delete(part.callID);
        if (!unexpectedChange) run.expected = after.snapshotSha256;
        run.save('tool-events.json', run.log);
        run.wakeTools();
      }
    },
    'shell.env': async (input, output) => {
      const run = children.get(input.sessionID);
      if (!run || run.sealed) return;
      run.checkActive();
      const pending = run.pending.get(input.callID);
      if (!pending || pending.tool !== 'bash') {
        stopRun(run, 'tool_state_unknown', 'Native shell has no matching admitted bash call');
        throw Error(run.violation);
      }
      pending.executionAdmitted = true;
      if (run.hints) run.hintAdmissions.set(input.callID, run.hints.before(pending.admittedArgs, input, output));
    },
    'experimental.chat.system.transform': async (input, output) => {
      const run = children.get(input.sessionID);
      if (run?.investigation) output.system.push(`Remaining shared task time: ${Math.max(0, run.budget - (Date.now() - run.startedAt))} ms. All work, including integration, must finish within this deadline.`);
      if (!run?.permissionContinuations.length) return;
      run.checkActive();
      output.system.push(`Native bash call ${run.permissionContinuations[0].deniedCallID} was forbidden and was not executed. Its actual tool error remains in this session. Permissions have not changed. Do not repeat the forbidden operation through another path or tool. Continue only independent permitted work; if the task needs the forbidden resource, report that limitation without substituting content or claiming it was delivered. Project root: ${run.executionDirectory}. Another policy denial stops this workflow.`);
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
        ? taskResultText(run.result, { executionDirectory: run.executionDirectory, artifacts: run.artifacts })
        : 'Native task workflow incomplete: no completed workflow result is available. See native tool/error events.';
    },
    'chat.message': async (input, output) => {
      const run = armed.get(input.sessionID);
      if (!run || run.state !== 'armed') return;
      run.model = output.message.model; run.variant = output.message.variant ?? input.variant;
      run.agent = output.message.agent;
    },
    'tool.execute.before': async (input, output) => {
      const parent = armed.get(input.sessionID);
      if (parent && (input.tool !== 'harness_task' || parent.state !== 'armed'))
        throw Error('The task command parent may only invoke its workflow tool once');
      const run = children.get(input.sessionID);
      if (!run) return;
      run.checkActive();
      const conflicts = () => run.pending.size && (!readingTool(input.tool) ||
        [...run.pending.values()].some(p => !readingTool(p.tool)));
      // OpenCode may submit several calls in one response. Wait before native
      // admission rather than force the author to repeat a rejected operation.
      // FIFO writers cannot be overtaken by a later read. Each admitted call
      // still captures its own actual pre-state; no queued call has permission
      // or execution authority until this hook finishes.
      if (conflicts() || run.toolQueue.length) {
        const ticket = {callID:input.callID};
        run.toolQueue.push(ticket);
        try {
          while (run.toolQueue[0] !== ticket || run.pending.size) {
            run.checkActive();
            await new Promise(resolve => run.toolWaiters.add(resolve));
          }
          run.checkActive();
        } finally {
          run.toolQueue.splice(run.toolQueue.indexOf(ticket), 1);
          run.wakeTools();
        }
      }
      run.checkActive();
      const before = run.capture();
      if (before.status !== 'captured' || before.snapshotSha256 !== run.expected) {
        stopRun(run, 'scope_violation', 'Worktree changed outside the preceding native tool; workflow stopped to preserve user work', {callID:input.callID});
        throw Error(run.violation);
      }
      if (run.investigator) {
        if (['task', 'harness_task', 'harness_investigate'].includes(input.tool)) throw Error('Recursive delegation is prohibited');
        const names = input.tool === 'apply_patch'
          ? [...String(output.args.patchText ?? '').matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map(m => m[1])
          : ['edit', 'write'].includes(input.tool) ? [output.args.filePath] : [];
        if (['edit', 'write', 'apply_patch'].includes(input.tool) && (!names.length || names.some(n => {
          const relative = path.relative(run.executionDirectory, path.resolve(run.executionDirectory, n ?? ''));
          return relative.startsWith('..') || path.isAbsolute(relative) || !investigationTestPath(relative);
        }))) throw Error('Investigator may edit only project test files');
      }
      const componentCheck = run.feedback?.before(input, output, before.snapshotSha256);
      const sensitivity = run.sense?.before(input, output, before.snapshotSha256);
      run.pending.set(input.callID, { tool: input.tool, callID: input.callID, before: before.snapshotSha256, startedAt: Date.now(), ...(output?.args ? {admittedArgs: structuredClone(output.args)} : {}), ...(componentCheck ? {componentCheck} : {}), ...(sensitivity ? {sensitivity} : {}), ...(input.tool === 'bash' ? {executionAdmitted:false} : {}) });
    },
    'tool.execute.after': async (input, output) => {
      const run = children.get(input.sessionID);
      if (!run || run.sealed) return;
      const pending = run.pending.get(input.callID);
      if (!pending) throw Error('Missing native before-tool evidence');
      const after = run.capture();
      if (after.status !== 'captured') throw Error(after.error);
      if (run.investigator && !run.testOnly()) stopRun(run, 'scope_violation', 'Investigator changed non-test files; result rejected');
      await run.feedback?.after(input, output, pending, after.snapshotSha256);
      const sensitivity = run.sense?.after(input, output, pending, after.snapshotSha256);
      if (sensitivity?.terminationVerified === false)
        stopRun(run, 'diagnostic_termination_unknown', 'Sensitivity runner did not confirm diagnostic child termination', {callID: input.callID});
      const changedDuringReadError = pending.readErrorSnapshot && after.snapshotSha256 !== pending.readErrorSnapshot;
      if (changedDuringReadError) stopRun(run, 'scope_violation', 'Worktree changed while admitted reads completed after a native read error', {callID:input.callID});
      const event = { ...pending, ...(changedDuringReadError ? {scopeViolation:true} : {}), after: after.snapshotSha256, completedAt: Date.now(), args: input.args,
        output: output.output, exit: output.metadata?.exit, signal: output.metadata?.signal ?? null,
        timeout: output.metadata?.timeout ?? null, state: 'completed' };
      run.log.push(event); run.pending.delete(input.callID);
      run.expected = after.snapshotSha256;
      run.save('tool-events.json', run.log);
      if (run.hints) {
        const context = run.hints.after(event, run.hintAdmissions.get(input.callID));
        run.hintAdmissions.delete(input.callID);
        if (context) output.output += context;
      }
      run.wakeTools();
      const continuation = run.permissionContinuations[0];
      if (continuation && !continuation.continuedWith) {
        continuation.continuedWith = {callID:input.callID, completedAt:event.completedAt};
        run.save('permission-continuations.json', run.permissionContinuations);
      }

    },
    tool: {
      ...senseTools,
      harness_task: {
        description: 'Execute an explicitly armed /harness-task workflow via native sessions. No arguments. Unavailable outside that command.',
        args: {},
        async execute(_args, context) {
          const run = armed.get(context.sessionID);
          if (!run || run.state !== 'armed' || !run.model || !run.agent) throw Error('Invoke /harness-task explicitly first');
          run.state = 'running';
          if (!path.isAbsolute(run.taskFile ?? '')) throw Error('HARNESS_TASK_FILE must name an absolute original task file');
          await context.ask({ permission: 'task', patterns: [run.agent], always: [],
            metadata: { description: run.strategy === 'direct' ? 'Experimental complete task in one native author pass with conditional state observations' : run.strategy === 'check-first' ? 'Experimental regression preparation and implementation in one native author session sharing one deadline' : 'Experimental task implementation and up to three factual corrective replies in one session' } });
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
          run.log = []; run.pending = new Map(); run.rejectedBefore = new Map(); run.liveTools = new Set();
          run.toolQueue = []; run.toolWaiters = new Set();
          run.wakeTools = () => { for (const resolve of run.toolWaiters) resolve(); run.toolWaiters.clear(); };
          run.permissionContinuations = []; run.expected = seeded.snapshotSha256;
          const controller = new AbortController();
          const sessions = new Map();
          const cancellations = new Map();
          const sessionRuns = new Map();
          const diagnosticBudget = {spentMs: 0};
          const cancel = () => {
            run.cancelled = true;
            controller.abort();
            run.wakeTools();
            for (const state of sessionRuns.values()) state.wakeTools();
            for (const id of sessions.values()) if (!cancellations.has(id)) {
              const pending = data(client.session.abort({ path: { id }, query: { directory: sessionRuns.get(id)?.executionDirectory ?? executionDirectory } }));
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
          if (run.commandHints) {
            const {createCommandHints} = await import('./native-command-hints.mjs');
            run.hintAdmissions = new Map();
            run.hints = createCommandHints({directory: executionDirectory, originalDirectory: directory, rules, save: run.save,
              active: () => !run.sealed && !run.terminalReason && !controller.signal.aborted && Date.now() - run.startedAt < run.budget});
          }
          let componentContext = '';
          if (run.sensitivity) {
            const {createSensitivity, sensitivityInstruction} = await import('./native-sensitivity.mjs');
            run.sense = createSensitivity({directory: executionDirectory, rules, base, save: run.save, checkActive: run.checkActive, remainingMs: () => run.budget - (Date.now() - run.startedAt), signal: controller.signal, budget: diagnosticBudget});
            componentContext = sensitivityInstruction + '\n';
          }
          if (run.components.A || run.components.B) {
            const {createProjectFeedback, componentInstructions} = await import('./native-project-feedback.mjs');
            run.feedback = createProjectFeedback({directory: executionDirectory, rules, flags: run.components, save: run.save, checkActive: run.checkActive});
            componentContext += componentInstructions(run.components) + '\n';
            run.save('components.json', run.components);
          }
          if (run.investigation) componentContext += investigationInstruction + '\n';
          const prompt = async (role, text, schema, state = run) => {
            state.checkActive();
            if (state.capture().snapshotSha256 !== state.expected) throw Error('External worktree change between stages');
            let id = sessions.get(role);
            if (!id) {
              const permission = [...(parent.permission ?? []), { permission: 'harness_task', pattern: '*', action: 'deny' }];
              permission.push({ permission: 'task', pattern: '*', action: 'deny' });
              if (state.investigator) permission.push({permission: 'harness_investigate', pattern: '*', action: 'deny'});
              const session = await data(client.session.create({ query: { directory: state.executionDirectory }, body: { parentID: context.sessionID, title: `Harness task: ${role}`, permission } }));
              id = session.id; sessions.set(role, id); children.set(id, state); sessionRuns.set(id, state);
              if (controller.signal.aborted) cancel(); // Includes create/abort races.
              run.checkActive();
            }
            state.role = role;
            await context.metadata({ title: `Harness task: ${role}`, metadata: { artifacts, sessions: Object.fromEntries(sessions) } });
            run.checkActive();
            const projectContext = run.strategy !== 'D'
              ? `Use repository-relative filePath values for native read and edit, such as README.md or src/module.mjs. For native Bash commands at the project root, set workdir to "."; for a project subdirectory, use its relative path. Native glob and grep use the project root when their optional path is omitted. The native current directory is already this task's isolated delivery worktree. Use these relative forms instead of copying the random task identifier into tool arguments. The surrounding harness artifact directory is not a project root, and outside-directory permissions remain unchanged. The complete original task is included below.\n`
              : '';
            return data(client.session.prompt({ path: { id }, query: { directory: state.executionDirectory }, body: { model: run.model, variant: run.variant,
              agent: run.agent,
              parts: [{ type: 'text', text: projectContext + (state.investigator ? '' : componentContext) + (run.investigation ? `Remaining task time: ${Math.max(0, run.budget - (Date.now() - run.startedAt))} ms; remaining shared diagnostic time: ${Math.max(0, 180000 - diagnosticBudget.spentMs)} ms.\n` : '') + text + (schema ? '\nReturn only a JSON object matching this schema. No markdown or universal correctness verdict:\n' + JSON.stringify(schema) : '') }] } }));
          };
          if (run.investigation) run.investigate = async (args, toolContext) => {
            run.checkActive();
            const reply = value => JSON.stringify(value);
            if (args.action !== 'investigate') {
              const delivery = run.investigationResult;
              if (!delivery || delivery.disposition) return reply({accepted: false, reason: 'No undecided investigation result'});
              if (args.action === 'decline') { delivery.disposition = 'declined'; delivery.rationale = args.rationale ?? ''; run.save('investigation-result.json', delivery); return reply({accepted: false, reason: 'Author declined the proposed test'}); }
              if (!args.rationale?.trim()) return reply({accepted: false, reason: 'Explain the expected result against the original task before accepting'});
              if (!delivery.usable) return reply({accepted: false, reason: 'No verified test-only patch available'});
              const applied = integrateInvestigation({directory: executionDirectory, capture: run.capture, expected: delivery.authorSnapshot, patch: delivery.patch});
              delivery.disposition = applied.accepted ? 'accepted' : 'conflict'; delivery.rationale = args.rationale; delivery.integration = applied;
              run.save('investigation-result.json', delivery); return reply({...applied, notice: 'Finish the original task and run relevant checks after your final edit.'});
            }
            if (run.investigationUsed) return reply({status: 'unavailable', reason: 'One investigator maximum per task-run'});
            if (![args.question, args.location, args.reason].every(x => typeof x === 'string' && x.trim() && x.length <= 4000)) return reply({status: 'unavailable', reason: 'Provide a short question, location and relation to the original task'});
            if (run.budget - (Date.now() - run.startedAt) < 120000) return reply({status: 'unavailable', reason: 'Less than 120 seconds remain for investigation and integration'});
            await toolContext.ask({permission: 'harness_investigate', patterns: ['investigate'], always: [], metadata: {description: args.question}});
            run.checkActive(); run.investigationUsed = true;
            const prior = run.capture(); run.save('before-investigation.json', prior); run.save('before-investigation.patch', prior.diff);
            const delivery = {request: args, authorSnapshot: prior.snapshotSha256, model: run.model, variant: run.variant, startedAt: Date.now(), usable: false, patch: '', commands: []};
            run.investigationResult = delivery;
            let child;
            try {
              const copy = await prepareInvestigation({directory: executionDirectory, artifacts, base, rules, active: run.checkActive});
              child = {...run, investigator: true, investigate: undefined, sense: undefined, feedback: undefined,
                executionDirectory: copy.directory, capture: copy.capture, expected: copy.initial.snapshotSha256, testOnly: copy.testOnly,
                pending: new Map(), rejectedBefore: new Map(), liveTools: new Set(), toolQueue: [], toolWaiters: new Set(), log: [], permissionContinuations: [],
                save: (name, value) => run.save('investigation-' + name, value)};
              child.wakeTools = () => { for (const resolve of child.toolWaiters) resolve(); child.toolWaiters.clear(); };
              child.cancel = () => { child.wakeTools(); cancel(); };
              child.checkActive = () => { run.checkActive(); if (child.violation) throw Error(child.violation); };
              if (run.sensitivity) {
                const {createSensitivity} = await import('./native-sensitivity.mjs');
                child.sense = createSensitivity({directory: copy.directory, rules, base: copy.base, save: child.save, checkActive: child.checkActive, remainingMs: () => run.budget - (Date.now() - run.startedAt), signal: controller.signal, budget: diagnosticBudget});
              }
              const result = await prompt('investigator', `Investigate this concrete behavior question and deliver only relevant project test changes, or explain why no assertion is justified. Production, dependencies, configuration and docs are the main author's responsibility. Use the public API, original requirement and existing tests to justify expected results. An import/setup failure is not a meaningful assertion failure. Agreement on a few probes does not prove equivalence; a difference from a mutation does not prove the source correct. No mutation score or mandatory number of tests. No recursive delegation. You have a separate copy of the current implementation and tests. Run ordinary project checks. If harness_sense is enabled you may obtain fresh variants here; references from another session are invalid. Return actual work, commands, contract basis and limitations in prose; the host captures your test patch.\nOriginal task (unchanged):\n${initial.task}\nAuthor's question (hypothesis, not a requirement):\n${JSON.stringify(args)}\nCurrent author diff:\n${prior.diff}`, undefined, child);
              await child.sense?.settle();
              child.save('messages.json', await data(client.session.messages({path: {id: sessions.get('investigator')}, query: {directory: copy.directory}})));
              delivery.explanation = (result.parts ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n');
              delivery.finish = result.info?.finish; delivery.commands = child.log;
              if (result.info?.error || result.info?.finish !== 'stop' || child.pending.size || child.liveTools.size || child.terminalReason) throw Error('Investigation execution did not complete normally');
              delivery.patch = copy.testPatch(); delivery.usable = true;
              run.save('investigation-tests.patch', delivery.patch);
            } catch (error) { delivery.limitation = error.message; }
            finally { if (child) { await child.sense?.settle(); child.sealed = true; } }
            delivery.elapsedMs = Date.now() - delivery.startedAt;
            delivery.remainingTaskMs = Math.max(0, run.budget - (Date.now() - run.startedAt));
            delivery.remainingDiagnosticMs = Math.max(0, 180000 - diagnosticBudget.spentMs);
            run.save('investigation-result.json', delivery);
            return reply(investigationDeliverySummary(delivery));
          };
          try {
            const result = await runWorkflow({
              capture: run.capture, save: run.save, checkActive: run.checkActive,
              aborted: () => controller.signal.aborted, terminalReason: () => run.terminalReason, events: () => run.log, prompt,
              observe: snapshot => { if (run.pending.size || run.toolQueue.length) throw Error('Native processes have unresolved tool events'); return observe(run.log, snapshot); },
              messages: role => data(client.session.messages({ path: { id: sessions.get(role) }, query: { directory: executionDirectory } })),
            }, { ...workflowOptions, strategy: run.strategy, attentionPass: workflowOptions.attentionPass === true || process.env.HARNESS_TASK_EXTRA_ATTENTION === '1' });
            // The active prompt has settled. Confirm native tools are terminal
            // before publishing a patch, including when abort returned an error.
            await run.sense?.settle();
            const native = await Promise.all([...sessions.values()].map(id =>
              data(client.session.messages({path:{id},query:{directory:sessionRuns.get(id)?.executionDirectory ?? executionDirectory}}))));
            // Include cancellation that raced with the native message read.
            const stopped = await Promise.allSettled(cancellations.values());
            const activeTools = native.flat().flatMap(m => m.parts ?? []).filter(p =>
              p.type === 'tool' && ['pending','running'].includes(p.state?.status));
            const termination = {verified:stopped.every(r => r.status === 'fulfilled') &&
              [run, ...sessionRuns.values()].every(s => !s.pending.size && !s.toolQueue.length) && !activeTools.length, abortRequests:cancellations.size,
              pendingTools:run.pending.size, queuedTools:run.toolQueue.length, activeTools:activeTools.length,
              abortErrors:stopped.filter(r => r.status === 'rejected').map(r => String(r.reason))};
            run.save('termination.json', termination);
            run.sealed = true; // Late native events cannot rewrite terminal evidence.
            result.terminalPatch = null; result.completedCommands = [];
            if (termination.verified) {
              const terminal = run.capture();
              run.save('terminal.json', terminal);
              if (terminal.status === 'captured') {
                run.save('terminal.patch', terminal.diff);
                result.terminalPatch = path.join(artifacts, 'terminal.patch');
                result.completedCommands = finalChecks(run.log, terminal).map(e => ({ command: e.args.command, exit: e.exit }));
              }
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
            result.permissionContinuations = run.permissionContinuations;
            result.termination = termination; run.save('result.json', result);
            run.result = result;
            return JSON.stringify(compactTaskResult(result, { artifacts, executionDirectory, sessions: Object.fromEntries(sessions) }));
          } finally {
            if (run.sense) { controller.abort(); await run.sense.settle(); }
            context.abort.removeEventListener('abort', cancel); run.state = 'finished';
            for (const id of sessions.values()) children.delete(id);
          }
        },
      },
    },
  };
}
