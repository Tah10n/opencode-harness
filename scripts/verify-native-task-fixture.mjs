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

const source = 'export const value = 2; export const legacy = () => 7;\n';
const originalTest = "import {value,legacy} from './value.mjs'; import assert from 'node:assert/strict'; import {test} from 'node:test';\ntest('public requirement',()=>{assert.equal(value,2);assert.equal(legacy(),7);});\n";
const reducedTest = originalTest.replace('assert.equal(legacy(),7);','');
fs.writeFileSync(path.join(project,'value.mjs'),source);
fs.writeFileSync(path.join(project,'value.test.mjs'),originalTest);
fs.writeFileSync(path.join(project,'package.json'),JSON.stringify({private:true,scripts:{test:'node --test'}}));
fs.writeFileSync(path.join(project,'opencode.json'),JSON.stringify({$schema:'https://opencode.ai/config.json',permission:{task:'allow',bash:'allow'}}));
git('add','.');git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','base');
materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,task:true,review:true});
let mode='correct',requests=[],counts=new Map(),priorArtifacts=new Set();
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
  const body=JSON.parse(Buffer.concat(chunks)), user=body.messages.findLast(m=>m.role==='user');
  const text=typeof user?.content==='string'?user.content:user?.content?.map(p=>p.text??'').join('\n')??'';
  if(!body.tools?.length){response(res,null,'Fixture title');return;}
  const stage=text.includes('One corrective pass')?'correction':text.includes('Implement the complete original task')?'implementation':'bootstrap';
  const key=mode+stage,n=counts.get(key)??0;counts.set(key,n+1);requests.push({mode,stage,n});
  const bash=command=>({name:'bash',args:{command,description:'Installed scripted fixture'}});
  if(stage==='bootstrap'){response(res,n===0?{name:'harness_task',args:{}}:null,'Actual workflow result retained');return;}
  let calls=[];
  if(stage==='implementation') {
   if(mode==='container-preflight')calls=[{name:'read',args:{filePath:'value.mjs'}},{name:'glob',args:{pattern:'*.mjs'}},{name:'edit',args:{filePath:'value.mjs',oldString:'export const value = 2;',newString:'export const value = 2; // container\n'}},bash('node --test')];
   else if(['defect','no-progress'].includes(mode))calls=[bash(writeFixture('value.mjs',source.replace('value = 2','value = 1'))),bash('node --test')];
   else if(mode==='coverage-loss')calls=[bash(writeFixture('value.test.mjs',reducedTest)),bash('node --test')];
   else if(mode==='intentional')calls=[bash(writeFixture('value.mjs',source.replace('value = 2','value = 3'))),bash(writeFixture('value.test.mjs',originalTest.replace('value,2','value,3'))),bash('node --test')];
   else if(mode==='relocation')calls=[bash('mv value.test.mjs moved.test.mjs'),bash('node --test')];
   else if(['late-check','final-stale'].includes(mode))calls=[bash('node --test'),bash(writeFixture('value.mjs',source+'// last edit\n'))];
   else if(mode==='permission')calls=[bash('printf forbidden')];
   else if(mode==='cancel'||mode==='budget')calls=[bash('node --test'),bash("sleep 30 & sleeper=$!; printf '%s' \"$sleeper\" > sleeper.pid; wait \"$sleeper\"")];
   else if(mode==='concurrent-save')calls=[bash('sleep 0.5'),bash('node --test')];
   else if(mode==='external-save') {
    if(n===0){const base=path.join(project,'.git/harness-task'),id=fs.readdirSync(base).find(id=>!priorArtifacts.has(id));fs.writeFileSync(path.join(base,id,'worktree/value.mjs'),source+'// external edit\n');}
    calls=[bash('node --test')];
   }
   else calls=[bash('node --test')];
  } else {
   const feedback=JSON.parse(text);assert.ok(feedback.originalTask.includes('ORIGINAL_TASK_FIXTURE'));assert.ok(feedback.current.diff!==undefined);
   if(mode==='coverage-loss'){assert.ok(feedback.observations.checks.some(c=>c.successful&&c.current));assert.ok(feedback.observations.testChanges[0].before.includes('legacy(),7'));assert.ok(feedback.observations.testChanges[0].diff.includes('-test'));calls=[bash(writeFixture('value.test.mjs',originalTest)),bash('node --test')];}
   else if(mode==='intentional'){assert.ok(feedback.instruction.includes('Do not restore an old expectation'));assert.ok(feedback.observations.testChanges[0].after.includes('value,3'));calls=[];}
   else if(mode==='relocation'){assert.equal(feedback.observations.testChanges[0].assessment,'not_automatically_classified');assert.ok(feedback.observations.addedTests.some(t=>t.content===originalTest));calls=[];}
   else if(mode==='defect'){assert.ok(feedback.observations.checks.some(c=>c.exit===1&&/not ok|✖/.test(c.output)));calls=[bash(writeFixture('value.mjs',source)),bash('node --test')];}
   else if(mode==='late-check')calls=[bash('node --test')];
   else if(mode==='final-stale')calls=[bash('node --test'),bash(writeFixture('value.mjs',source+'// still stale\n'))];
   else if(mode==='no-progress')calls=[bash('node --test')];
   else assert.fail('Unexpected corrective stage '+mode);
  }
  response(res,calls[n]??null,stage==='correction'?'Investigated factual feedback; exact result is in the project and native events.':'Implementation finished.');
 }catch(e){res.writeHead(500);res.end(e.stack);console.error(e.stack);}
});
await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
if(process.env.NATIVE_TASK_FIXTURE_PROVIDER_ONLY==='1'){
 mode='container-preflight';fs.writeFileSync(path.join(project,'TASK.md'),'ORIGINAL_TASK_FIXTURE: Deliver value 2 and preserve legacy scenario; run node --test.');
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
 const allModes=['correct','defect','coverage-loss','intentional','relocation','late-check','final-stale','no-progress','permission','cancel','budget','concurrent-save','staged-work','external-save'];
 const selectedModes=process.env.NATIVE_TASK_FIXTURE_MODES?.split(',')??allModes;
 for(mode of selectedModes){
  git('reset','--hard','HEAD');git('clean','-fd');
  const artifactRoot=path.join(project,'.git/harness-task');priorArtifacts=new Set(fs.existsSync(artifactRoot)?fs.readdirSync(artifactRoot):[]);
  fs.writeFileSync(task,'ORIGINAL_TASK_FIXTURE: Deliver value '+(mode==='intentional'?'3 instead of 2':'2')+'; preserve the independent legacy() = 7 scenario. Run node --test after the last edit.');
  if(mode==='staged-work'){fs.writeFileSync(path.join(project,'value.mjs'),source+'// staged user bytes\n');git('add','value.mjs');fs.appendFileSync(path.join(project,'value.mjs'),'// unstaged user bytes\n');}
  const userBytes=fs.readFileSync(path.join(project,'value.mjs'),'utf8'),index=git('ls-files','--stage','-z');
  const session=await api('POST','/session',{permission:mode==='permission'?[{permission:'bash',pattern:'printf forbidden',action:'deny'}]:[]});
  const pending=api('POST',`/session/${session.id}/command`,{command:'harness-task',arguments:'',agent:'build',model:'local-fixture/fixture'});
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
   console.log(JSON.stringify({mode,cancelled:true,processTerminated:true}));continue;
  }
  assert.equal(part?.state.status,'completed',JSON.stringify({mode,part,result,temp}));const report=JSON.parse(part.state.output);
  assert.equal(git('ls-files','--stage','-z'),index);
  assert.equal(fs.readFileSync(path.join(project,'value.mjs'),'utf8'),mode==='concurrent-save'?source+'// concurrent USER_SAVE\n':userBytes);
  const corrected=['defect','coverage-loss','intentional','relocation','late-check','final-stale','no-progress'].includes(mode);
  assert.equal(report.repairs,corrected?1:0,JSON.stringify(report));assert.deepEqual(Object.keys(report.sessions),['author']);
  assert.equal(report.status,['no-progress','final-stale','permission','external-save'].includes(mode)?'incomplete':'checks_passed',JSON.stringify(report));
  if(corrected){const impl=JSON.parse(fs.readFileSync(path.join(report.artifacts,'implementation-original.json'))),cor=JSON.parse(fs.readFileSync(path.join(report.artifacts,'correction-original.json')));assert.equal(impl.info.sessionID,cor.info.sessionID);}
  if(mode==='coverage-loss')assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.test.mjs'),'utf8'),originalTest);
  if(mode==='intentional')assert.ok(fs.readFileSync(path.join(report.executionDirectory,'value.test.mjs'),'utf8').includes('value,3'));
  if(mode==='relocation')assert.equal(fs.readFileSync(path.join(report.executionDirectory,'moved.test.mjs'),'utf8'),originalTest);
  if(mode==='permission')assert.ok(fs.existsSync(path.join(report.artifacts,'permission-violation.json')));
  if(mode==='external-save')assert.equal(fs.readFileSync(path.join(report.executionDirectory,'value.mjs'),'utf8'),source+'// external edit\n');
  assert.ok(fs.existsSync(path.join(report.artifacts,'D0.patch'))||['external-save','permission'].includes(mode));
  console.log(JSON.stringify({mode,status:report.status,repairs:report.repairs}));
 }
 console.log(JSON.stringify({passed:true,installedWorkflow:true,scenarios:selectedModes.length,scriptedRequests:requests.length,realProviderRequests:0,temp}));
} finally {
 if(child.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>child.kill('SIGKILL'),3000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});
 fixture.closeAllConnections();await new Promise(r=>fixture.close(r));
 if(process.env.NATIVE_TASK_FIXTURE_KEEP!=='1')fs.rmSync(temp,{recursive:true,force:true});
}
