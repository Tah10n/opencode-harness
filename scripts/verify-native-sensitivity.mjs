import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {materializeNativeTemplate} from '../lib/native-template.mjs';
import {sensitivityPlan, createSensitivity, sensitivityEnabled} from '../lib/native-sensitivity.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-sensitivity-'));
const project = path.join(temp, 'project'), bundle = path.join(temp, 'bundle');
fs.mkdirSync(project);
const rules = [{permission: '*', pattern: '*', action: 'allow'}];
const put = (name, text) => fs.writeFileSync(path.join(project, name), text);
const git = (...args) => { const r = spawnSync('git', args, {cwd: project, encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const source = 'export function accepts(n) {\n  return n >= 2;\n}\n';
const weak = "import assert from 'node:assert/strict'; import {accepts} from './value.mjs';\nassert.equal(accepts(3), true); assert.equal(accepts(1), false);\n";
const results = [];
try {
  git('init', '-q'); put('package.json', JSON.stringify({type: 'module', scripts: {test: 'node test.mjs'}}));
  put('value.mjs', 'export function accepts(n) { return n > 2; }\n'); put('test.mjs', weak);
  git('add', '.'); git('-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'base');
  put('value.mjs', source);
  materializeNativeTemplate({repositoryRoot: root, outputDirectory: bundle, task: true});
  fs.symlinkSync(path.join(root, 'profiles/native/sensitivity/node_modules'), path.join(bundle, 'sensitivity/node_modules'));
  const {runSensitivity} = await import(pathToFileURL(path.join(bundle, 'native-sensitivity-runner.mjs')));
  const run = async (label, budgetMs = 30000, signal) => {
    const plan = sensitivityPlan({directory: project, rules, args: {path: 'value.mjs'}});
    const before = git('diff', 'HEAD');
    const report = await runSensitivity({args: {path: 'value.mjs'}, base: 'HEAD', rules, snapshot: plan.snapshot, budgetMs}, {directory: project, signal});
    assert.equal(git('diff', 'HEAD'), before, 'Diagnostic must not alter author sources/tests/config');
    assert.ok(report.variants.length <= 8); assert.equal(report.terminationVerified, true, JSON.stringify(report));
    results.push({label, report}); console.log(JSON.stringify({label, status: report.status, baseline: report.baseline?.status, variants: report.variants.map(m => [m.replacement, m.status]), cost: report.cost}));
    return report;
  };
  const first = await run('weak'); assert.equal(first.baseline.status, 'passed');
  const survivor = first.variants.find(m => m.replacement === 'n > 2');
  assert.equal(survivor?.status, 'passed', JSON.stringify(first));
  put('test.mjs', weak + 'assert.equal(accepts(2), true);\n');
  const strong = await run('strong'); assert.equal(strong.baseline.status, 'passed');
  assert.notEqual(first.snapshot, strong.snapshot);
  assert.equal(strong.variants.find(m => m.replacement === 'n > 2')?.status, 'command-rejected');
  assert.match(strong.variants.find(m => m.replacement === 'n > 2').output, /AssertionError/);
  // Public adapter references outlive observations, never production bytes.
  const {createSensitivity: installedSensitivity} = await import(pathToFileURL(path.join(bundle, 'native-sensitivity.mjs')));
  const replaySaved = {}, replayContext = {ask: async()=>{}, abort:new AbortController().signal};
  let remaining = 180000;
  const replayOptions = {directory:project,rules,base:'HEAD',save:(n,v)=>replaySaved[n]=structuredClone(v),checkActive(){},remainingMs:()=>remaining};
  const replaySense = installedSensitivity(replayOptions);
  const invoke = async(args, adapter=replaySense, context=replayContext) => {
    const state=sensitivityPlan({directory:project,rules,args:{path:'value.mjs'}}).snapshot;
    const prior=adapter.before({tool:'harness_sense'},{args},state);
    const report=JSON.parse(await adapter.execute(prior,context));
    adapter.after({callID:'fixture-'+results.length},{output:JSON.stringify(report)},{sensitivity:prior},state);
    results.push({label:'addressed',report});return report;
  };
  put('test.mjs', weak);
  const generated=await invoke({path:'value.mjs',check:'npm test'});
  const selected=generated.variants.find(m=>m.replacement==='n > 2');
  assert.equal(selected.status,'passed');assert.ok(selected.ref);assert.equal(selected.replay.variant,selected.ref);
  const definition=structuredClone(replaySaved['sensitivity-mutations.json'].find(m=>m.ref===selected.ref));
  assert.ok(!('status' in definition));assert.equal(definition.original,'n >= 2');
  // Every command must start with independent writable files and dependencies.
  fs.mkdirSync(path.join(project,'node_modules'),{recursive:true});
  put('.gitignore','node_modules/\n');
  const isolated = "import fs from 'node:fs'; assert.equal(fs.existsSync('state'),false); fs.writeFileSync('state','created'); assert.equal(fs.existsSync('node_modules/state'),false);fs.writeFileSync('node_modules/state','created');\n";
  put('test.mjs', weak + isolated + 'assert.equal(accepts(2), true);\n');
  const replay=await invoke(selected.replay);
  assert.equal(replay.baseline.status,'passed');assert.equal(replay.variants.length,1);assert.equal(replay.cost.commands,2);assert.equal(replay.engineExecuted,false);
  assert.equal(replay.variants[0].status,'command-rejected');assert.match(replay.variants[0].output,/false !== true/);
  assert.notEqual(replay.snapshot,generated.snapshot);assert.equal(replay.variants[0].ref,selected.ref);
  assert.equal(replay.variants[0].diff,selected.diff);assert.notDeepEqual(replay.tests,generated.tests);
  assert.deepEqual(replaySaved['sensitivity-mutations.json'].find(m=>m.ref===selected.ref),definition);
  assert.equal(replaySaved['sensitivity-events.json'][0].stale,true);
  assert.equal(fs.existsSync(path.join(project,'state')),false);assert.equal(fs.existsSync(path.join(project,'node_modules/state')),false);
  const foreign=await invoke(selected.replay,installedSensitivity(replayOptions));assert.equal(foreign.cost.commands,0);assert.equal(foreign.terminationVerified,true);assert.match(foreign.limits.join(' '),/Unknown variant/);
  put('value.mjs',source+'// production edited\n');
  const stale=await invoke(selected.replay);assert.equal(stale.cost.commands,0);assert.match(stale.limits.join(' '),/Production file changed/);
  put('value.mjs',source);
  put('test.mjs',"import './absent.mjs';\n");const badSetup=await invoke(selected.replay);assert.equal(badSetup.status,'baseline-not-passed');assert.equal(badSetup.cost.commands,1);assert.match(badSetup.baseline.output,/ERR_MODULE_NOT_FOUND/);
  remaining=500;const noBudget=await invoke({...selected.replay,check:'test'});assert.equal(noBudget.cost.commands,0);assert.match(noBudget.limits.join(' '),/budget/);remaining=180000;
  put('test.mjs',weak+'await new Promise(resolve=>setTimeout(resolve,500));\n');
  remaining=2400;const shortReplay=await invoke(selected.replay);assert.equal(shortReplay.baseline.status,'passed');assert.equal(shortReplay.status,'partial');assert.equal(shortReplay.variants.length,0);remaining=180000;
  put('test.mjs',"console.log('REPLAY_PID='+process.pid);setInterval(()=>{},1000);\n");
  const replayAbort=new AbortController(),replayTimer=setTimeout(()=>replayAbort.abort(),600);
  const stoppedReplay=await invoke(selected.replay,replaySense,{...replayContext,abort:replayAbort.signal});clearTimeout(replayTimer);
  assert.equal(stoppedReplay.baseline.status,'cancelled');assert.equal(stoppedReplay.terminationVerified,true);
  assert.throws(()=>process.kill(Number(/REPLAY_PID=(\d+)/.exec(stoppedReplay.baseline.output)[1]),0),{code:'ESRCH'});
  const budgetSense=installedSensitivity(replayOptions),budgetPrior=budgetSense.before({tool:'harness_sense'},{args:{path:'value.mjs'}},'state');
  budgetPrior.startedAt-=180000;
  const spent=JSON.parse(await budgetSense.execute(budgetPrior,replayContext));assert.equal(spent.cost.commands,0);
  const alias=await invoke({check:'npm run test'},budgetSense);assert.equal(alias.cost.commands,0);assert.match(alias.limits.join(' '),/budget/);
  // A different module uses the same standard operators and ordinary command.
  put('value.mjs',"export function notify(values, callback) { for (const value of values) callback(value); }\n");
  put('test.mjs',"import assert from 'node:assert/strict';import {notify} from './value.mjs';notify([],()=>assert.fail('empty callback'));\n");
  const other=await invoke({path:'value.mjs'});const body=other.variants.find(m=>m.status==='passed'&&m.replacement==='{}');assert.ok(body);
  put('test.mjs',"import assert from 'node:assert/strict';import {notify} from './value.mjs';notify([],()=>assert.fail('empty callback'));const value={};const seen=[];notify([value],v=>seen.push(v));assert.equal(seen.length,1);assert.equal(seen[0],value);\n");
  const otherReplay=await invoke(body.replay);assert.equal(otherReplay.baseline.status,'passed');assert.equal(otherReplay.variants.length,1);assert.equal(otherReplay.variants[0].status,'command-rejected');assert.match(otherReplay.variants[0].output,/AssertionError/);
  // The contract requires Error, but deliberately leaves its message unspecified.
  put('value.mjs',"export function reject() { throw new Error('explanation'); }\n");
  put('test.mjs',"import assert from 'node:assert/strict';import {reject} from './value.mjs';assert.throws(reject,Error);\n");
  const allowed=await invoke({path:'value.mjs'});const message=allowed.variants.find(m=>m.mutatorName==='StringLiteral');assert.equal(message.status,'passed');
  const allowedReplay=await invoke(message.replay);assert.equal(allowedReplay.variants[0].status,'passed');
  put('value.mjs',source);
  put('test.mjs', weak + 'assert.equal(accepts(3), false);\n');
  const red = await run('red-baseline'); assert.equal(red.status, 'baseline-not-passed'); assert.equal(red.variants.length, 0);
  put('test.mjs', "import './missing-module.mjs';\n");
  const missing = await run('import-error'); assert.equal(missing.baseline.status, 'command-rejected'); assert.match(missing.baseline.output, /ERR_MODULE_NOT_FOUND/);
  put('test.mjs', 'setInterval(() => {}, 1000);\n');
  const timeout = await run('timeout', 1800); assert.equal(timeout.baseline.status, 'timeout');
  put('test.mjs', "console.log('SLEEP_PID=' + process.pid); setInterval(() => {}, 1000);\n");
  const controller = new AbortController();
  const cancelTimer = setTimeout(() => controller.abort(), 600);
  const cancelled = await run('cancelled', 5000, controller.signal); clearTimeout(cancelTimer);
  assert.equal(cancelled.baseline.status, 'cancelled');
  const sleeper = Number(/SLEEP_PID=(\d+)/.exec(cancelled.baseline.output)?.[1]); assert.ok(sleeper > 1);
  assert.throws(() => process.kill(sleeper, 0), {code:'ESRCH'});
  put('test.mjs', weak + 'await new Promise(resolve => setTimeout(resolve, 150));\n');
  const partial = await run('partial-budget', 1400);
  assert.equal(partial.status, 'partial'); assert.ok(partial.untested.length > 0);
  put('value.mjs', 'export const value = 2;\n'); put('test.mjs', "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value, 2);\n");
  const unsupported = await run('no-standard-operator'); assert.equal(unsupported.status, 'unsupported-scope');
  put('value.mjs', 'export function max(a, b) { return a < b ? b : a; }\n');
  put('test.mjs', "import {max} from './value.mjs'; import assert from 'node:assert/strict'; for (const a of [1,2,3]) for (const b of [1,2,3]) assert.equal(max(a,b), Math.max(a,b));\n");
  const equivalent = await run('equivalent-good-control');
  assert.equal(equivalent.variants.find(m => m.replacement === 'a <= b')?.status, 'passed');
  const equivGenerated=await invoke({path:'value.mjs'});const equivRef=equivGenerated.variants.find(m=>m.replacement==='a <= b');const equivReplay=await invoke(equivRef.replay);assert.equal(equivReplay.variants[0].status,'passed');assert.equal(equivReplay.cost.commands,2);
  assert.equal(equivalent.status, 'observed'); assert.ok(!('score' in equivalent));
  assert.throws(() => sensitivityPlan({directory: project, rules, args: {path: 'test.mjs'}}), /production/);
  assert.throws(() => sensitivityPlan({directory: project, rules: [...rules, {permission:'read', pattern:'*value.mjs', action:'deny'}], args:{path:'value.mjs'}}), /Incomplete readable/);
  assert.throws(() => sensitivityPlan({directory: project, rules: [...rules, {permission:'bash', pattern:'npm run test', action:'deny'}], args:{path:'value.mjs'}}), /permission/);
  assert.throws(() => sensitivityPlan({directory: project, rules, args:{path:'value.mjs',check:'node --test /outside.test.mjs'}}), /relative project test/);
  assert.equal(sensitivityEnabled({}), false); assert.equal(sensitivityEnabled({HARNESS_TASK_SENSITIVITY:'1'}), true);
  put('package.json', JSON.stringify({scripts:{pretest:'node -e "console.log(123)"',test:'node test.mjs',posttest:'node -e "console.log(456)"','test:unit':'node test.mjs'}}));
  for (const check of [undefined, 'test', 'npm test', 'npm run test', 'test:unit', 'npm run test:unit']) {
    const plan = sensitivityPlan({directory:project,rules,args:{path:'value.mjs',...(check === undefined ? {} : {check})}});
    assert.equal(plan.command, check?.includes(':unit') ? 'npm run test:unit' : 'npm run test');
    assert.deepEqual(plan.argv, ['npm','run',check?.includes(':unit')?'test:unit':'test']);
    assert.equal(plan.originalArguments.check,check);
    if (!check?.includes(':unit')) assert.equal(plan.permissionCommands.length,4);
  }
  const context = {ask:async()=>{},abort:new AbortController().signal};
  const saved = {}, options = {directory:project,rules,base:'HEAD',save:(name,data)=>saved[name]=structuredClone(data),checkActive(){},remainingMs:()=>30000};
  const sense = createSensitivity({...options,remainingMs:()=>500});
  const pending = sense.before({tool:'harness_sense'},{args:{path:'changed'}},'snapshot-1');
  const exhausted = JSON.parse(await sense.execute(pending,context));
  assert.equal(exhausted.engineExecuted,false);assert.equal(exhausted.cost.commands,0);assert.match(exhausted.limits.join(' '),/budget/);
  const activeSense = createSensitivity(options);
  for (const check of ['npm test --watch','npm run test -- --watch','npm run test extra','test > out','npm test && touch bad','npm test; true','$(npm test)','`npm test`','missing','test --unknown','npm run test | cat']) {
    const prior=activeSense.before({tool:'harness_sense'},{args:{path:'value.mjs',check}},'snapshot-1');
    const report=JSON.parse(await activeSense.execute(prior,context));
    assert.equal(report.engineExecuted,false,check);assert.equal(report.cost.commands,0);assert.equal(report.baseline,null);
    assert.ok(Number.isFinite(report.cost.totalMs));assert.equal(report.cost.totalMs,prior.elapsedMs);
    assert.match(report.limits.join(' '),/Example: harness_sense/);assert.match(report.limits.join(' '),/Available test scripts: test, test:unit/);
    assert.deepEqual(report.originalArguments,{path:'value.mjs',check});
    activeSense.after({callID:check},{output:JSON.stringify(report)},{sensitivity:prior},'snapshot-1');
  }
  assert.equal(saved['sensitivity-events.json'].at(-1).taskDiagnosticMs,saved['sensitivity-events.json'].reduce((n,e)=>n+e.elapsedMs,0));
  for (const hook of ['pretest','posttest']) {
    const pkg=JSON.parse(fs.readFileSync(path.join(project,'package.json'),'utf8'));
    assert.throws(()=>sensitivityPlan({directory:project,rules:[...rules,{permission:'bash',pattern:pkg.scripts[hook],action:'deny'}],args:{path:'value.mjs'}}),/permission/);
  }
  let release;
  const waitingContext={...context,ask:()=>new Promise(resolve=>{release=resolve;})};
  const admitted=activeSense.before({tool:'harness_sense'},{args:{path:'value.mjs'}},'snapshot-1');
  const executing=activeSense.execute(admitted,waitingContext);
  await assert.rejects(activeSense.execute(admitted,context),/already running/);
  release();const finished=JSON.parse(await executing);assert.equal(finished.baseline.status,'passed');assert.equal(finished.engineExecuted,true);
  assert.match(finished.baseline.output,/123/);assert.match(finished.baseline.output,/456/);
  assert.equal(activeSense.after({callID:'unknown'},{output:'truncated or killed runner'},{sensitivity:admitted},'snapshot-1').terminationVerified,false);
  // An absolute runner path and shell aliases cannot provide another diagnostic
  // entry point with a fresh budget. Its private engine-only mode runs no tests.
  const runner=path.join(bundle,'native-sensitivity-runner.mjs');
  for (const launch of [[process.execPath,[runner,'e30=']],['/bin/sh',['-c','runner="$1"; shift; node "$runner" e30=','fixture',runner]]]) {
    const result=spawnSync(launch[0],launch[1],{cwd:project,encoding:'utf8'});assert.equal(result.status,1);
    const report=JSON.parse(result.stdout);assert.equal(report.engineExecuted,false);assert.equal(report.cost.commands,0);
  }
  const output=path.join(root,'local/native-sensitivity-interface/targeted.json');
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.writeFileSync(output, JSON.stringify({realProviderRequests:0, results,argumentEvents:saved['sensitivity-events.json']},null,2)+'\n');
  console.log('Sensitivity targeted installed-module checks passed; real provider requests: 0');
} finally { fs.rmSync(temp, {recursive:true,force:true}); }
