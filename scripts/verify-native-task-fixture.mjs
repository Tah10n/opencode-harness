// Installed native-session workflow fixture: control-flow evidence, zero model-quality claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { materializeNativeTemplate } from '../lib/native-template.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-task-fixture-'));
for (const name of ['home', 'config', 'data', 'cache', 'state', 'project']) fs.mkdirSync(path.join(temp, name));
const project = path.join(temp, 'project'), bundle = path.join(temp, 'bundle'), task = path.join(temp, 'task.txt');
const git = (...args) => { const r = spawnSync('git', args, { cwd: project, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
git('init', '-q');
fs.writeFileSync(path.join(project, 'value.mjs'), 'export const value = 2;\n');
fs.writeFileSync(path.join(project, 'value.test.mjs'), "import {value} from './value.mjs'; import assert from 'node:assert/strict'; import {test} from 'node:test'; test('public requirement',()=>assert.equal(value,2));\n");
fs.writeFileSync(path.join(project, 'opencode.json'), JSON.stringify({ permission: { task: 'allow', bash: 'allow' } }));
fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({private:true,scripts:{test:'node --test value.test.mjs'}}));
git('add', '.'); git('-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'base');
materializeNativeTemplate({ repositoryRoot: root, outputDirectory: bundle, task: true, review: true });
// Fixture-only external actor: place a user save exactly after the production
// before-hook rejects, before OpenCode publishes the failed event.
const externalControl=path.join(temp,'external-control.json');
fs.writeFileSync(externalControl,'{}');
fs.writeFileSync(path.join(bundle,'fixture-wrapper.mjs'),`import fs from 'node:fs';import plugin from './native-task-plugin.mjs';export default async input=>{const hooks=await plugin(input);const before=hooks['tool.execute.before'];hooks['tool.execute.before']=async(...args)=>{const c0=JSON.parse(fs.readFileSync(${JSON.stringify(externalControl)},'utf8'));if(c0.unknown){fs.writeFileSync(${JSON.stringify(externalControl)},'{}');throw Error('Fixture upstream rejection without a host before snapshot');}try{return await before(...args);}catch(error){const c=JSON.parse(fs.readFileSync(${JSON.stringify(externalControl)},'utf8'));if(c.target&&error.message==='Mutation/check tools must execute sequentially; source reads may run together'){fs.writeFileSync(c.target,'export const value = 99; // external save\\n');fs.writeFileSync(${JSON.stringify(externalControl)},'{}');}throw error;}};return hooks;};`);
const installedConfig=JSON.parse(fs.readFileSync(path.join(bundle,'opencode.json')));
installedConfig.plugin=[pathToFileURL(path.join(bundle,'fixture-wrapper.mjs')).href];
fs.writeFileSync(path.join(bundle,'opencode.json'),JSON.stringify(installedConfig));
const exceptionFixture=path.join(root,'scripts/fixtures/native-task-exception');
const exceptionSource=fs.readFileSync(path.join(exceptionFixture,'timing.mjs'),'utf8');
const exceptionTests=fs.readFileSync(path.join(exceptionFixture,'complete.test.mjs'),'utf8');
const exceptionSplit=exceptionTests.indexOf("test('invokes callable functions");
const exceptionLegacy=exceptionTests.slice(0,exceptionSplit);
const exceptionRegression="import {test} from 'node:test';import assert from 'node:assert/strict';import {timed} from '../src/timing.mjs';\n"+exceptionTests.slice(exceptionSplit);
const namedNestedRegression=exceptionRegression
  .replace("import {test} from 'node:test';", "import {describe,it} from 'node:test';")
  .replace("test('invokes callable functions with an overridden apply property',()=>{", "describe('ordinary callable contract',()=>{it('invokes callable functions with an overridden apply property',function namedInvocation(){")+'\n});\n';
const exceptionInline=`node --input-type=module -e 'import {timed} from "./src/timing.mjs";function target(){return 42;}target.apply=null;try{console.log(timed(target,{now:()=>0,record:()=>{}})());}catch(error){console.log(error.name,error.message)}'`;
const exceptionFinding=JSON.parse(fs.readFileSync(path.join(exceptionFixture,'finding.json')));
const writeFixture=(file,bytes)=>`node -e 'require("fs").writeFileSync(${JSON.stringify(file)},Buffer.from(${JSON.stringify(Buffer.from(bytes).toString('base64'))},"base64"))'`;
let lastReport, mode = 'correct', counts = new Map(), requests = [], reproductionID = '', priorArtifacts = new Set();
const response = (res, call, content = '') => {
  if (call?.name === 'StructuredOutput') { content = JSON.stringify(call.args); call = null; }
  const delta = call ? { role: 'assistant', tool_calls: (Array.isArray(call)?call:[call]).map((c,index)=>({ index, id: c.id ?? `fixture-${requests.length}-${index}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : { role: 'assistant', content };
  const base = { id: `response-${requests.length}`, object: 'chat.completion.chunk', created: 1, model: 'fixture' };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
};
const legacyReview = fs.readFileSync(path.join(root, 'scripts/fixtures/native-task-review/bookmark-migration.txt'), 'utf8');
const replayDisposition = fs.readFileSync(path.join(root, 'scripts/fixtures/native-task-review/bookmark-reproduction.txt'), 'utf8');
const finding = { id: 'F1', classification: 'concrete', kind: 'behavior', basis: 'Original task requires value 2', affectedFiles: ['value.mjs'], verification: 'node --test value.test.mjs', expected: '2' };
const fixture = http.createServer(async (req, res) => {
  const chunks = []; for await (const x of req) chunks.push(x);
  const body = JSON.parse(Buffer.concat(chunks));
  const user = body.messages.findLast(m => m.role === 'user');
  const userText = typeof user?.content === 'string' ? user.content : user?.content?.map(p => p.text ?? '').join('\n') ?? '';
  if (userText.startsWith('FORMAT_ONLY:')) {
    assert.ok(!['legacy-bookmark','evidence-replay'].includes(mode),'Supported legacy must never request format correction');
    requests.push({mode,stage:'format',tools:(body.tools??[]).map(t=>t.function.name)});
    assert.equal(body.tools?.length??0,0,'Format correction must not expose tools: '+JSON.stringify(body.tools));
    if(mode==='format-fails'){response(res,null,'{broken again');return;}
    response(res,null,JSON.stringify(lastReport));return;
  }
  if (!body.tools?.length) { response(res, null, 'Task fixture'); return; }
  const stage = userText.includes('Correct reproduction evidence') ? 'evidence-correction' : userText.includes('Investigate the concrete') ? 'reproduce' : userText.includes('Continue ONLY') ? 'continuation' : userText.includes('Repair ONLY') ? 'repair' : (userText.includes('Review current delivery') || userText.includes('Re-review the ACTUAL')) ? 'review' : userText.includes('Implement the complete original') ? 'implementation' : 'bootstrap';
  const key = mode + stage, n = counts.get(key) ?? 0; counts.set(key, n + 1);
  requests.push({ mode, stage, n, tools: body.tools.map(t => t.function.name) });
  const bash = command => ({ name: 'bash', args: { command, description: 'Installed workflow fixture command' } });
  if (stage === 'bootstrap') { response(res, n === 0 ? { name: 'harness_task', args: {} } : null, 'Workflow result retained; see tool output.'); return; }
  if(mode.startsWith('obligation-')){
    const wire=body.messages.map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content)).join('\n');
    const refs=[...wire.matchAll(/HOST_NATIVE_EVIDENCE (\{[^\n]*\})/g)].map(m=>JSON.parse(m[1]));
    const testBytes="import {test} from 'node:test';import assert from 'node:assert/strict';import {run} from './consumer.mjs';test('consumer requirement',()=>assert.equal(run(),2));\n";
    if(stage==='implementation'){response(res,n===0?bash(mode==='obligation-complete'?'node --test value.test.mjs consumer.test.mjs':'node --test value.test.mjs'):null,'Initial helper implementation');return;}
    if(stage==='reproduce'){
      if(mode==='obligation-test'){
        if(n===0){response(res,bash(writeFixture('consumer.test.mjs',testBytes)));return;}
        if(n===1){response(res,bash('node --test value.test.mjs consumer.test.mjs'));return;}
      }else if(n===0){response(res,{name:'read',args:{filePath:'consumer.mjs'}});return;}
      const ref=refs.at(-1);assert.ok(ref);
      response(res,null,JSON.stringify({dispositions:[{id:'obligation-0',decision:mode==='obligation-extra'?'rejected':'grounded',kind:mode==='obligation-test'?'test':'implementation',basis:mode==='obligation-extra'?'Original task only asks for value 2, not network access':'Original task explicitly requires run() consumer integration and its project regression',expectedReason:'Original task scope',explanation:'Helper returns 2 but the consumer still returns 1; complete this path rather than changing the helper',affectedFiles:['consumer.mjs','consumer.test.mjs'],evidenceCallID:ref.callID}],limitations:[]}));return;
    }
    if(stage==='continuation'){
      const payload=JSON.parse(userText.split('\nReturn only')[0]);assert.ok(payload.current.diff!==undefined);assert.ok(payload.originalTask.includes('consumer'));assert.equal(payload.missingImplementation[0].kind,'implementation');assert.ok(payload.toolEvidence.some(e=>e.tool==='read'));
      if(mode==='obligation-no-progress'){response(res,null,'No progress');return;}
      if(n===0){response(res,bash(writeFixture('consumer.mjs',"import {value} from './value.mjs';export const run=()=>value;\n")));return;}
      if(n===1){response(res,bash(writeFixture('consumer.test.mjs',testBytes)));return;}
      if(n===2){response(res,bash('node --test value.test.mjs consumer.test.mjs'));return;}
      response(res,null,'Integrated and checked the consumer');return;
    }
    if(stage==='review'){
      const info=JSON.parse(userText.split('\nReturn only')[0]);const last=info.toolEvidence.filter(e=>e.tool==='bash'&&e.exit===0).at(-1);
      const delivered=mode==='obligation-complete'||mode==='obligation-extra'&&n>0||mode==='obligation-test'&&counts.get(mode+'reproduce')>0||requests.some(r=>r.mode===mode&&r.stage==='continuation');
      response(res,null,JSON.stringify({findings:[],obligations:[{requirement:mode==='obligation-extra'?(delivered?'Deliver original value 2; network upload was not requested':'Add unrequested network upload'):mode==='obligation-test'?'Deliver requested consumer regression':'Connect run() to the helper and deliver its consumer regression',status:delivered?'delivered':'missing',evidence:'Inspect consumer.mjs and consumer.test.mjs relative to original task'}],unverified:[],evidenceLimitations:[],coverageLost:[],proposedVerificationFiles:['consumer.test.mjs'],checks:last?[{callID:last.callID,purpose:'preservation',basis:'Legacy test after last edit'},{callID:last.callID,purpose:'discriminating',basis:'Current consumer project check'}]:[]}));return;
    }
  }
  if(mode.startsWith('exception-')){
    const wire=body.messages.map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content)).join('\n');
    const refs=[...wire.matchAll(/HOST_NATIVE_EVIDENCE (\{[^\n]*\})/g)].map(m=>JSON.parse(m[1]));
    if(stage==='implementation'){response(res,n===0?bash('npm test'):null,'Saved candidate ready');return;}
    if(stage==='reproduce'||stage==='evidence-correction'){
      if(stage==='evidence-correction')assert.ok(userText.includes('ordinary project test callback'));
      if(n===0){response(res,bash(stage==='reproduce'||mode==='exception-reject'?exceptionInline:writeFixture('test/exception.test.mjs',mode==='exception-named-nested'?namedNestedRegression:exceptionRegression)));return;}
      if(n===1&&stage==='evidence-correction'&&mode!=='exception-reject'){response(res,bash('npm test'));return;}
      const ref=refs.at(-1);assert.ok(ref);
      response(res,null,JSON.stringify({dispositions:[{id:exceptionFinding.id,decision:'grounded',kind:'behavior',basis:exceptionFinding.basis,expectedReason:'The original ordinary-callable domain includes callable functions with their own properties',explanation:'Invoke the permitted public scenario through the current project regression',evidenceCallID:ref.callID}],limitations:[]}));return;
    }
    if(stage==='repair'){
      if(n===0){response(res,bash(writeFixture('src/timing.mjs',exceptionSource.replace('fn.apply(this,args)','Reflect.apply(fn,this,args)'))));return;}
      if(n===1){response(res,bash('node --test test/exception.test.mjs'));return;}
      if(n===2){response(res,bash('npm test'));return;}
      response(res,null,'Scripted repair and checks finished');return;
    }
    if(stage==='review'){
      const info=JSON.parse(userText.split('\nReturn only')[0]);
      const checks=info.toolEvidence.filter(e=>e.tool==='bash'&&e.exit===0);
      const good=mode==='exception-correct'||requests.some(r=>r.mode===mode&&r.stage==='repair');
      const last=checks.at(-1);
      response(res,null,JSON.stringify({findings:good?[]:[exceptionFinding],obligations:[{requirement:'Preserve all prior timing assertions',status:'delivered',evidence:'Current source and native project checks'}],unverified:[],evidenceLimitations:[],coverageLost:[],proposedVerificationFiles:['test/exception.test.mjs'],checks:last?[{callID:last.callID,purpose:'preservation',basis:'Project suite after the latest edit'},...(good?[{callID:last.callID,purpose:'discriminating',basis:'Project suite includes the saved sensitive regression'}]:[])]:[]}));return;
    }
  }
  if (stage === 'implementation') {
    if(mode.startsWith('state-')&&mode!=='state-reproduce'){
      if(n===0){response(res,mode==='state-documentation'?{name:'read',args:{filePath:'value.test.mjs'}}:bash('npm test'));return;}
      if(n===1){
        if(mode==='state-unknown'){fs.writeFileSync(externalControl,JSON.stringify({unknown:true}));response(res,{name:'read',args:{filePath:'value.mjs'}});return;}
        if(mode==='state-revert'){response(res,bash("printf 'export const value = 3;\\n' > value.mjs"));return;}
        if(mode==='state-external'){
          const base=path.join(project,'.git/harness-task'),fresh=fs.readdirSync(base).filter(n=>!priorArtifacts.has(n));assert.equal(fresh.length,1);
          fs.writeFileSync(externalControl,JSON.stringify({target:path.join(base,fresh[0],'worktree/value.mjs')}));
        }
        response(res,[bash('sleep 0.1'),bash('printf forbidden-execution')]);return;
      }
      if(mode==='state-revert'&&n===2){response(res,bash("printf 'export const value = 2;\\n' > value.mjs"));return;}
      response(res,null,'Finished after failed call');return;
    }

    if(mode==='external-before-error'){
      const base=path.join(project,'.git/harness-task'),fresh=fs.readdirSync(base).filter(n=>!priorArtifacts.has(n));assert.equal(fresh.length,1);
      if(n===0){fs.writeFileSync(path.join(base,fresh[0],'worktree/value.mjs'),'export const value = 99; // external save\n');response(res,bash('node --test value.test.mjs'));return;}
      if(n===1){response(res,bash('node --test value.test.mjs'));return;}
      response(res,null,'Stopped after errors');return;
    }

    if(['evidence-permission','evidence-user-reject'].includes(mode)){response(res,null,'No initial implementation required for permission fixture');return;}
    if (n === 0) { response(res, bash(['defect','src-affected','probe-production','evidence-replay','missing-error-paths','state-reproduce'].includes(mode) ? "printf 'export const value = 1;\\n' > value.mjs" : 'node --test value.test.mjs')); return; }
    if (mode === 'coverage-loss' && n === 1) { response(res, bash("printf 'import {test} from \"node:test\"; test(\"replacement only\",()=>{});\\n' > value.test.mjs")); return; }
    if (mode === 'last-mutation' && n === 1) { response(res, bash("printf 'export const value = 2; // later mutation\\n' > value.mjs")); return; }
    if (mode === 'concurrent-save' && n === 1) { response(res, bash("sleep 1; printf 'export const value = 2;\\n' > value.mjs; node --test value.test.mjs")); return; }
    if (['cancel','budget'].includes(mode) && n === 1) { response(res, bash(mode==='budget'?'sleep 60':'sleep 10')); return; }
    response(res, null, 'Implementation stage ended.'); return;
  }
  if (stage === 'review') {
    assert.ok(!body.tools.some(t => ['bash', 'edit', 'write', 'task', 'todowrite', 'harness_task'].includes(t.function.name)));
    assert.ok(userText.includes('ORIGINAL_TASK_FIXTURE'));
    const info = JSON.parse(userText.split('\nReturn only')[0]);
    const lastCheck = info.toolEvidence?.findLast(e => (e.args?.command?.includes('node --test value.test.mjs') || e.args?.command === 'npm test') && e.exit === 0);
    if (mode === 'coverage-loss') assert.ok(info.current.diff.includes('replacement only'));
    if(mode==='legacy-bookmark'||['evidence-replay','evidence-permission','evidence-user-reject'].includes(mode)&&n===0){response(res,null,legacyReview);return;}
    const hasDefect = ['defect','src-affected','probe-production','missing-error-paths','state-reproduce'].includes(mode) && !requests.some(r => r.mode === mode && r.stage === 'repair');
    const unsupported = mode === 'unsupported' && n === 0;
    lastReport = {
      findings: mode==='missing-test' && !requests.some(r=>r.mode===mode&&r.stage==='reproduce') ? [{...finding,kind:'test',basis:'Task explicitly requires an additional project regression',verification:'Add extra.test.mjs'}] : hasDefect || unsupported ? [{ ...finding, ...(unsupported ? { expected: '3', basis: 'Unsubstantiated reviewer assumption' } : {}) }] : [],
      obligations: [{ requirement: 'Return 2 and preserve test', status: mode === 'incomplete' || hasDefect ? 'missing' : 'delivered', evidence: 'Inspected source and supplied native tool events' }],
      checks: lastCheck ? [{callID:lastCheck.callID,purpose:'preservation',basis:'Runs the existing public Node test'}, {callID:lastCheck.callID,purpose:'discriminating',basis:'The same suite asserts value 2 and failed on D0'}] : [], proposedVerificationFiles: mode==='missing-test'?['extra.test.mjs']:mode==='src-affected'?['value.mjs','value.test.mjs']:['value.test.mjs'],
      unverified: mode==='unverified'?['Consumer behavior remains unverified']:[], evidenceLimitations: mode==='provenance'?['Reviewer did not independently run shell commands']:[], coverageLost: mode === 'coverage-loss' ? ['Old fixture was replaced; requirement not preserved'] : [],
    };
    if(mode==='state-documentation'){
      const read=info.toolEvidence.find(e=>e.tool==='read'&&e.state==='completed');assert.ok(read);
      lastReport.checks=[{callID:read.callID,purpose:'documentation',basis:'Read the supplied project verification documentation'}];
    }
    if(['trailing-comma','format-fails'].includes(mode)&&n===0){response(res,null,JSON.stringify(lastReport).replace(/}$/,',}'));return;}
    if(mode==='missing-semantic'&&n===0){const missing={...lastReport};delete missing.obligations;response(res,null,JSON.stringify(missing));return;}
    response(res,null,JSON.stringify(lastReport)); return;
  }
  if(stage==='evidence-correction'){
    assert.equal(mode,'evidence-replay');
    const info=JSON.parse(userText.split('\nReturn only')[0]);
    assert.ok(info.admissionDecisions.some(d=>d.reasons.includes('evidence_not_in_current_stage')));
    assert.ok(info.currentEvents.some(e=>e.command?.includes('console.log')));
    if(n===0){response(res,bash("mkdir -p test; printf 'import {value} from \"../value.mjs\"; import assert from \"node:assert/strict\"; import {test} from \"node:test\"; test(\"new grounded regression\",()=>assert.equal(value,2));\\n' > test/storage.test.mjs"));return;}
    if(n===1){response(res,bash('node --test value.test.mjs test/storage.test.mjs'));return;}
    // Consume only the host reference actually visible in tool-response context.
    const wire=body.messages.map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content)).join('\n');
    const refs=[...wire.matchAll(/HOST_NATIVE_EVIDENCE (\{[^\n]*\})/g)].map(m=>JSON.parse(m[1]));
    const ref=refs.findLast(r=>r.exit===1&&r.state==='completed');assert.ok(ref,'Current failing command reference must be visible to author');
    response(res,null,JSON.stringify({dispositions:[{id:'F-001',decision:'grounded',kind:'behavior',basis:'Original fixture task requires value 2',expectedReason:'Literal task expectation',explanation:'New assertion fails on current production',evidenceCallID:ref.callID},...['F-002','obligation-0'].map(id=>({id,decision:'rejected',basis:'Original fixture task only requires value 2 and preserving its tests',explanation:'Saved bookmark-specific delivery obligation does not apply to this scripted project'}))],limitations:[]}));return;
  }
  if (stage === 'reproduce') {
    if(mode==='state-reproduce'){
      if(n===0){const call=bash('node --test value.test.mjs');call.id=`state-failure-${requests.length}`;reproductionID=call.id;response(res,call);return;}
      if(n===1){response(res,[bash('sleep 0.1'),bash('printf forbidden-execution')]);return;}
    }

    if(mode==='missing-error-paths'){
      if(n<3){response(res,{name:'read',args:{filePath:['src/permissions.mjs','test/rejected-events.test.mjs','src/protected-fields.mjs'][n]}});return;}
      if(n===3){response(res,{name:'read',args:{filePath:'value.mjs'}});return;}
      if(n===4){const call=bash('node --test value.test.mjs');call.id=`current-failure-${requests.length}`;reproductionID=call.id;response(res,call);return;}
    }

    if(['evidence-replay','evidence-permission','evidence-user-reject'].includes(mode)){
      if(n===0){response(res,bash('node --input-type=module -e "import {value} from \"./value.mjs\"; console.log(value)"'));return;}
      response(res,null,replayDisposition);return;
    }

    if(mode==='legacy-bookmark'){
      const info=JSON.parse(userText.split('\nReturn only')[0]),old=JSON.parse(legacyReview);
      assert.deepEqual(info.review.proposedVerificationFiles,old.verificationFiles);
      assert.deepEqual([info.review.findings.length,info.review.obligations.length,info.review.unverified.length],[2,7,4]);
      assert.ok(info.review.findings.every(f=>f.kind==='unresolved'));
      assert.ok(info.rejectedWriteProposals.includes('src/schema.mjs'));
      assert.ok(info.allowedVerificationFiles.includes('test/storage.test.mjs'));
      response(res,null,JSON.stringify({dispositions:old.findings.map(f=>({id:f.id,decision:'unverified',basis:f.basis,explanation:'Routing fixture does not establish bookmark behavior'})),limitations:['Scripted routing only']}));return;
    }

    if (mode === 'probe-production' && n === 0) { response(res,bash("printf 'export const value = 2;\\n' > value.mjs"));return;}
    if (mode === 'missing-test' && n===0) {response(res,bash('cp value.test.mjs extra.test.mjs'));return;}
    if (mode === 'missing-test' && n===1) {const call=bash("node --test value.test.mjs extra.test.mjs");call.id=`test-delivery-${requests.length}`;reproductionID=call.id;response(res,call);return;}
    if (['defect','src-affected'].includes(mode) && n === 0) { const call = bash('node --test value.test.mjs'); call.id = `reproduce-${requests.length}`; reproductionID = call.id; response(res, call); return; }
    response(res, { name: 'StructuredOutput', args: { dispositions: [{ id: 'F1', decision: mode === 'unsupported' ? 'rejected' : 'grounded', basis: 'Task explicitly requires 2', expectedReason: 'Literal public requirement, not model confidence', evidenceCallID: reproductionID, kind: mode==='missing-test'?'test':'behavior', explanation: 'Observed the native command result' },...(['defect','src-affected','probe-production','missing-error-paths','state-reproduce'].includes(mode)?[{id:'obligation-0',decision:'unverified',basis:'Return 2 and preserve test',explanation:'Requires production repair first'}]:[])], limitations: [] } }); return;
  }
  if (stage === 'repair') {
    if (n === 0) { response(res, bash("printf 'export const value = 2;\\n' > value.mjs")); return; }
    if (n === 1) { response(res, bash(mode==='evidence-replay'?'node --test value.test.mjs test/storage.test.mjs':'node --test value.test.mjs')); return; }
    response(res, null, 'Repair finished after final checks.');
  }
});
await new Promise(r => fixture.listen(0, '127.0.0.1', r));
const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const config = { model: 'local-fixture/fixture', small_model: 'local-fixture/fixture', provider: { 'local-fixture': { npm: '@ai-sdk/openai-compatible', name: 'Scripted fixture', options: { baseURL: `http://127.0.0.1:${fixture.address().port}/v1`, apiKey: 'not-a-credential' }, models: { fixture: { name: 'fixture', limit: { context: 200000, output: 10000 } } } } } };
const env = { PATH: process.env.PATH, HOME: path.join(temp, 'home'), TMPDIR: os.tmpdir(), ...Object.fromEntries(['config', 'data', 'cache', 'state'].map(n => [`XDG_${n.toUpperCase()}_HOME`, path.join(temp, n)])), OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_CONFIG_DIR: bundle, OPENCODE_CONFIG_CONTENT: JSON.stringify(config), HARNESS_TASK_FILE: task, HARNESS_TASK_TIMEOUT_MS: '45000' };
const child = spawn(process.env.OPENCODE_BIN ?? 'opencode', ['serve', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = ''; child.stderr.on('data', x => { stderr += x; fs.writeFileSync(path.join(temp, 'server.log'), stderr); }); child.stdout.resume();
const api = async (method, route, body) => { const r = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) }); if (!r.ok) throw Error(await r.text()); return r.json(); };
try {
  let ready = false; for (let n = 0; n < 150; n++) { try { await api('GET', '/global/health'); ready = true; break; } catch { await new Promise(r => setTimeout(r, 100)); } } assert.ok(ready, stderr);
  const commands = await api('GET', '/command'); assert.ok(commands.some(c => c.name === 'harness-task'));
  const allModes = ['obligation-integration','obligation-test','obligation-extra','obligation-complete','obligation-no-progress','obligation-deny','exception-named-nested','exception-repair','exception-reject','exception-correct','correct', 'defect', 'unsupported', 'coverage-loss', 'last-mutation', 'cancel', 'incomplete', 'concurrent-save', 'staged-work','trailing-comma','missing-semantic','format-fails','src-affected','probe-production','missing-test','provenance','unverified','legacy-bookmark','evidence-replay','evidence-permission','evidence-user-reject','missing-error-paths','external-before-error','state-unchanged','state-external','state-unknown','state-revert','state-documentation','state-reproduce','budget'];
  const selectedModes = process.env.NATIVE_TASK_FIXTURE_CASES?.split(',') ?? allModes;
  assert.ok(selectedModes.every(m=>allModes.includes(m)));
  for (mode of selectedModes) {
    for(const file of ['consumer.mjs','consumer.test.mjs'])fs.rmSync(path.join(project,file),{force:true});
    for(const name of ['src','test'])fs.rmSync(path.join(project,name),{recursive:true,force:true});
    fs.writeFileSync(path.join(project,'package.json'),git('show','HEAD:package.json'));

    fs.writeFileSync(path.join(project, 'value.mjs'), 'export const value = 2;\n');
    fs.writeFileSync(path.join(project, 'value.test.mjs'), git('show','HEAD:value.test.mjs') + '\n');
    fs.writeFileSync(task, 'ORIGINAL_TASK_FIXTURE: Deliver value 2 from value.mjs and preserve the existing public test. Run node --test value.test.mjs.');
    if(mode.startsWith('obligation-')){
      fs.writeFileSync(path.join(project,'consumer.mjs'),['obligation-test','obligation-complete'].includes(mode)?"import {value} from './value.mjs';export const run=()=>value;\n":"export const run=()=>1;\n");
      if(mode==='obligation-complete')fs.writeFileSync(path.join(project,'consumer.test.mjs'),"import {test} from 'node:test';import assert from 'node:assert/strict';import {run} from './consumer.mjs';test('consumer requirement',()=>assert.equal(run(),2));\n");
      if(mode!=='obligation-extra')fs.appendFileSync(task,' Connect consumer.mjs run() to the value helper and add a consumer project regression; run both project tests after edits.');
    }
    if(mode.startsWith('exception-')){
      fs.mkdirSync(path.join(project,'src'));fs.mkdirSync(path.join(project,'test'));
      fs.writeFileSync(path.join(project,'src/timing.mjs'),mode==='exception-correct'?exceptionSource.replace('fn.apply(this,args)','Reflect.apply(fn,this,args)'):exceptionSource);
      fs.writeFileSync(path.join(project,'test/legacy.test.mjs'),exceptionLegacy);
      if(mode==='exception-correct')fs.writeFileSync(path.join(project,'test/exception.test.mjs'),exceptionRegression);
      fs.writeFileSync(path.join(project,'package.json'),JSON.stringify({private:true,scripts:{test:mode==='exception-named-nested'?'node --test --test-reporter=tap test/*.test.mjs':'node --test test/*.test.mjs'}}));
      fs.writeFileSync(task,fs.readFileSync(path.join(exceptionFixture,'task.txt')));
    }
    if (mode === 'missing-test') fs.appendFileSync(task,' Add an additional project regression in extra.test.mjs.');
    if (mode === 'staged-work') { fs.writeFileSync(path.join(project,'value.mjs'),'export const value = 2; // staged\n');git('add','value.mjs');fs.writeFileSync(path.join(project,'value.mjs'),'export const value = 2; // partial user work\n'); }
    // Native OpenCode may refresh index stat metadata; compare staged entries/contents.
    const originalIndex=git('ls-files','--stage','-z');
    const session = await api('POST', '/session', mode==='obligation-deny'?{permission:[{permission:'bash',pattern:'node -e *',action:'deny'}]}:['evidence-permission','evidence-user-reject'].includes(mode)?{permission:[{permission:'bash',pattern:'node *',action:mode==='evidence-user-reject'?'ask':'deny'}]}:{});
    priorArtifacts = new Set(fs.existsSync(path.join(project,'.git/harness-task'))?fs.readdirSync(path.join(project,'.git/harness-task')):[]);
    const pending = api('POST', `/session/${session.id}/command`, { command: 'harness-task', arguments: '', model: 'local-fixture/fixture' });
    if(mode==='evidence-user-reject'){
      let request, permissionDirectory;
      for(let n=0;n<150&&!request;n++){
        const base=path.join(project,'.git/harness-task'),fresh=fs.existsSync(base)?fs.readdirSync(base).filter(n=>!priorArtifacts.has(n)):[];
        if(fresh.length===1){permissionDirectory=path.join(base,fresh[0],'worktree');const pendingPermissions=await api('GET','/permission?directory='+encodeURIComponent(permissionDirectory));request=pendingPermissions.find(p=>p.permission==='bash');}
        if(!request)await new Promise(r=>setTimeout(r,100));
      }
      assert.ok(request,'Native permission prompt must be observed');
      await api('POST',`/permission/${request.id}/reply?directory=${encodeURIComponent(permissionDirectory)}`,{reply:'reject'});
    }
    if (mode === 'concurrent-save') {
      for (let n = 0; n < 150 && !requests.some(r => r.mode === mode && r.stage === 'implementation' && r.n === 1); n++) await new Promise(r => setTimeout(r, 100));
      fs.writeFileSync(path.join(project,'value.mjs'),'export const value = 99; // USER_SAVE\n');
    }
    if (mode === 'cancel') {
      for (let n = 0; n < 150 && !requests.some(r => r.mode === 'cancel' && r.stage === 'implementation' && r.n === 1); n++) await new Promise(r => setTimeout(r, 100));
      await api('POST', `/session/${session.id}/abort`, {});
    }
    const result = await pending;
    const messages = await api('GET', `/session/${session.id}/message`);
    fs.writeFileSync(path.join(temp, `${mode}-messages.json`), JSON.stringify(messages, null, 2));
    const toolResult = messages.flatMap(m => m.parts).find(p => p.type === 'tool' && p.tool === 'harness_task');
    if (['cancel','budget'].includes(mode)) { assert.ok(!requests.some(r => r.mode === mode && ['review','format','repair'].includes(r.stage))); continue; }
    assert.equal(toolResult?.state.status, 'completed', JSON.stringify({ result, toolResult, temp }));
    const report = JSON.parse(toolResult.state.output);
    assert.equal(git('ls-files','--stage','-z'),originalIndex);
    if(mode.startsWith('obligation-')){
      const count=requests.filter(r=>r.mode===mode&&r.stage==='continuation'&&r.n===0).length;
      assert.equal(count,['obligation-integration','obligation-no-progress','obligation-deny'].includes(mode)?1:0,JSON.stringify(report));
      assert.equal(report.status,['obligation-no-progress','obligation-deny'].includes(mode)?'incomplete':'reviewed_delivery',JSON.stringify(report));
      assert.equal(report.evidenceCorrections,0);
      assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.mjs'),'utf8'),'export const value = 2;\n');
      if(['obligation-integration','obligation-test'].includes(mode)){
        const check=spawnSync(process.execPath,['--test','value.test.mjs','consumer.test.mjs'],{cwd:report.executionDirectory,encoding:'utf8'});assert.equal(check.status,0,check.stdout+check.stderr);
        assert.ok(fs.readFileSync(path.join(report.executionDirectory,'consumer.test.mjs'),'utf8').includes('assert.equal(run(),2)'));
        assert.equal(report.implementationContinuations,mode==='obligation-integration'?1:0);
      }
      if(mode==='obligation-deny')assert.equal(report.repairs,0);
    }
    if(mode.startsWith('exception-')){
      const events=JSON.parse(fs.readFileSync(path.join(report.artifacts,'tool-events.json')));
      assert.equal(report.repairs,['exception-repair','exception-named-nested'].includes(mode)?1:0,JSON.stringify(report));
      assert.equal(report.evidenceCorrections,mode==='exception-correct'?0:1);
      assert.equal(report.status,mode==='exception-reject'?'incomplete':'reviewed_delivery',JSON.stringify(report));
      assert.equal(fs.readFileSync(path.join(report.executionDirectory,'test/legacy.test.mjs'),'utf8'),exceptionLegacy);
      if(['exception-repair','exception-named-nested'].includes(mode)){
        assert.ok(events.some(e=>e.exit===0&&e.args?.command===exceptionInline&&e.output.includes('TypeError')));
        const failure=events.find(e=>e.nodeTest?.failure==='product-exception'&&e.exit===1);assert.ok(failure,JSON.stringify(events));
        if(mode==='exception-named-nested'){assert.ok(failure.output.includes('TestContext.namedInvocation'));assert.equal(fs.readFileSync(path.join(report.executionDirectory,'test/exception.test.mjs'),'utf8'),namedNestedRegression);}
        assert.equal(failure.args.command,'npm test');assert.ok(failure.output.includes('TypeError'));
        const passed=events.findLast(e=>e.args?.command==='npm test'&&e.exit===0);assert.ok(passed);
        assert.equal(passed.before,passed.after);assert.ok(events.indexOf(passed)>events.indexOf(failure));
        assert.ok(passed.output.includes('tests 4'));assert.ok(passed.output.includes('pass 4'));
        assert.equal(fs.readFileSync(path.join(report.executionDirectory,'src/timing.mjs'),'utf8'),exceptionSource.replace('fn.apply(this,args)','Reflect.apply(fn,this,args)'));
        assert.ok(fs.readFileSync(path.join(report.artifacts,'D1.patch'),'utf8').includes('Reflect.apply'));
      }else assert.ok(!requests.some(r=>r.mode===mode&&r.stage==='repair'));
    }
    if (mode === 'staged-work') { assert.equal(report.status,'reviewed_delivery',JSON.stringify(report));assert.equal(fs.readFileSync(path.join(project,'value.mjs'),'utf8'),'export const value = 2; // partial user work\n');git('restore','--staged','value.mjs'); }
    if (mode === 'concurrent-save') assert.equal(fs.readFileSync(path.join(project,'value.mjs'),'utf8'),'export const value = 99; // USER_SAVE\n');
    if (['correct','trailing-comma','provenance','missing-test'].includes(mode)) { assert.equal(report.repairs, 0); assert.equal(report.status, 'reviewed_delivery'); }
    if (['defect','src-affected','missing-error-paths'].includes(mode)) { assert.equal(report.repairs, 1, JSON.stringify(report)); assert.equal(report.status, 'reviewed_delivery'); assert.equal(fs.readFileSync(path.join(report.executionDirectory, 'value.mjs'), 'utf8'), 'export const value = 2;\n'); }
    if (mode === 'unsupported') { assert.equal(report.repairs, 0); assert.equal(report.dispositions[0].decision, 'rejected'); assert.equal(report.status, 'reviewed_delivery'); }
    if (mode === 'coverage-loss') assert.ok(report.review.coverageLost.length);
    if (['last-mutation', 'incomplete'].includes(mode)) assert.equal(report.status, 'incomplete');
    if(['missing-semantic','format-fails','probe-production','unverified'].includes(mode)) assert.equal(report.status,'incomplete',JSON.stringify(report));
    if(['trailing-comma','missing-semantic','format-fails'].includes(mode)) assert.equal(requests.filter(r=>r.mode===mode&&r.stage==='format').length,1);
    if(mode==='missing-test'){assert.ok(fs.existsSync(path.join(report.executionDirectory,'extra.test.mjs')));assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.mjs'),'utf8'),'export const value = 2;\n');}
    if(mode==='legacy-bookmark'){
      assert.equal(report.status,'incomplete');assert.equal(report.repairs,0);
      assert.ok(requests.some(r=>r.mode===mode&&r.stage==='reproduce'));
      assert.equal(requests.filter(r=>r.mode===mode&&r.stage==='format').length,0);
      assert.equal(JSON.parse(fs.readFileSync(path.join(report.artifacts,'review-0-original.json'))).parts.filter(p=>p.type==='text').map(p=>p.text).join('\n'),legacyReview);
      const adapted=JSON.parse(fs.readFileSync(path.join(report.artifacts,'review-0-adapted.json')));
      assert.deepEqual(adapted.proposedVerificationFiles,JSON.parse(legacyReview).verificationFiles);
      assert.deepEqual(adapted.unverified,JSON.parse(legacyReview).unverified);
    }
    if(['evidence-permission','evidence-user-reject'].includes(mode)){
      assert.equal(report.status,'incomplete',JSON.stringify(report));assert.equal(report.repairs,0);assert.equal(report.evidenceCorrections,0);
      assert.ok(!requests.some(r=>r.mode===mode&&['evidence-correction','repair'].includes(r.stage)));
      assert.ok(fs.existsSync(path.join(report.artifacts,'permission-violation.json')),'Actual native permission error must be retained');
    }
    if(mode.startsWith('state-')){
      const events=JSON.parse(fs.readFileSync(path.join(report.artifacts,'tool-events.json')));
      assert.equal(report.status,['state-unchanged','state-documentation','state-reproduce'].includes(mode)?'reviewed_delivery':'incomplete',JSON.stringify(report));
      if(['state-unchanged','state-documentation','state-reproduce'].includes(mode)){
        const denied=events.find(e=>e.stateObservation);assert.ok(denied,JSON.stringify(events));assert.equal(denied.before,null);assert.equal(denied.state,'error');
        assert.equal(denied.stateObservation.snapshot,denied.after);
      }
      if(mode==='state-reproduce'){assert.equal(report.repairs,1);assert.equal(report.evidenceCorrections,0);}
      if(mode==='state-external'){
        assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.mjs'),'utf8'),'export const value = 99; // external save\n');
        assert.ok(events.some(e=>e.before===null&&e.scopeViolation));assert.ok(!requests.some(r=>r.mode===mode&&['review','repair'].includes(r.stage)));
      }
      if(mode==='state-unknown')assert.ok(events.some(e=>e.before===null&&!e.stateObservation));
      if(mode==='state-revert')assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.mjs'),'utf8'),'export const value = 2;\n');
    }
    if(mode==='external-before-error'){
      assert.equal(report.status,'incomplete');assert.equal(report.repairs,0);assert.equal(report.evidenceCorrections,0);
      const events=JSON.parse(fs.readFileSync(path.join(report.artifacts,'tool-events.json')));
      assert.ok(events.some(e=>e.before===null&&e.scopeViolation===true));
      assert.ok(!events.some(e=>e.state==='completed'));
      assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.mjs'),'utf8'),'export const value = 99; // external save\n');
    }
    if(mode==='missing-error-paths'){
      assert.equal(report.repairs,1);assert.equal(report.status,'reviewed_delivery');assert.equal(report.evidenceCorrections,0);
      const events=JSON.parse(fs.readFileSync(path.join(report.artifacts,'tool-events.json')));
      for(const name of ['permissions.mjs','rejected-events.test.mjs','protected-fields.mjs'])assert.ok(events.some(e=>e.state==='error'&&e.output.includes(name)&&e.permissionDenied===false));
      assert.ok(events.some(e=>e.tool==='read'&&e.state==='completed'));
      assert.ok(!fs.existsSync(path.join(report.artifacts,'permission-violation.json')));
    }
    if(mode==='evidence-replay'){
      assert.equal(report.repairs,1,JSON.stringify(report));assert.equal(report.evidenceCorrections,1);assert.equal(report.status,'reviewed_delivery');
      assert.equal(requests.filter(r=>r.mode===mode&&r.stage==='format').length,0);
      const first=JSON.parse(fs.readFileSync(path.join(report.artifacts,'reproduce-1-original.json')));
      const correction=JSON.parse(fs.readFileSync(path.join(report.artifacts,'reproduce-1-evidence-correction-original.json')));
      assert.equal(first.info.sessionID,correction.info.sessionID,'Same author session');
      assert.equal(first.parts.filter(p=>p.type==='text').map(p=>p.text).join('\n'),replayDisposition);
      const events=JSON.parse(fs.readFileSync(path.join(report.artifacts,'tool-events.json')));
      assert.ok(!events.some(e=>e.output?.includes('HOST_NATIVE_EVIDENCE')),'Host supplement must not become assertion evidence');
      assert.ok(events.some(e=>e.exit===1&&e.args.command.includes('test/storage.test.mjs')));
      assert.ok(events.some(e=>e.exit===0&&e.args.command.includes('test/storage.test.mjs')&&e.args.command.startsWith('node --test')));
      assert.equal(fs.readFileSync(path.join(project,'value.mjs'),'utf8'),'export const value = 2;\n');
    }
    if(['defect','missing-test'].includes(mode))assert.equal(report.evidenceCorrections,0);
    if(mode==='src-affected')assert.ok(report.rejectedWriteProposals.includes('value.mjs'));
    console.log(JSON.stringify({ mode, status: report.status, repairs: report.repairs, artifacts: report.artifacts }));
  }
  console.log(JSON.stringify({ passed: true, installedWorkflow: true, scenarios: selectedModes.length, realProviderRequests: 0, scriptedRequests: requests.length, temp }));
} finally {
  if (child.exitCode === null) await new Promise(resolve => { const timer = setTimeout(() => child.kill('SIGKILL'), 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM'); });
  fixture.closeAllConnections(); await new Promise(r => fixture.close(r));
}
