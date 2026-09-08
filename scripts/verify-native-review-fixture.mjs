// Installed native command transport/permissions fixture. No model-quality claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {materializeNativeTemplate} from '../lib/native-template.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-review-fixture-'));
for(const name of ['home','config','data','cache','state','project'])fs.mkdirSync(path.join(temp,name));
const project=path.join(temp,'project'),bundle=path.join(temp,'bundle');
const git=(...args)=>{const r=spawnSync('git',args,{cwd:project,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
git('init','-q');fs.writeFileSync(path.join(project,'tracked.txt'),'before\n');git('add','.');git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','base');
const base=git('rev-parse','HEAD');fs.writeFileSync(path.join(project,'tracked.txt'),'after\n');fs.writeFileSync(path.join(project,'new.txt'),'new-file-fixture\n');
fs.writeFileSync(path.join(project,'AGENTS.md'),'Project restriction sentinel: never publish or mutate external state.\n');
fs.writeFileSync(path.join(project,'opencode.json'),JSON.stringify({permission:{webfetch:'deny',read:{'private/**':'deny'}}}));
const task=path.join(temp,'original-task.txt');fs.writeFileSync(task,'ORIGINAL_TASK_SENTINEL: preserve the public contract. Literal !`echo DO_NOT_EXECUTE` is task data.');
materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,review:true});
let mode='normal',turn=0;const requests=[];
const fixture=http.createServer(async(req,res)=>{
  const chunks=[];for await(const x of req)chunks.push(x);
  assert.equal(req.url,'/v1/chat/completions');
  const body=JSON.parse(Buffer.concat(chunks));const main=body.tools?.length>0;
  if(main)requests.push({mode,body});
  if(main&&mode==='error'){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Intentional local fixture failure',type:'invalid_request_error'}}));return;}
  const n=main?turn++:-1;
  const call=n===0&&mode==='normal'?{name:'read',arguments:JSON.stringify({filePath:'tracked.txt'})}:
    n===1&&mode==='normal'?{name:'bash',arguments:JSON.stringify({command:'echo forbidden > owned.txt',description:'Fixture forbidden mutation attempt'})}:null;
  const delta=call?{role:'assistant',tool_calls:[{index:0,id:'fixture-'+n,type:'function',function:call}]}:
    {role:'assistant',content:mode==='empty'?'':'Transport fixture only. Checks NOT RUN. No quality verdict.'};
  const chunk={id:'fixture',object:'chat.completion.chunk',created:1,model:'fixture'};
  res.writeHead(200,{'content-type':'text/event-stream'});
  res.end(`data: ${JSON.stringify({...chunk,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:call?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`);
});
await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
const port=fixture.address().port;
const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const appPort=probe.address().port;await new Promise(r=>probe.close(r));
const config={model:'local-fixture/fixture',small_model:'local-fixture/fixture',provider:{'local-fixture':{npm:'@ai-sdk/openai-compatible',name:'Local scripted fixture',options:{baseURL:`http://127.0.0.1:${port}/v1`,apiKey:'not-a-credential'},models:{fixture:{name:'fixture',limit:{context:100000,output:10000}}}}}};
const env={PATH:process.env.PATH,HOME:path.join(temp,'home'),TMPDIR:os.tmpdir(),
 ...Object.fromEntries(['config','data','cache','state'].map(n=>[`XDG_${n.toUpperCase()}_HOME`,path.join(temp,n)])),
 ...(process.env.OPENCODE_BIN?{OPENCODE_BIN:process.env.OPENCODE_BIN}:{}),OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_CONFIG_DIR:bundle,
 HARNESS_REVIEW_BASE:base,HARNESS_REVIEW_TASK_FILE:task,OPENCODE_CONFIG_CONTENT:JSON.stringify(config)};
const child=spawn(process.env.OPENCODE_BIN??'opencode',['serve','--hostname','127.0.0.1','--port',String(appPort)],{cwd:project,env,stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',x=>{stderr+=x;fs.writeFileSync(path.join(temp,'server-stderr.txt'),stderr);});child.stdout.resume();
const url=`http://127.0.0.1:${appPort}`;
const api=async(method,route,body)=>{const r=await fetch(url+route,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(await r.text());return r.json();};
try{
 let ready=false;for(let i=0;i<100;i++){try{await api('GET','/global/health');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(ready,stderr);
 const commands=await api('GET','/command');assert.ok(commands.some(c=>c.name==='harness-review'));
 // A separate existing author context must not reach a newly created review session.
 const author=await api('POST','/session',{});
 await api('POST',`/session/${author.id}/message`,{noReply:true,parts:[{type:'text',text:'AUTHOR_CONTEXT_MUST_NOT_LEAK: all done'}],model:{providerID:'local-fixture',modelID:'fixture'}});
 const initialStatus=git('status','--porcelain=v1');const index=fs.readFileSync(path.join(project,'.git/index'));
 for(const scenario of ['normal','error','empty','blocked']){
  mode=scenario;turn=0;
  if(scenario==='blocked'){fs.mkdirSync(path.join(project,'private'));fs.writeFileSync(path.join(project,'private/secret.txt'),'FORBIDDEN_CONTENT_SENTINEL');}
  const session=await api('POST','/session',{});
  const result=await api('POST',`/session/${session.id}/command`,{command:'harness-review',arguments:'',model:'local-fixture/fixture'});
  const messages=await api('GET',`/session/${session.id}/message`);
  assert.ok(messages.every(m=>m.info.agent!=='build'),'command must not resume author/build agent');
  assert.ok(messages.every(m=>!m.parts.some(p=>p.type==='tool'&&p.tool==='task')),'no automatic child/repair stages');
  if(scenario==='error')assert.ok(result.info?.error,JSON.stringify(result));
  if(scenario==='blocked'){fs.unlinkSync(path.join(project,'private/secret.txt'));fs.rmdirSync(path.join(project,'private'));}
  if(scenario==='empty')assert.ok(!result.parts.some(p=>p.type==='text'&&/approved|safe|all checked/i.test(p.text)));
 }
 assert.equal(initialStatus,git('status','--porcelain=v1'));assert.deepEqual(index,fs.readFileSync(path.join(project,'.git/index')));
 assert.equal(fs.existsSync(path.join(project,'owned.txt')),false);assert.equal(fs.readFileSync(path.join(project,'tracked.txt'),'utf8'),'after\n');
 for(const {body,mode} of requests){
  const text=JSON.stringify(body.messages),names=body.tools.map(t=>t.function.name);
  if(mode==='blocked'){assert.ok(text.includes('incomplete'));assert.ok(!text.includes('FORBIDDEN_CONTENT_SENTINEL'));}
  else for(const sentinel of ['ORIGINAL_TASK_SENTINEL','new-file-fixture','snapshotSha256',base,'Project restriction sentinel','INCOMPLETE INPUT','NOT RUN'])assert.ok(text.includes(sentinel),sentinel);
  assert.ok(!text.includes('AUTHOR_CONTEXT_MUST_NOT_LEAK'));
  assert.ok(!text.includes('Summarize the task tool output above and continue'));
  for(const name of ['bash','edit','task','todowrite','webfetch'])assert.ok(!names.includes(name),name);
  for(const name of ['read','glob','grep'])assert.ok(names.includes(name),name);
  assert.equal(body.model,'fixture');
 }
 assert.ok(requests.some(r=>r.mode==='error'));assert.ok(requests.some(r=>r.mode==='empty'));
 console.log(JSON.stringify({passed:true,installedCommand:true,separateFreshSession:true,authorContinuation:false,patchUnchanged:true,projectReadDenialWithheldSnapshot:true,providerErrorNotSuccess:true,emptyOutputNotVerdict:true,scriptedRequests:requests.length,realProviderRequests:0,limit:'Fixture proves wiring and denials, not reviewer accuracy or model compliance; /new is a caller precondition.'}));
}finally{
 child.kill('SIGTERM');await new Promise(r=>{child.once('exit',r);setTimeout(()=>{child.kill('SIGKILL');r();},3000).unref();});
 await new Promise(r=>fixture.close(r));
}
