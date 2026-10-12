// Uses the existing native launcher and real OpenCode; only Docker path mapping is adapted for this local fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {materializeNativeTemplate} from '../../lib/native-template.mjs';
import {runNativePhase} from '../support/native-run.mjs';
import {build,collect,prepare,sha256,DELIVERY_TASK_BYTES} from './context.mjs';
const root=path.resolve(import.meta.dirname,'../..'),bin=process.env.OPENCODE_BIN;
assert.ok(bin&&path.isAbsolute(bin),'OPENCODE_BIN must name pinned OpenCode');
const version=spawnSync(bin,['--version'],{encoding:'utf8'});assert.equal(version.status,0);assert.equal(version.stdout.trim(),'1.18.26');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'public-context-installed-'));
let fixture,child,mode,bootstrapped=false,requests=0;const observed=[];
try {
 let taskFile,original,receipt,saved;
 const boundary=process.argv[2]==='--delivery-limit';
 let demo=boundary?undefined:process.argv[2];
 if(demo==='--serverless') {
  const source=path.join(import.meta.dirname,'fixtures/serverless-7008');
  const pin=JSON.parse(fs.readFileSync(path.join(source,'collection.json'))).snapshot_sha256;
  demo=path.join(temp,'prepared');
  prepare({taskFile:path.join(source,'original.md'),metadataFile:path.join(source,'metadata.json'),snapshotFile:path.join(source,'snapshot.json'),snapshotSha256:pin,out:demo});
 }
 if(demo) {
  demo=path.resolve(demo);
  // External demo must be replayed through prepare first; this invocation only reads its verified output.
  taskFile=path.join(demo,'TASK.md');receipt=JSON.parse(fs.readFileSync(path.join(demo,'receipt.json')));
  assert.equal(sha256(fs.readFileSync(taskFile)),receipt.output_sha256);
  assert.equal(sha256(fs.readFileSync(path.join(demo,'context.json'))),receipt.context_sha256);
  original=fs.readFileSync(taskFile).subarray(0,fs.readFileSync(taskFile).indexOf('\n\nPublic task discussion'));
  assert.equal(sha256(original),receipt.binding.task_sha256);
  const bytes=fs.readFileSync(path.join(demo,'snapshot.json'));
  assert.equal(sha256(bytes),receipt.snapshot_sha256);saved=JSON.parse(bytes);
 }else {
  const api=JSON.parse(fs.readFileSync(new URL('./fixtures/api.json',import.meta.url)));
  original=Buffer.from('ORIGINAL_TASK_DELIVERY\r\nEnvironment: local scripted delivery only.\r\n');
  const originalFile=path.join(temp,'original.md'),metadataFile=path.join(temp,'metadata.json');fs.writeFileSync(originalFile,original);
  const binding={repository:'example/project',issue:7,task_sha256:sha256(original),cutoff:{at:'2020-02-01T00:00:00Z',first_solution_commit_at:'2020-02-01T00:00:00Z',verified:true,basis:'Synthetic delivery fixture'}};
  const comments=[api.comment,{...api.comment,id:2,url:api.comment.url.replace('/1','/2'),html_url:api.comment.html_url.replace('-1','-2'),updated_at:'2021-01-01T00:00:00Z',body:'EXCLUDED_LATE_DELIVERY_SENTINEL'}];
  const read=url=>({status:200,link:'',body:JSON.stringify(url.includes('/comments?')?comments:url.endsWith('/issues/7')?{...api.issue,comments:2}:api.repository)});
  if(boundary) {
   const overhead=build(binding,original,collect(binding,original,read)).task.length-original.length;
   // Multibyte bytes and quotes exercise the exact largest admitted argv task.
   const prefix=Buffer.from('ORIGINAL_TASK_DELIVERY "quoted" \u00e9\r\n');
   original=Buffer.concat([prefix,Buffer.alloc(DELIVERY_TASK_BYTES-overhead-prefix.length,120)]);
   binding.task_sha256=sha256(original);fs.writeFileSync(originalFile,original);
  }
  fs.writeFileSync(metadataFile,JSON.stringify(binding));
  const snapshot=collect(binding,original,read),snapshotFile=path.join(temp,'snapshot.json');saved=snapshot;fs.writeFileSync(snapshotFile,JSON.stringify(snapshot));
  const out=path.join(temp,'prepared');receipt=prepare({taskFile:originalFile,metadataFile,snapshotFile,snapshotSha256:sha256(fs.readFileSync(snapshotFile)),out});taskFile=path.join(out,'TASK.md');
 }
 const task=fs.readFileSync(taskFile,'utf8');assert.ok(task.includes('Public task discussion'));assert.ok(Buffer.from(task).subarray(0,original.length).equals(original));
 const rebuilt=build(receipt.binding,original,saved);assert.equal(rebuilt.task.toString(),task);
 assert.equal(rebuilt.context.version,2);
 if(boundary)assert.equal(Buffer.byteLength(task),DELIVERY_TASK_BYTES);
 const excluded=new Set(rebuilt.audit.excluded.map(c=>c.id));
 const forbidden=saved.records.slice(2,-1).flatMap(r=>JSON.parse(r.body)).filter(c=>excluded.has(c.id)&&c.body.length).flatMap(c=>{
  const escaped=JSON.stringify(c.body).slice(1,-1);
  return [c.body,escaped,escaped.replaceAll('"','\\"')];
 });
 forbidden.push(receipt.binding.cutoff.basis,...(receipt.binding.cutoff.basis.match(/\b[a-f0-9]{40}\b/g)??[]));
 // Inspect decoded string values in every request, including title and parent requests.
 const strings=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
 const reply=(res,tool)=>{
  const base={id:'local-context',object:'chat.completion.chunk',created:1,model:'fixture'};
  const delta=tool?{role:'assistant',tool_calls:[{index:0,id:'bootstrap',type:'function',function:{name:'harness_task',arguments:'{}'}}]}:{role:'assistant',content:'Scripted transport receipt only; no implementation or understanding claim.'};
  res.writeHead(200,{'content-type':'text/event-stream'});res.end(`data: ${JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:tool?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`);
 };
 const failures=[];
 fixture=http.createServer(async(req,res)=>{try{
  const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));requests++;
  const texts=body.messages.filter(m=>m.role==='user').map(m=>typeof m.content==='string'?m.content:(m.content??[]).map(p=>p.text??'').join('\n'));
  assert.ok(!JSON.stringify(body).includes('EXCLUDED_LATE_DELIVERY_SENTINEL'));
  for(const text of strings(body))for(const denied of forbidden)assert.ok(!text.includes(denied),'Excluded audit text reached a provider request');
  // OpenCode 1.18.26's CLI quotes an argv prompt and escapes double quotes.
  // Assert the complete exact envelope, not a sentinel/substring approximation.
  const cliEnvelope='"'+task.replaceAll('"','\\"')+'"';
  const delivered=texts.find(text=>mode==='task'?text.includes(task)&&text.includes('Implement the complete original task'):text===cliEnvelope);
  // A title request also sees user text; it must never count as author delivery.
  if(delivered&&body.tools?.length) {
    const received=mode==='task'?delivered.slice(delivered.indexOf(task),delivered.indexOf(task)+task.length):delivered.slice(1,-1).replaceAll('\\"','"');
    assert.equal(received,task);
    observed.push({mode,task_sha256:sha256(received),original_sha256:sha256(Buffer.from(received).subarray(0,original.length)),message_sha256:sha256(delivered),transport:mode==='task'?'native-task-file':'opencode-cli-quoted',author:true});
  }
  const bootstrap=mode==='task'&&!bootstrapped&&body.tools?.some(t=>t.function.name==='harness_task');
  if(bootstrap)bootstrapped=true;reply(res,bootstrap);
 }catch(e){failures.push(e.message);res.writeHead(500);res.end('fixture assertion failed');}});
 await new Promise((resolve,reject)=>{fixture.once('error',reject);fixture.listen(0,'127.0.0.1',resolve);});
 const config={model:'local-fixture/fixture',small_model:'local-fixture/fixture',provider:{'local-fixture':{npm:'@ai-sdk/openai-compatible',name:'Scripted fixture',options:{baseURL:`http://127.0.0.1:${fixture.address().port}/v1`,apiKey:'not-a-credential'},models:{fixture:{name:'fixture',limit:{context:200000,output:10000}}}}}};
 const results=[];
 for(mode of ['plain','core','task']) {
  const dir=path.join(temp,mode),project=path.join(dir,'project'),output=path.join(dir,'output'),bundle=path.join(dir,'bundle');
  fs.mkdirSync(dir);for(const p of [project,output,...['home','config','data','cache','state'].map(x=>path.join(dir,x))])fs.mkdirSync(p);
  fs.writeFileSync(path.join(project,'TASK.md'),task);fs.writeFileSync(path.join(project,'value.mjs'),'export const value = 1;\n');
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:project,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
  git('init','-q');git('add','.');git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','base');
  if(mode!=='plain')materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,task:mode==='task'});
  const env={PATH:process.env.PATH,HOME:path.join(dir,'home'),TMPDIR:os.tmpdir(),...Object.fromEntries(['config','data','cache','state'].map(n=>[`XDG_${n.toUpperCase()}_HOME`,path.join(dir,n)])),OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',...(mode==='core'?{OPENCODE_CONFIG_DIR:bundle}:{})};
  const session={name:'local-scripted',output};
  const result=await runNativePhase(session,{config,task,enabled:mode==='task',strategy:'direct',model:'local-fixture/fixture',limitMs:90000,stopWorkload:async()=>({terminationVerified:child.exitCode!==null})},{spawnProcess:(cmd,args,settings)=>{
    assert.equal(cmd,'docker');const at=args.indexOf(session.name);assert.ok(at>0);
    for(let i=0;i<at;i++)if(args[i]==='--env'){const value=args[++i],equal=value.indexOf('='),key=value.slice(0,equal);if(key!=='PATH')env[key]=value.slice(equal+1).replaceAll('/work/repo',project).replaceAll('/template',bundle);}
    assert.equal(args[at+1],'/opt/opencode');child=spawn(bin,args.slice(at+2),{...settings,cwd:project,env});return child;
  }});
  assert.equal(result.exitCode,0,result.stderr);assert.equal(result.timedOut,false);assert.equal(result.parseErrors,0);assert.ok(!result.events.some(e=>e.type==='error'),JSON.stringify(result.events));
  assert.ok(observed.some(x=>x.mode===mode&&x.author),`Full task not observed in ${mode} author input`);
  results.push({...observed.find(x=>x.mode===mode&&x.author),delivery:'passed',exitCode:result.exitCode});
 }
 assert.deepEqual(failures,[]);assert.equal(new Set(results.map(x=>x.task_sha256)).size,1);
 console.log(JSON.stringify({passed:true,deliveryLimit:boundary,taskBytes:Buffer.byteLength(task),installedVersion:version.stdout.trim(),scriptedRequests:requests,evaluationModelRequests:0,excludedCommentsChecked:excluded.size,results}));
}finally {
 if(child&&child.exitCode===null){child.kill('SIGKILL');await new Promise(resolve=>child.once('close',resolve));}
 if(fixture?.listening){fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));}
 fs.rmSync(temp,{recursive:true,force:true});
}
