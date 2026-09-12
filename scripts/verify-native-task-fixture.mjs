// Installed native-session workflow fixture: control-flow evidence, zero model-quality claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stale, guarded, repaired } from '../fixtures/native-stateful/tests.mjs';
import { materializeNativeTemplate } from '../lib/native-template.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-task-fixture-'));
for (const name of ['home', 'config', 'data', 'cache', 'state', 'project']) fs.mkdirSync(path.join(temp, name));
const project = path.join(temp, 'project'), bundle = path.join(temp, 'bundle'), task = path.join(temp, 'task.txt');
const git = (...args) => { const r = spawnSync('git', args, { cwd: project, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
git('init', '-q');

const source = 'export const value = 2; export const legacy = () => 7;\n';
const originalTest = "import {value,legacy} from './value.mjs'; import assert from 'node:assert/strict'; import {test} from 'node:test';\ntest('public requirement',()=>{assert.equal(value,2);assert.equal(legacy(),7);});\n";
const reducedTest = originalTest.replace('assert.equal(legacy(),7);','');
fs.writeFileSync(path.join(project,'value.mjs'),source);
fs.writeFileSync(path.join(project,'value.test.mjs'),originalTest);
fs.writeFileSync(path.join(project,'package.json'),JSON.stringify({private:true,scripts:{test:'node --test'}}));
fs.writeFileSync(path.join(project,'opencode.json'),JSON.stringify({$schema:'https://opencode.ai/config.json',permission:{task:'allow',bash:'allow'}}));
git('add','.');git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','base');
materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,task:true,review:true});
const ordinaryErrorModes=['missing-read','edit-context'];
const continuationModes=['external-path','external-argument','bash-denial','second-denial'];
const forbiddenContent='UNREAD_NATIVE_DENIAL_SENTINEL';
const denialText='The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules '+JSON.stringify([{permission:'bash',pattern:'*',action:'deny'}]);
let mode='correct',requests=[],auxiliaryRequests=[],providerRequests=0,counts=new Map(),priorArtifacts=new Set();
const writeFixture=(file,bytes)=>`node -e 'require("fs").writeFileSync(${JSON.stringify(file)},Buffer.from(${JSON.stringify(Buffer.from(bytes).toString('base64'))},"base64"))'`;
const response = (res, call, content = '') => {
  if (call?.name === 'StructuredOutput') { content = JSON.stringify(call.args); call = null; }
  const delta = call ? { role: 'assistant', tool_calls: (Array.isArray(call)?call:[call]).map((c,index)=>({ index, id: c.id ?? `fixture-${requests.length}-${index}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : { role: 'assistant', content };
  const base = { id: `response-${requests.length}`, object: 'chat.completion.chunk', created: 1, model: 'fixture' };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
};

const fixture=http.createServer(async(req,res)=>{
 try {
  const chunks=[];for await(const x of req)chunks.push(x);
  providerRequests++;
  const body=JSON.parse(Buffer.concat(chunks)), user=body.messages.findLast(m=>m.role==='user');
  const text=typeof user?.content==='string'?user.content:user?.content?.map(p=>p.text??'').join('\n')??'';
  if(process.env.NATIVE_SELECTION_LIFECYCLE==='1'){
   fs.appendFileSync(path.join(project,'lifecycle-requests.jsonl'),JSON.stringify({text})+'\n');
   const content='RESULT behavior | required public behavior | X=confirmed | Y=missing | X: scripted consumer evidence; Y: scripted missing behavior\nDECISION: X';
   if(text.includes('partial')){res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify({choices:[{delta:{content},finish_reason:null}]})+'\n\n');return;}
   response(res,null,text.includes('no-decision')?'Research observations only':content);return;
  }
  if(process.env.NATIVE_SELECTION_FIXTURE==='1'){
   const all=JSON.stringify(body.messages),final=text.includes('Planned decision stage');
   requests.push({selection:true,final});
   if(final){assert.ok(!body.tools?.length,'Final request must be tool free');assert.ok(all.includes('STATE_X_OK')&&all.includes('STATE_Y_OK'),'Real native command results reach final session');response(res,null,'RESULT public | public consumer behavior | X=confirmed | Y=confirmed | X: actual node diagnostic STATE_X_OK; Y: actual node diagnostic STATE_Y_OK\nDECISION: X\nBoth scripted fixture candidates satisfy the fixture contract.');return;}
   const n=counts.get('selection')??0;counts.set('selection',n+1);
   const bash=(label,command)=>({name:'bash',args:{command,workdir:'/input/'+label,timeout:120000,description:'Selection fixture '+label}});
   const probe=label=>`node -e 'const fs=require("fs"),assert=require("assert/strict");for(const key of ["HOME","TMPDIR","XDG_CONFIG_HOME","XDG_DATA_HOME","XDG_CACHE_HOME","XDG_STATE_HOME"])assert.ok(process.env[key].startsWith("/work/diagnostics/${label}/"),key);assert.equal(fs.readFileSync("/work/diagnostics/native-probe.txt","utf8").trim(),"native scratch");fs.writeFileSync(process.env.HOME+"/state","${label}");assert.equal(require("./consumer.cjs").render(),7);console.log("STATE_${label}_OK");'`;
   const calls=[{name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Add File: /work/diagnostics/native-probe.txt\n+native scratch\n*** End Patch'}},bash('X',probe('X')),bash('Y',probe('Y')),bash('X',"node -e 'setInterval(()=>{},1000)' ")];
   if(n>=3)assert.ok(all.includes('STATE_X_OK')&&all.includes('STATE_Y_OK'));
   if(n===4&&process.env.NATIVE_SELECTION_DELAY==='1')await new Promise(r=>setTimeout(r,2500));
   response(res,calls[n]??null,n===4&&process.env.NATIVE_SELECTION_DECISION==='1'?'RESULT public | public consumer behavior | X=confirmed | Y=confirmed | X: actual node diagnostic STATE_X_OK; Y: actual node diagnostic STATE_Y_OK\nDECISION: X':'Research complete; proceed to planned decision.');return;
  }
  if(!body.tools?.length){auxiliaryRequests.push({mode});response(res,null,'Fixture title');return;}
  assert.ok(!JSON.stringify(body).includes(forbiddenContent),'Forbidden resource content must never reach the provider');
  const stage=text.includes('Corrective pass')?'correction':text.includes('Implement the complete original task')?'implementation':'bootstrap';
  const pass=stage==='correction'?JSON.parse(text).pass:0;
  const key=mode+stage+pass,n=counts.get(key)??0;counts.set(key,n+1);requests.push({mode,stage,n});
  const bash=command=>({name:'bash',args:{command,description:'Installed scripted fixture'}});
  if(stage==='bootstrap'){response(res,n===0?{name:'harness_task',args:{}}:null,'Actual workflow result retained');return;}
  let calls=[];
  if(stage==='implementation') {
   if(mode==='stateful') {
    assert.ok(text.includes('state the action will actually use immediately before'));
    calls=[bash(writeFixture('example.test.mjs',guarded)),bash('node --test')];
   }
   else if(['container-parallel-read-error','container-parallel-denial'].includes(mode))calls=[[{name:'read',args:{filePath:'value.mjs'}},{name:'glob',args:{pattern:'*.mjs'}}],[mode==='container-parallel-read-error'?{name:'read',args:{filePath:'missing-source.mjs'}}:{name:'bash',args:{command:'pwd',workdir:'/work',description:'Outside project permission preflight'}},{name:'edit',args:{filePath:'value.mjs',oldString:'export const value = 2;',newString:'export const value = 2; // queued after error\n'}},bash('node --test'),bash('git diff --check')]];
   else if(mode==='container-parallel')calls=[[{name:'read',args:{filePath:'value.mjs'}},{name:'glob',args:{pattern:'*.mjs'}}],[{name:'edit',args:{filePath:'value.mjs',oldString:'export const value = 2;',newString:'export const value = 2; // queued container\n'}},bash('node --test'),bash('git diff --check')]];
   else if(mode==='container-preflight')calls=[{name:'read',args:{filePath:'value.mjs'}},{name:'glob',args:{pattern:'*.mjs'}},{name:'edit',args:{filePath:'value.mjs',oldString:'export const value = 2;',newString:'export const value = 2; // container\n'}},bash('node --test')];
   else if(['defect','two-fixes','no-progress','comment-only'].includes(mode))calls=[bash(writeFixture('value.mjs',(mode==='two-fixes'?source.replace('value = 2','value = 1').replace('() => 7','() => 8'):source.replace('value = 2','value = 1')))),bash('node --test')];
   else if(mode==='coverage-loss')calls=[bash(writeFixture('value.test.mjs',reducedTest)),bash('node --test')];
   else if(mode==='intentional')calls=[bash(writeFixture('value.mjs',source.replace('value = 2','value = 3'))),bash(writeFixture('value.test.mjs',originalTest.replace('value,2','value,3'))),bash('node --test')];
   else if(mode==='relocation')calls=[bash('mv value.test.mjs moved.test.mjs'),bash('node --test')];
   else if(['late-check','final-stale'].includes(mode))calls=[bash('node --test'),bash(writeFixture('value.mjs',source+'// last edit\n'))];
   else if(mode==='diagnostic')calls=[bash('node --test'),bash('node --test --test-name-pattern="[" value.test.mjs')];
   else if(mode==='unresolved')calls=[bash(writeFixture('value.mjs',source.replace('value = 2','value = 1'))),bash('node --test value.test.mjs')];
   else if(['variant','both-required'].includes(mode))calls=[bash('node --test --test-concurrency=1 value.test.mjs'),bash(writeFixture('value.mjs',source+'// edit\n')),bash('node --test value.test.mjs')];
   else if(mode==='narrow')calls=[bash('node --test --test-name-pattern=public value.test.mjs')];
   else if(['worktree-path',...continuationModes].includes(mode)) {
    const artifacts=path.join(project,'.git/harness-task'),id=fs.readdirSync(artifacts).find(id=>!priorArtifacts.has(id)),worktree=fs.realpathSync(path.join(artifacts,id,'worktree'));
    calls=[{...bash(writeFixture('value.mjs',source+'// allowed worktree\n')),args:{...bash('').args,command:writeFixture('value.mjs',source+'// allowed worktree\n'),workdir:worktree}}, {...bash('node --test'),args:{...bash('').args,command:'node --test',workdir:worktree}}];
    if(continuationModes.includes(mode)) {
     const parent=path.dirname(worktree),secret=path.join(parent,'forbidden-input.txt');
     if(n===0)fs.writeFileSync(secret,forbiddenContent);
     const denied=mode==='bash-denial'?bash('printf forbidden'):{name:'bash',args:{command:mode==='external-argument'?'cat '+JSON.stringify(secret)+' && '+writeFixture('forbidden.txt','forbidden'):writeFixture('forbidden.txt','forbidden'),description:'Must remain denied',workdir:mode==='external-argument'?worktree:parent}};
     calls=[denied,bash(writeFixture('value.mjs',source.replace('value = 2','value = 3'))),bash(writeFixture('value.test.mjs',originalTest.replace('value,2','value,3'))),bash('npm test'),bash('git diff --check')];
     if(mode==='second-denial')calls.splice(1,0,denied);
     if(n===1){
      assert.ok(JSON.stringify(body.messages).includes('The user has specified a rule which prevents'));
      assert.ok(body.messages.some(m=>m.role==='system'&&JSON.stringify(m.content).includes('Do not repeat the forbidden operation')));
     }
    }
   }
   else if(ordinaryErrorModes.includes(mode)){
    const read=filePath=>({name:'read',args:{filePath}});
    const edit=(filePath,oldString,newString)=>({name:'edit',args:{filePath,oldString,newString}});
    calls=[read('value.mjs'),edit('value.mjs','value = 2','value = 3'),read('value.test.mjs'),edit('value.test.mjs','value,2','value,3'),bash('npm test'),bash('git diff --check')];
    if(mode==='missing-read')calls.unshift(read('missing-source.mjs'));
    else calls.splice(1,0,edit('value.mjs','value = 999','value = 3'),read('value.mjs'));
    if(n===(mode==='missing-read'?1:2))assert.ok(body.messages.some(m=>m.role==='tool'&&JSON.stringify(m.content).includes(mode==='missing-read'?'File not found:':'Could not find oldString')), 'Author must receive the native error before choosing the next action');
   }
   else if(mode==='permission')calls=[bash('printf forbidden')];
   else if(mode==='unknown-error')calls=[{name:'bash',args:{command:writeFixture('forbidden.txt','bad'),timeout:-1,description:'Native validation error'}}];
   else if(['stdout-denial','runtime-error'].includes(mode))calls=[bash('node -e '+JSON.stringify('console.log('+JSON.stringify(denialText)+');process.exit('+(mode==='runtime-error'?1:0)+')')),bash('npm test')];
   else if(mode==='cancel'||mode==='budget')calls=[bash('node --test'),bash("sleep 30 & sleeper=$!; printf '%s' \"$sleeper\" > sleeper.pid; wait \"$sleeper\"")];
   else if(mode==='concurrent-save')calls=[bash('sleep 0.5'),bash('node --test')];
   else if(mode==='external-save') {
    if(n===0){const base=path.join(project,'.git/harness-task'),id=fs.readdirSync(base).find(id=>!priorArtifacts.has(id));fs.writeFileSync(path.join(base,id,'worktree/value.mjs'),source+'// external edit\n');}
    calls=[bash('node --test')];
   }
   else calls=[bash('node --test')];
  } else {
   const feedback=JSON.parse(text);assert.ok(feedback.originalTask.includes('ORIGINAL_TASK_FIXTURE'));assert.ok(feedback.current.diff!==undefined);
   if(mode==='stateful'){assert.ok(feedback.observations.checks.some(c=>c.exit===1&&c.output.includes('undefined')));calls=[bash(writeFixture('example.test.mjs',repaired)),bash('node --test')];}
   else if(mode==='coverage-loss'){assert.ok(feedback.observations.checks.some(c=>c.successful&&c.current));assert.ok(feedback.observations.testChanges[0].before.includes('legacy(),7'));assert.ok(feedback.observations.testChanges[0].diff.includes('-test'));calls=[bash(writeFixture('value.test.mjs',originalTest)),bash('node --test')];}
   else if(mode==='intentional'){assert.ok(feedback.instruction.includes('Do not restore an old expectation'));assert.ok(feedback.observations.testChanges[0].after.includes('value,3'));calls=[];}
   else if(mode==='relocation'){assert.equal(feedback.observations.testChanges[0].assessment,'not_automatically_classified');assert.ok(feedback.observations.addedTests.some(t=>t.content===originalTest));calls=[];}
   else if(mode==='defect'){assert.ok(feedback.observations.checks.some(c=>c.exit===1&&/not ok|✖/.test(c.output)));calls=[bash(writeFixture('value.mjs',source)),bash('node --test')];}
   else if(mode==='both-required')calls=[bash('node --test --test-concurrency=1 value.test.mjs')];
   else if(mode==='narrow')calls=[bash('node --test value.test.mjs')];
   else if(mode==='late-check')calls=[bash('node --test')];
   else if(mode==='final-stale')calls=[bash('node --test'),bash(writeFixture('value.mjs',source+'// still stale '+pass+'\n'))];
   else if(mode==='no-progress')calls=[bash('node --test')];
   else if(mode==='unresolved')calls=[bash('node --test value.test.mjs')];
   else if(mode==='comment-only')calls=[bash(writeFixture('value.mjs',source.replace('value = 2','value = 1')+'// comment '+pass+'\n')),bash('node --test')];
   else if(mode==='two-fixes'){assert.ok(feedback.observations.latestChecks.some(c=>c.exit===1));if(pass===2)assert.ok(feedback.observations.latestChecks.some(c=>c.output.includes('8')));calls=[bash(writeFixture('value.mjs',pass===1?source.replace('() => 7','() => 8'):source)),bash('node --test')];}
   else assert.fail('Unexpected corrective stage '+mode);
  }
  response(res,calls[n]??null,stage==='correction'?'Investigated factual feedback; exact result is in the project and native events.':'Implementation finished.');
 }catch(e){res.writeHead(500);res.end(e.stack);console.error(e.stack);}
});
await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
if(process.env.NATIVE_TASK_FIXTURE_PROVIDER_ONLY==='1'){
 mode=({'1':'container-parallel','read-error':'container-parallel-read-error','denial':'container-parallel-denial'})[process.env.NATIVE_TASK_FIXTURE_PARALLEL]??'container-preflight';fs.writeFileSync(path.join(project,'TASK.md'),'ORIGINAL_TASK_FIXTURE: Deliver value 2 and preserve legacy scenario; run node --test.');
 console.log(JSON.stringify({fixtureURL:`http://127.0.0.1:${fixture.address().port}`,project}));
 await new Promise(resolve=>process.once('SIGTERM',()=>fixture.close(resolve)));fs.rmSync(temp,{recursive:true,force:true});process.exit(0);
}
const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const config = { model: 'local-fixture/fixture', small_model: 'local-fixture/fixture', provider: { 'local-fixture': { npm: '@ai-sdk/openai-compatible', name: 'Scripted fixture', options: { baseURL: `http://127.0.0.1:${fixture.address().port}/v1`, apiKey: 'not-a-credential' }, models: { fixture: { name: 'fixture', limit: { context: 200000, output: 10000 } } } } } };
const env = { PATH: process.env.PATH, HOME: path.join(temp, 'home'), TMPDIR: os.tmpdir(), ...Object.fromEntries(['config', 'data', 'cache', 'state'].map(n => [`XDG_${n.toUpperCase()}_HOME`, path.join(temp, n)])), OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_CONFIG_DIR: bundle, OPENCODE_CONFIG_CONTENT: JSON.stringify(config), HARNESS_TASK_FILE: task, HARNESS_TASK_TIMEOUT_MS: '20000' };
const child = spawn(process.env.OPENCODE_BIN ?? 'opencode', ['serve', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = ''; child.stderr.on('data', x => { stderr += x; fs.writeFileSync(path.join(temp, 'server.log'), stderr); }); child.stdout.resume();
const api = async (method, route, body) => { const r = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) }); if (!r.ok) throw Error(await r.text()); return r.json(); };

try {
 let ready=false;for(let n=0;n<150;n++){try{await api('GET','/global/health');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert.ok(ready,stderr);
 const allModes=[...ordinaryErrorModes,'stateful','variant','both-required','narrow','worktree-path','external-path','external-argument','bash-denial','second-denial','stdout-denial','runtime-error','unknown-error','diagnostic','unresolved','correct','two-fixes','comment-only','defect','coverage-loss','intentional','relocation','late-check','final-stale','no-progress','permission','cancel','budget','concurrent-save','staged-work','external-save'];
 const selectedModes=process.env.NATIVE_TASK_FIXTURE_MODES?.split(',')??allModes;
 for(mode of selectedModes){
  git('reset','--hard','HEAD');git('clean','-fd');
  const artifactRoot=path.join(project,'.git/harness-task');priorArtifacts=new Set(fs.existsSync(artifactRoot)?fs.readdirSync(artifactRoot):[]);
  fs.writeFileSync(task,'ORIGINAL_TASK_FIXTURE: Deliver value '+(mode==='intentional'?'3 instead of 2':'2')+'; preserve the independent legacy() = 7 scenario. Run node --test after the last edit.');
  if(continuationModes.includes(mode)||ordinaryErrorModes.includes(mode))fs.writeFileSync(task,'ORIGINAL_TASK_FIXTURE: Change value from 2 to 3 and update its public test expectation, preserving the independent legacy() = 7 scenario. Run `npm test` and `git diff --check`.');
  if(['stdout-denial','runtime-error'].includes(mode))fs.writeFileSync(task,'ORIGINAL_TASK_FIXTURE: Preserve value 2 and legacy() = 7; run `npm test`.');
  if(['variant','both-required','narrow'].includes(mode))fs.appendFileSync(task,' Required: `node --test value.test.mjs`.'+(mode==='both-required'?' Also required: `node --test --test-concurrency=1 value.test.mjs`.':''));
  if(mode==='stateful'){fs.copyFileSync(path.join(root,'fixtures/native-stateful/example.mjs'),path.join(project,'example.mjs'));fs.writeFileSync(path.join(project,'example.test.mjs'),stale);fs.appendFileSync(task,' Preserve the clear scenario and test consumption of an existing item through consume plus empty idempotency.');}
  if(mode==='staged-work'){fs.writeFileSync(path.join(project,'value.mjs'),source+'// staged user bytes\n');git('add','value.mjs');fs.appendFileSync(path.join(project,'value.mjs'),'// unstaged user bytes\n');}
  const userBytes=fs.readFileSync(path.join(project,'value.mjs'),'utf8'),index=git('ls-files','--stage','-z');
  const session=await api('POST','/session',{permission:['permission','bash-denial'].includes(mode)?[{permission:'bash',pattern:'printf forbidden',action:mode==='permission'?'ask':'deny'}]:continuationModes.includes(mode)?[{permission:'external_directory',pattern:'*',action:'deny'}]:[]});
  const pending=api('POST',`/session/${session.id}/command`,{command:'harness-task',arguments:'',agent:'build',model:'local-fixture/fixture'});
  if(mode==='permission'){
   pending.catch(()=>{});let asks=[],denialDirectory;
   for(let i=0;i<200&&!asks.length;i++){
    const ids=fs.existsSync(artifactRoot)?fs.readdirSync(artifactRoot).filter(id=>!priorArtifacts.has(id)):[];
    if(ids.length===1){denialDirectory=path.join(artifactRoot,ids[0],'worktree');asks=await api('GET','/permission?directory='+encodeURIComponent(denialDirectory));}
    if(!asks.length)await new Promise(r=>setTimeout(r,30));
   }
   assert.equal(asks.length,1);assert.equal(asks[0].permission,'bash');
   await api('POST',`/permission/${asks[0].id}/reply?directory=${encodeURIComponent(denialDirectory)}`,{reply:'reject'});
  }
  let sleeperPID;
  if(['cancel','budget','concurrent-save'].includes(mode)){
   if(mode==='concurrent-save'){
    for(let i=0;i<100&&!requests.some(r=>r.mode===mode&&r.stage==='implementation'&&r.n>=1);i++)await new Promise(r=>setTimeout(r,30));
    fs.writeFileSync(path.join(project,'value.mjs'),source+'// concurrent USER_SAVE\n');
   } else {
    for(let i=0;i<300&&!sleeperPID;i++){
     const ids=fs.existsSync(artifactRoot)?fs.readdirSync(artifactRoot).filter(id=>!priorArtifacts.has(id)):[];
     const pidFile=ids.length===1?path.join(artifactRoot,ids[0],'worktree/sleeper.pid'):null;
     if(pidFile&&fs.existsSync(pidFile))sleeperPID=Number(fs.readFileSync(pidFile,'utf8'));
     else await new Promise(r=>setTimeout(r,30));
    }
    assert.ok(sleeperPID>1,'Real sleep process must start');process.kill(sleeperPID,0);
    if(mode==='cancel')await api('POST',`/session/${session.id}/abort`);
   }
  }
  const result=await pending;
  const messages=await api('GET',`/session/${session.id}/message`);
  const part=messages.flatMap(m=>m.parts).find(p=>p.type==='tool'&&p.tool==='harness_task');
  if(mode==='cancel'||mode==='budget'){
   assert.ok(!requests.some(r=>r.mode===mode&&r.stage==='correction'));
   let stopped=false;
   for(let i=0;i<100&&!stopped;i++){try{process.kill(sleeperPID,0);await new Promise(r=>setTimeout(r,30));}catch(e){assert.equal(e.code,'ESRCH');stopped=true;}}
   assert.ok(stopped,'Native abort must terminate the observed child process');
   const ids=fs.readdirSync(artifactRoot).filter(id=>!priorArtifacts.has(id));assert.equal(ids.length,1);
   const artifacts=path.join(artifactRoot,ids[0]),terminationFile=path.join(artifacts,'termination.json');
   for(let i=0;i<100&&!fs.existsSync(terminationFile);i++)await new Promise(resolve=>setTimeout(resolve,30));
   assert.equal(JSON.parse(fs.readFileSync(terminationFile)).verified,true);
   const terminal=path.join(artifacts,'terminal.patch'),bytes=fs.readFileSync(terminal,'utf8');
   await new Promise(resolve=>setTimeout(resolve,100));assert.equal(fs.readFileSync(terminal,'utf8'),bytes);
   console.log(JSON.stringify({mode,cancelled:true,processTerminated:true,terminalPatchStable:true}));continue;
  }
  assert.equal(part?.state.status,'completed',JSON.stringify({mode,part,result,temp}));const report=JSON.parse(part.state.output);
  assert.equal(git('ls-files','--stage','-z'),index);
  assert.equal(fs.readFileSync(path.join(project,'value.mjs'),'utf8'),mode==='concurrent-save'?source+'// concurrent USER_SAVE\n':userBytes);
  const corrected=['stateful','both-required','narrow','defect','two-fixes','comment-only','late-check','final-stale','no-progress'].includes(mode);
  assert.equal(report.repairs,['two-fixes','comment-only','no-progress','unresolved'].includes(mode)?2:mode==='final-stale'?2:corrected?1:0,JSON.stringify(report));assert.deepEqual(Object.keys(report.sessions),['author']);
  assert.equal(report.status,['diagnostic','no-progress','comment-only','unresolved','final-stale','permission','second-denial','unknown-error','runtime-error','external-save'].includes(mode)?'incomplete':'checks_passed',JSON.stringify(report));
  if(corrected){const impl=JSON.parse(fs.readFileSync(path.join(report.artifacts,'implementation-original.json'))),cor=JSON.parse(fs.readFileSync(path.join(report.artifacts,'correction-original.json')));assert.equal(impl.info.sessionID,cor.info.sessionID);}
  if(mode==='stateful'){assert.equal(fs.readFileSync(path.join(report.executionDirectory,'example.test.mjs'),'utf8'),repaired);assert.match(fs.readFileSync(path.join(report.artifacts,'final.patch'),'utf8'),/read\('item'\)/);assert.ok(report.observations.checks.some(c=>c.exit===0&&c.current));}
  if(mode==='coverage-loss'){assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.test.mjs'),'utf8'),reducedTest);assert.ok(report.observations.coverageWarnings.length);}
  if(mode==='intentional')assert.ok(fs.readFileSync(path.join(report.executionDirectory,'value.test.mjs'),'utf8').includes('value,3'));
  if(mode==='relocation')assert.equal(fs.readFileSync(path.join(report.executionDirectory,'moved.test.mjs'),'utf8'),originalTest);
  if(mode==='diagnostic'){const c=report.observations.latestChecks.at(-1);assert.equal(c.requirement,'diagnostic');assert.equal(c.exit,1);}
  if(mode==='unresolved')assert.ok(report.limits.some(l=>l.includes('unresolved task relevance')));
  if(['permission','second-denial'].includes(mode)){assert.ok(fs.existsSync(path.join(report.artifacts,mode==='permission'?'permission-reply-violation.json':'permission-violation.json')));assert.equal(report.terminalReason.kind,'permission_denied');assert.equal(report.termination.verified,true);assert.equal(report.termination.abortRequests,1);assert.equal(requests.filter(r=>r.mode===mode&&r.stage==='implementation').length,mode==='permission'?1:2);assert.equal(requests.filter(r=>r.mode===mode).length,mode==='permission'?2:3);}
  if(mode==='external-save')assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.mjs'),'utf8'),source+'// external edit\n');
  assert.ok(fs.existsSync(path.join(report.artifacts,'D0.patch'))||['external-save','permission','second-denial','unknown-error'].includes(mode));
  const events=JSON.parse(fs.readFileSync(path.join(report.artifacts,'tool-events.json')));
  if(continuationModes.includes(mode)){
   assert.equal(fs.existsSync(path.join(report.artifacts,'forbidden.txt')),false);
   assert.equal(fs.existsSync(path.join(report.executionDirectory,'forbidden.txt')),false);
   assert.equal(fs.readFileSync(path.join(report.artifacts,'forbidden-input.txt'),'utf8'),forbiddenContent);
   assert.equal(report.termination.verified,true);
   const denied=events.filter(e=>e.permissionDenied);assert.equal(denied.length,mode==='second-denial'?2:1);
   assert.ok(denied.every(e=>e.state==='error'&&e.execution==='native-bash-permission-preflight'&&e.before===e.after&&e.executionAdmitted===false));
   assert.equal(report.permissionContinuations.length,1);assert.equal(report.permissionContinuations[0].sessionID,report.sessions.author);
   const native=await api('GET',`/session/${report.sessions.author}/message?directory=${encodeURIComponent(report.executionDirectory)}`);
   const nativeDenied=native.flatMap(m=>m.parts).filter(p=>p.type==='tool'&&denied.some(e=>e.callID===p.callID));
   assert.equal(nativeDenied.length,denied.length);
   assert.ok(nativeDenied.every(p=>p.state.status==='error'&&p.state.error===denied.find(e=>e.callID===p.callID).output&&JSON.stringify(p.state.input)===JSON.stringify(denied.find(e=>e.callID===p.callID).args)));
   if(mode!=='second-denial'){
    assert.equal(report.termination.abortRequests,0);
    assert.equal(requests.filter(r=>r.mode===mode&&r.stage==='implementation').length,6);
    assert.equal(requests.filter(r=>r.mode===mode&&r.stage==='correction').length,0);
    assert.ok(report.observations.checks.some(c=>c.command==='npm test'&&c.successful&&c.current));
    assert.equal(report.observations.unclassifiedFailures.length,0);
    assert.ok(!report.observations.checks.some(c=>denied.some(e=>e.callID===c.callID)));
    assert.equal(report.permissionContinuations[0].continuedWith.callID,events[1].callID);
    assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.mjs'),'utf8'),source.replace('value = 2','value = 3'));
    assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.test.mjs'),'utf8'),originalTest.replace('value,2','value,3'));
    const patch=path.join(report.artifacts,'final.patch');assert.match(fs.readFileSync(patch,'utf8'),/value = 3/);git('apply','--check',patch);
   }
  }else assert.deepEqual(report.permissionContinuations,[]);
  if(ordinaryErrorModes.includes(mode)){
   const failureIndex=mode==='missing-read'?0:1,failed=events[failureIndex];
   assert.equal(failed.state,'error');assert.equal(failed.tool,mode==='missing-read'?'read':'edit');
   assert.equal(failed.permissionDenied,false);assert.equal(failed.before,failed.after);
   assert.ok(failed.nativeTime.end>=failed.nativeTime.start);
   assert.equal(git('status','--porcelain=v1','--untracked-files=all'),'');
   assert.ok(failed.output.length>0);assert.equal(failed.execution,undefined);
   if(mode==='missing-read')assert.equal(failed.args.filePath,'missing-source.mjs');
   else assert.equal(failed.args.oldString,'value = 999');
   const native=await api('GET',`/session/${report.sessions.author}/message?directory=${encodeURIComponent(report.executionDirectory)}`);
   const nativeTools=native.flatMap(m=>m.parts).filter(p=>p.type==='tool');
   assert.equal(nativeTools.length,mode==='missing-read'?7:8);
   assert.equal(new Set(nativeTools.map(p=>p.callID)).size,nativeTools.length);
   const nativeFailed=nativeTools.filter(p=>p.callID===failed.callID);assert.equal(nativeFailed.length,1);
   assert.equal(nativeFailed[0].state.status,'error');assert.equal(nativeFailed[0].state.error,failed.output);
   assert.deepEqual(nativeFailed[0].state.input,failed.args);
   assert.equal(events.filter(e=>e.state==='error').length,1);
   assert.equal(events[failureIndex+1].tool,'read');assert.equal(events[failureIndex+1].state,'completed');
   assert.equal(report.termination.abortRequests,0);assert.equal(report.termination.verified,true);
   assert.equal(fs.existsSync(path.join(report.artifacts,'permission-continuations.json')),false);
   assert.equal(requests.filter(r=>r.mode===mode&&r.stage==='implementation').length,nativeTools.length+1);
   assert.equal(requests.filter(r=>r.mode===mode&&r.stage==='correction').length,0);
   assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.mjs'),'utf8'),source.replace('value = 2','value = 3'));
   assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.test.mjs'),'utf8'),originalTest.replace('value,2','value,3'));
   assert.ok(report.observations.checks.some(c=>c.command==='npm test'&&c.successful&&c.current));
   const patch=path.join(report.artifacts,'final.patch');assert.match(fs.readFileSync(patch,'utf8'),/value = 3/);git('apply','--check',patch);
  }
  if(mode==='unknown-error'){assert.equal(report.terminalReason.kind,'tool_error');assert.equal(report.termination.verified,true);assert.equal(events[0].execution,undefined);}
  if(['stdout-denial','runtime-error'].includes(mode)){
   assert.equal(events[0].state,'completed');assert.equal(events[0].permissionDenied,undefined);assert.equal(events[0].executionAdmitted,true);
   if(mode==='runtime-error')assert.ok(report.observations.unclassifiedFailures.some(f=>f.exit===1&&f.output.includes(denialText)));
  }
  if(mode==='correct'){assert.equal(requests.filter(r=>r.mode===mode&&r.stage==='implementation').length,2);assert.equal(report.termination.abortRequests,0);}
  if(mode==='worktree-path')assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.mjs'),'utf8'),source+'// allowed worktree\n');
  if(mode==='variant')assert.equal(requests.filter(r=>r.mode===mode&&r.stage==='implementation').length,4);
  console.log(JSON.stringify({mode,status:report.status,repairs:report.repairs,termination:report.termination,scriptedRequests:requests.filter(r=>r.mode===mode).length}));
 }
 console.log(JSON.stringify({passed:true,installedWorkflow:true,scenarios:selectedModes.length,scriptedRequests:providerRequests,workflowRequests:requests.length,auxiliaryRequests:auxiliaryRequests.length,realProviderRequests:0,temp}));
} finally {
 if(child.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>child.kill('SIGKILL'),3000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});
 fixture.closeAllConnections();await new Promise(r=>fixture.close(r));
 if(process.env.NATIVE_TASK_FIXTURE_KEEP!=='1')fs.rmSync(temp,{recursive:true,force:true});
}
