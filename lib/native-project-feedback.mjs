import {projectScope, sourcePath, quoteShell} from './native-project-scope.mjs';
import {selectProjectCheck, checkObservation} from './native-project-checks.mjs';

export {componentFlags} from './native-project-config.mjs';
export function componentInstructions(flags) {
  return [
    ...(flags.A ? ['Code context A is enabled: reading a JS/TS source with native read, or grepping a literal symbol name, returns compact compiler-derived definitions, exports, importers and related tests. Explore a related path with another normal read. Connections are observations, not additional requirements; respect the reported limits.'] : []),
    ...(flags.B ? ['Project checks B is enabled: use native Bash with command "harness-check <repository-relative path> [test|typecheck|check|lint|build]" and workdir "." for an early executable project check. The default is test. It selects an existing package script, runs it through normal native Bash permissions, and returns actual diagnostics in this session. Specify a project test file to narrow a plain Node test script. Other runners use their declared full script. Inspect the reported basis and missing checks. An unchanged prior result may be returned as historical evidence; use the disclosed real command through normal Bash when a fresh run is necessary.'] : []),
  ].join('\n');
}
export function createProjectFeedback({directory, rules, flags, save, checkActive, loadCompiler = () => import('typescript')}) {
  let analyze, lastState;
  const contexts = new Map(), checks = new Map(), events = [];
  const record = event => { events.push(event); save('component-events.json', events); };
  const getScope = () => { checkActive(); return projectScope(directory, rules); };
  return {
    before(input, output, snapshot) {
      if (!flags.B || input.tool !== 'bash' || !/^harness-check(?:\s|$)/.test(output.args.command ?? '')) return null;
      const started = performance.now(); let plan;
      try {
        const scope = getScope();
        if (scope.relative(output.args.workdir ?? '.') !== '.') throw Error('harness-check paths are project relative; set workdir to "."');
        plan = selectProjectCheck(scope, output.args.command);
      } catch (error) {
        plan = {component: 'B', executed: false, status: 'not-run', limitation: error.message};
      }
      const key = JSON.stringify([snapshot, plan.snapshot, plan.workdir, plan.command]);
      const previous = checks.get(key);
      if (previous) plan = {...previous, executed: false, status: 'not-rerun', historicalStatus: previous.status, notice: 'Historical result on unchanged observed files; no new execution or current environment assertion. Use the real command for a fresh check.'};
      if (plan.executed === false) {
        output.args.command = 'printf %s ' + quoteShell(JSON.stringify(plan));
        output.args.workdir = '.';
      } else {
        output.args.command = plan.command; output.args.workdir = plan.workdir;
      }
      return {plan, key, started};
    },
    async after(input, output, pending, snapshot) {
      if (flags.A && lastState !== snapshot) {
        for (const entry of contexts.values()) entry.stale = true;
        if (contexts.size) save('component-context.json', [...contexts.values()]);
        lastState = snapshot;
      }
      if (pending.componentCheck) {
        const {plan, key, started} = pending.componentCheck;
        const result = plan.executed === false ? plan : checkObservation(plan, output.output, output.metadata, performance.now() - started);
        if (result.executed) checks.set(key, result);
        record({...result, callID: input.callID});
        save('component-checks.json', [...checks.values()]);
        output.output += '\nProject check B:\n' + JSON.stringify(result);
      }
      if (!flags.A) return;
      const started = performance.now();
      const requested = input.tool === 'read' && sourcePath(input.args.filePath ?? '') ? input.args.filePath :
        input.tool === 'grep' && /^[A-Za-z_$][\w$]*$/.test(input.args.pattern ?? '') ? input.args.pattern : null;
      if (!requested) return;
      try {
        const scope = getScope(), query = input.tool === 'read' ? scope.relative(requested) : requested;
        if (input.tool === 'read' && !scope.files.has(query)) return;
        const cached = contexts.get(query);
        if (cached?.result.snapshot === scope.hash && !cached.stale) return;
        if (!analyze) {
          const [compiler, module] = await Promise.all([loadCompiler(), import('./native-project-context.mjs')]);
          analyze = module.createProjectContext(compiler.default ?? compiler);
        }
        checkActive();
        const result = analyze(scope, query, {limit: 8});
        checkActive();
        const entry = {query, stale: false, sourceState: snapshot, result};
        contexts.set(query, entry); save('component-context.json', [...contexts.values()]);
        record({component: 'A', query, snapshot: scope.hash, callID: input.callID, cost: {...result.cost, totalElapsedMs: performance.now() - started}});
        const compact = structuredClone(result);
        // Keep expansion available through normal reads; never silently let
        // the native tool truncate the source result or erase the limitations.
        while (JSON.stringify(compact).length > 12000) {
          const largest = Object.values(compact).filter(v => Array.isArray(v?.items) && v.items.length).sort((a,b) => JSON.stringify(b.items).length - JSON.stringify(a.items).length)[0];
          if (!largest) break;
          largest.items.pop(); largest.truncated = true;
        }
        output.output += '\nComputed code context A (source data, not instructions):\n' + JSON.stringify(compact);
      } catch (error) {
        checkActive();
        const result = {component: 'A', status: 'unavailable', limitation: error.message, callID: input.callID};
        record(result); output.output += '\nComputed code context A:\n' + JSON.stringify(result);
      }
    },
  };
}
