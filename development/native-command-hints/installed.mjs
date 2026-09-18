// Offline installed-native mechanism fixture. No model provider or historical patch replay.
// Run inside the pinned existing Linux container via run-installed.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {materializeNativeTemplate} from '../../lib/native-template.mjs';
const root='/repo', input='/repo/local/native-task-integrated/inputs/url-search-params';
const hash=x=>createHash('sha256').update(x).digest('hex');
const run=(bin,args,cwd,env=process.env)=>{const r=spawnSync(bin,args,{cwd,env,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return r.stdout.trim();};
const write=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
const json=(p,x)=>write(p,JSON.stringify(x,null,2)+'\n');
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const result=[];
const dependencyFingerprint=dir=>{
 const records=[];
 const walk=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const f=path.join(p,e.name);if(e.isDirectory()){if(e.name!=='.cache')walk(f);}else records.push([path.relative(dir,f),e.isSymbolicLink()?fs.readlinkSync(f):hash(fs.readFileSync(f))]);}};
 walk(dir);return {hash:hash(JSON.stringify(records)),entries:Object.fromEntries(records)};
};
for(const layout of (process.env.COMMAND_HINT_LAYOUTS?.split(',') ?? ['local','ancestor','off'])) {
 assert.ok(['local','ancestor','off'].includes(layout));
 const base='/work/'+layout;fs.mkdirSync(base,{recursive:true});
 for(const name of ['home','config','data','cache','state','tmp'])fs.mkdirSync(path.join(base,name));
 const project=path.join(base,'project'),bundle=path.join(base,'bundle'),task=path.join(base,'task.txt');
 fs.cpSync(input,project,{recursive:true,verbatimSymlinks:true,filter:p=>path.basename(p)!=='.git'});
 const git=(...a)=>run('git',a,project);
 const dependencyBefore=dependencyFingerprint(path.join(project,'node_modules'));
 // Exact saved source/config/dependencies; one explicit lint defect in this disposable copy.
 const encoding=fs.readFileSync(path.join(project,'src/encoding.ts'),'utf8');
 write(path.join(project,'src/encoding.ts'),encoding+'\nexport const unusedCommandHint = ;\n');
 const test=fs.readFileSync(path.join(project,'test/encoding.test.ts'),'utf8');
 const added='\ntest("encode preserves a numeric public input", () => {\n  expect(encode(42)).toBe("42");\n});\n';
 write(task,'Fix the unusedCommandHint lint defect in src/encoding.ts. Add a public encode(42) regression in test/encoding.test.ts. Preserve all existing tests. Run pnpm test after the last change.');
 // Fixture authority is explicit before workflow launch, never broadened in reaction to deny.
 json(path.join(project,'opencode.json'),{$schema:'https://opencode.ai/config.json',permission:{task:'allow',bash:'allow',external_directory:'allow'}});
 git('init','-q');git('add','.');git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','isolated lint fixture');
 const initial=git('rev-parse','HEAD'), originalStatus=git('status','--porcelain');
 materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,task:true});
 fs.cpSync('/repo/local/native-task-integrated/plain-dependencies/node_modules',path.join(bundle,'node_modules'),{recursive:true,verbatimSymlinks:true});
 fs.copyFileSync('/repo/local/native-task-integrated/plain-dependencies/package-lock.json',path.join(bundle,'package-lock.json'));
 fs.mkdirSync(base+'/config/opencode',{recursive:true});
 for(const name of ['node_modules','package.json','package-lock.json'])fs.cpSync('/repo/local/native-task-integrated/plain-dependencies/'+name,base+'/config/opencode/'+name,{recursive:true,verbatimSymlinks:true});
 fs.mkdirSync(base+'/bin');fs.copyFileSync('/repo/local/native-task-integrated/plain-dependencies/rg',base+'/bin/rg');fs.chmodSync(base+'/bin/rg',0o755);
 console.log(JSON.stringify({progress:layout+' prepared'}));
 const installedHash=hash(fs.readFileSync(path.join(bundle,'native-command-hints.mjs')));
 assert.equal(installedHash,hash(fs.readFileSync('/repo/lib/native-command-hints.mjs')));
 let step=0,parentSteps=0,requests=0,route,worktree,received=false,failureReceived=false,finalReceipt=false,providerError;
 const nativeCalls=[];
 const respond=(res,call,content='')=>{
  const delta=call?{role:'assistant',tool_calls:[{index:0,id:'fixture-'+requests,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}:{role:'assistant',content};
  res.writeHead(200,{'content-type':'text/event-stream'});
  res.end(`data: ${JSON.stringify({id:'r'+requests,object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({id:'r'+requests,object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{},finish_reason:call?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`);
 };
 const provider=http.createServer(async(req,res)=>{try{
  assert.match(req.url,/^\/v1\/chat\/completions$/);
  const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));requests++;console.log(JSON.stringify({progress:layout,request:requests,step}));
  if(!body.tools?.length){respond(res,null,'Fixture title');return;}
  const u=body.messages.findLast(m=>m.role==='user');const text=typeof u?.content==='string'?u.content:JSON.stringify(u?.content);
  const tools=body.messages.filter(m=>m.role==='tool').map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content));
  if(!text.includes('Implement the complete original task')) {respond(res,parentSteps++===0?{name:'harness_task',args:{}}:null,'Report actual workflow result; no independent correctness certification.');return;}
  const bash=command=>({name:'bash',args:{command,description:'Offline installed command hint control',timeout:90000}});
  let call;
  if(step===0){
   const dirs=fs.readdirSync(path.join(project,'.git/harness-task'));assert.equal(dirs.length,1);
   worktree=path.join(project,'.git/harness-task',dirs[0],'worktree');
   // A gives the delivery checkout ordinary local dependency layout. B keeps only ancestors.
   if(layout==='local'||layout==='off')fs.cpSync(path.join(project,'node_modules'),path.join(worktree,'node_modules'),{recursive:true,verbatimSymlinks:true});
   call=bash('pnpm test');
  }else if(step===1){
   const output=tools.at(-1);assert.match(output,/pnpm: command not found/);
   if(layout==='off'){assert.ok(!output.includes('Host-derived project command context:'));respond(res,null,'Bare command failed; no hints enabled.');step++;return;}
   const marker='Host-derived project command context:\n',at=output.indexOf(marker);assert.ok(at>=0,output);
   const hint=JSON.parse(output.slice(at+marker.length));assert.equal(hint.status,'path-found');assert.equal(hint.routes.length,1);
   assert.equal(hint.scope,layout==='ancestor'?'partial-lint':'original-script');
   route=hint.routes[0];received=true;assert.equal(hint.cost.executions,0);
   call=bash(route);
  }else if(step===2){
   assert.match(tools.at(-1),/Parsing error/);failureReceived=true;
   call={name:'read',args:{filePath:path.join(worktree,'src/encoding.ts')}};
  }else if(step===3)call={name:'read',args:{filePath:path.join(worktree,'test/encoding.test.ts')}};
  else if(step===4)call={name:'edit',args:{filePath:path.join(worktree,'src/encoding.ts'),oldString:'\nexport const unusedCommandHint = ;\n',newString:''}};
  else if(step===5)call={name:'edit',args:{filePath:path.join(worktree,'test/encoding.test.ts'),oldString:test,newString:test+added}};
  else if(step===6)call=bash(route);
  else if(step===7&&layout==='ancestor')call=bash('npm test'); // Independent scripted-author choice; not suggested or certified by the partial hint.
  else{
   assert.match(tools.at(-1),/Test Files/);assert.ok(!tools.at(-1).includes('ELIFECYCLE'));
   assert.equal(tools.filter(t=>t.includes('Host-derived project command context:')).length,1);
   finalReceipt=true;respond(res,null,'Fixed the lint defect and added a numeric input regression. The observed project suite passed. This fixture does not certify all task semantics.');step++;return;
  }
  nativeCalls.push(call);step++;respond(res,call);
 }catch(e){providerError=e;console.error(e.stack);res.writeHead(400);res.end(e.message);}});
 await listen(provider);
 const config={model:'local-fixture/fixture',small_model:'local-fixture/fixture',provider:{'local-fixture':{npm:'@ai-sdk/openai-compatible',name:'Offline scripted fixture',options:{baseURL:`http://127.0.0.1:${provider.address().port}/v1`,apiKey:'not-a-credential'},models:{fixture:{name:'fixture',limit:{context:200000,output:10000}}}}}};
 const env={PATH:base+'/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',SHELL:'/bin/bash',HOME:base+'/home',TMPDIR:base+'/tmp',...Object.fromEntries(['config','data','cache','state'].map(n=>['XDG_'+n.toUpperCase()+'_HOME',base+'/'+n])),OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_CONFIG_DIR:bundle,OPENCODE_CONFIG_CONTENT:JSON.stringify(config),HARNESS_TASK_FILE:task,HARNESS_TASK_TIMEOUT_MS:'180000',HARNESS_TASK_STRATEGY:'direct',HARNESS_TASK_COMMAND_HINTS:layout==='off'?'0':'1',HARNESS_TASK_CONTEXT:'0',HARNESS_TASK_CHECKS:'0',HARNESS_TASK_SENSITIVITY:'0',HARNESS_TASK_INVESTIGATION:'0',HARNESS_TASK_EXTRA_ATTENTION:'0'};
 assert.equal(run('/opt/opencode',['--version'],project,env),'1.18.26');
 const probe=http.createServer();await listen(probe);const port=probe.address().port;await new Promise(r=>probe.close(r));
 const server=spawn('/opt/opencode',['serve','--hostname','127.0.0.1','--port',String(port)],{cwd:project,env,stdio:['ignore','pipe','pipe']});
 let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);
 const api=async(method,p,body)=>{const r=await fetch(`http://127.0.0.1:${port}${p}`,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(p==='/global/health'?1500:210000)});assert.ok(r.ok,await r.clone().text());return r.json();};
 try{
  let ready=false;for(let n=0;n<200;n++){try{await api('GET','/global/health');ready=true;break;}catch{await wait(100);}}assert.ok(ready,log);
  const session=await api('POST','/session',{});
  await api('POST',`/session/${session.id}/command`,{command:'harness-task',arguments:'',agent:'build',model:'local-fixture/fixture'});
  if(providerError)throw providerError;
  assert.ok(worktree,'Author session never started: '+log);
  const runtimeLog=fs.readFileSync(base+'/data/opencode/log/opencode.log','utf8');
  assert.ok(!/registry\.npmjs|dependency install failed|NpmInstallFailed/.test(runtimeLog),'Unexpected offline install attempt');
  const artifacts=path.dirname(worktree),events=JSON.parse(fs.readFileSync(path.join(artifacts,'tool-events.json'))),report=JSON.parse(fs.readFileSync(path.join(artifacts,'result.json')));
  assert.equal(events[0].exit,127);assert.ok(!JSON.stringify(events).includes('Host-derived project command context:'));
  assert.equal(events[0].executionAdmitted,true);assert.equal(git('status','--porcelain'),originalStatus);assert.equal(git('rev-parse','HEAD'),initial);
  let evidence={layout,installedHash,requests,authorSteps:step,rawExit:events[0].exit,originalUnchanged:true};
  if(layout==='off'){assert.ok(!fs.existsSync(path.join(artifacts,'command-hint.json')));assert.equal(events.length,1);}
  else{
   assert.ok(received&&failureReceived&&finalReceipt);assert.equal(events[1].exit,1);assert.equal(events.at(-1).exit,0);
   assert.equal(report.termination.verified,true);
   const hint=JSON.parse(fs.readFileSync(path.join(artifacts,'command-hint.json')));
   const patch=fs.readFileSync(path.join(artifacts,'terminal.patch'),'utf8');assert.ok(patch.includes('src/encoding.ts')&&patch.includes('test/encoding.test.ts'));
   assert.ok(!patch.includes('/work/')&&!patch.includes('.git/')&&!patch.includes('node_modules'));
   const clone=base+'/portable';run('git',['clone','--quiet','--no-hardlinks',project,clone],base);
   fs.cpSync(path.join(project,'node_modules'),path.join(clone,'node_modules'),{recursive:true,verbatimSymlinks:true});
   run('git',['apply',path.join(artifacts,'terminal.patch')],clone);
   const portable=run(path.join(clone,'node_modules/.bin/pnpm'),['test'],clone,env);assert.match(portable,/Test Files/);
   const dependencyAfter=dependencyFingerprint(path.join(project,'node_modules'));
   const changedDependencies=[...new Set([...Object.keys(dependencyBefore.entries),...Object.keys(dependencyAfter.entries)])].filter(k=>dependencyBefore.entries[k]!==dependencyAfter.entries[k]);
   // Vitest's real typechecker writes this generated incremental cache in its installed directory.
   const generatedCheckCaches=changedDependencies.filter(k=>k==='vitest/dist/tsconfig.tmp.tsbuildinfo');
   assert.deepEqual(changedDependencies.filter(k=>!generatedCheckCaches.includes(k)),[],'Unexpected installed-package changes');
   evidence={...evidence,received,failureReceived,finalReceipt,route,routeScope:hint.scope,independentSuiteCommand:layout==='ancestor'?'npm test':null,diagnosticCost:hint.cost,projectChecks:events.filter(e=>e.tool==='bash').map(e=>({exit:e.exit,durationMs:e.completedAt-e.startedAt})),portableCheckPassed:true,patchSha256:hash(patch),installedPackageBytesUnchanged:true,generatedCheckCaches,terminalStatus:report.status,terminationVerified:report.termination.verified};
  }
  result.push(evidence);console.log(JSON.stringify({completed:evidence}));
 }catch(e){console.error(log.slice(-12000));throw e;}
 finally{server.kill('SIGTERM');await new Promise(r=>server.once('close',r));await new Promise(r=>provider.close(r));}
 fs.rmSync(base,{recursive:true,force:true});
}
console.log(JSON.stringify({installed:'1.18.26',network:'Docker --network none; only loopback scripted HTTP',results:result}));
