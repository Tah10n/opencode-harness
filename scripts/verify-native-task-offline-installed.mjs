// Explicit native configuration; installed loopback-only workflow, no real model requests.
// Native OpenCode is unmodified. Observer records events without changing hooks/results.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {materializeNativeTemplate} from '../lib/native-template.mjs';
const root = '/repo', results = [];
const hash = x => createHash('sha256').update(x).digest('hex');
const run = (bin, args, cwd, env) => {
  const r = spawnSync(bin, args, {cwd, env, encoding:'utf8', timeout:30000});
  assert.equal(r.status, 0, r.stdout + r.stderr); return r.stdout.trim();
};
const write = (p, s) => {fs.mkdirSync(path.dirname(p), {recursive:true});fs.writeFileSync(p,s);};
const listen = s => new Promise(r => s.listen(0,'127.0.0.1',r));
const sleep = ms => new Promise(r => setTimeout(r,ms));
const override=JSON.parse(fs.readFileSync(root+'/development/native-task-offline/build.json'));
async function scenario(mode, offline) {
  const base='/work/'+mode, project=base+'/project', bundle=base+'/bundle';
  for(const n of ['home','config','data','cache','state','tmp','project','bin'])fs.mkdirSync(base+'/'+n,{recursive:true});
  const git=(...a)=>run('git',a,project);
  const source='export const value = 2; export const legacy = () => 7;\n';
  const test="import {value,legacy} from './value.mjs'; import assert from 'node:assert/strict'; import {test} from 'node:test';\ntest('public behavior',()=>{assert.equal(value,2);assert.equal(legacy(),7);});\n";
  write(project+'/value.mjs',source);write(project+'/value.test.mjs',test);fs.chmodSync(project+'/value.mjs',0o755);
  write(project+'/package.json',JSON.stringify({private:true,scripts:{test:'node --test'}}));
  write(project+'/opencode.json',JSON.stringify({$schema:'https://opencode.ai/config.json',permission:{task:'allow',bash:'allow',webfetch:'allow',read:{'private/**':'deny'},external_directory:'ask'},agent:{build:{permission:{webfetch:'allow',read:{'ask/**':'ask'}}}}}));
  git('init','-q');git('add','.');git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','baseline');
  const index=hash(fs.readFileSync(project+'/.git/index'));
  materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,task:true});
  const deps=root+'/local/native-task-integrated/plain-dependencies';
  for(const n of ['node_modules','package-lock.json'])fs.cpSync(deps+'/'+n,bundle+'/'+n,{recursive:true,verbatimSymlinks:true});
  for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync(deps+'/'+n,base+'/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});
  fs.copyFileSync(deps+'/rg',base+'/bin/rg');fs.chmodSync(base+'/bin/rg',0o755);
  const installed=hash(fs.readFileSync(bundle+'/native-task-plugin.mjs'));
  assert.equal(installed,hash(fs.readFileSync(root+'/lib/native-task-plugin.mjs')));
  const bundleHashes={};for(const file of fs.readdirSync(bundle).filter(f=>f.endsWith('.mjs'))){const actual=hash(fs.readFileSync(bundle+'/'+file));assert.equal(actual,hash(fs.readFileSync(root+'/lib/'+file)));bundleHashes[file]=actual;}
  // Separate passive observer: neither wraps fetch nor supplies terminal events.
  write(bundle+'/plugins/webfetch-observer.mjs',`import fs from 'node:fs';export default async()=>({event:async({event})=>{if(event.type==='message.part.updated'||event.type.startsWith('permission.'))fs.appendFileSync(${JSON.stringify(base+'/native-events.jsonl')},JSON.stringify({at:Date.now(),event})+'\\n');},'tool.execute.before':async(input,output)=>{fs.appendFileSync(${JSON.stringify(base+'/admissions.jsonl')},JSON.stringify({at:Date.now(),input,args:output.args})+'\\n');}});`);
  const bundleConfig=JSON.parse(fs.readFileSync(bundle+'/opencode.json'));bundleConfig.plugin.push('file://'+bundle+'/plugins/webfetch-observer.mjs');write(bundle+'/opencode.json',JSON.stringify(bundleConfig));
  let httpCount=0, providerError, step=0,parentStep=0,requests=0, operationDirectory=project;
  const inventories=[];
  const target=http.createServer((req,res)=>{httpCount++;res.end('successful page content');});await listen(target);
  const url=`http://127.0.0.1:${target.address().port}/resource`;
  const respond=(res,call,content='')=>{
    const delta=call?{role:'assistant',tool_calls:[{index:0,id:'fixture-'+requests,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}:{role:'assistant',content};
    const b={id:'r'+requests,object:'chat.completion.chunk',created:1,model:'fixture'};
    res.writeHead(200,{'content-type':'text/event-stream'});res.end(`data: ${JSON.stringify({...b,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...b,choices:[{index:0,delta:{},finish_reason:call?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`);
  };
  const provider=http.createServer(async(req,res)=>{try{
    assert.equal(req.url,'/v1/chat/completions');const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);const body=JSON.parse(raw);requests++;
    console.log(JSON.stringify({privateRequest:{mode,request:requests,base64:raw.toString('base64')}}));
    if(!body.tools?.length){respond(res,null,'Fixture title');return;}
    const u=body.messages.findLast(m=>m.role==='user'),text=typeof u?.content==='string'?u.content:JSON.stringify(u?.content);
    const role=text.includes('Implement the complete original task')?'author':'parent';
    const tools=body.tools.map(t=>t.function.name).sort();
    assert.equal(tools.includes('webfetch'),!offline,JSON.stringify({mode,role,tools}));
    for(const tool of ['read','edit','bash','glob','grep'])assert.ok(tools.includes(tool),tool);
    inventories.push({request:requests,role,sha256:hash(raw),tools,toolResults:body.messages.filter(m=>m.role==='tool').length});
    if(role==='parent'){respond(res,parentStep++===0?{name:'harness_task',args:{}}:null,'Retain actual workflow result');return;}
    if(step===0){const ids=fs.readdirSync(project+'/.git/harness-task');assert.equal(ids.length,1);operationDirectory=project+'/.git/harness-task/'+ids[0]+'/worktree';}
    if(step>0){const receipt=body.messages.filter(m=>m.role==='tool').at(-1);assert.ok(receipt);assert.doesNotMatch(JSON.stringify(receipt),/Error:|PermissionDenied|Tool execution aborted/);if(!offline&&step===1)assert.match(JSON.stringify(receipt),/successful page content/);}
    const edit=(file,oldString,newString)=>({name:'edit',args:{filePath:file,oldString,newString}});
    const bash=command=>({name:'bash',args:{command,description:'Actual local project check'}});
    const calls=[...(!offline?[{name:'webfetch',args:{url,format:'text',timeout:2}}]:[]),{name:'read',args:{filePath:'value.mjs'}},edit('value.mjs','value = 2','value = 3'),{name:'read',args:{filePath:'value.test.mjs'}},edit('value.test.mjs','value,2','value,3'),bash('npm test'),bash('git diff --check')];
    const call=calls[step];step++;respond(res,call,'Native diagnostic complete.');
  }catch(e){providerError=e;res.writeHead(400);res.end(e.message);}});await listen(provider);
  const config={model:'local-fixture/fixture',small_model:'local-fixture/fixture',provider:{'local-fixture':{npm:'@ai-sdk/openai-compatible',name:'Loopback fixture',options:{baseURL:`http://127.0.0.1:${provider.address().port}/v1`,apiKey:'not-a-credential'},models:{fixture:{name:'fixture',limit:{context:200000,output:10000}}}}}};
  write(base+'/config/opencode/opencode.json',JSON.stringify(config));
  write(base+'/task.txt','Change value from 2 to 3. Preserve legacy. Update the project test, run npm test and git diff --check.');
  const env={PATH:base+'/bin:/usr/local/bin:/usr/bin:/bin',SHELL:'/bin/bash',HOME:base+'/home',TMPDIR:base+'/tmp',...Object.fromEntries(['config','data','cache','state'].map(n=>['XDG_'+n.toUpperCase()+'_HOME',base+'/'+n])),OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_CONFIG_DIR:bundle,...(offline?{OPENCODE_CONFIG_CONTENT:JSON.stringify(override)}:{}),HARNESS_TASK_FILE:base+'/task.txt',HARNESS_TASK_TIMEOUT_MS:'60000',HARNESS_TASK_STRATEGY:'direct',...Object.fromEntries(['TYPE_COMPAT','COMMAND_HINTS','CONTEXT','CHECKS','SENSITIVITY','INVESTIGATION','EXTRA_ATTENTION'].map(n=>['HARNESS_TASK_'+n,'0']))};
  assert.equal(run('/opt/opencode',['--version'],project,env),'1.18.26');
  const portProbe=http.createServer();await listen(portProbe);const port=portProbe.address().port;await new Promise(r=>portProbe.close(r));
  const server=spawn('/opt/opencode',['serve','--hostname','127.0.0.1','--port',String(port)],{cwd:project,env,stdio:['ignore','pipe','pipe']});let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);
  const api=async(method,p,body)=>{const r=await fetch(`http://127.0.0.1:${port}${p}`,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});assert.ok(r.ok,await r.clone().text());return r.json();};
  try{
    let ready=false;for(let n=0;n<150;n++){try{await api('GET','/global/health');ready=true;break;}catch{await sleep(100);}}assert.ok(ready,log);
    const resolved=await api('GET','/config');
    const agents=await api('GET','/agent');const build=agents.find(a=>a.name==='build');assert.ok(build);
    const effective=build.permission.filter(p=>p.permission==='webfetch'||p.permission==='*').at(-1);
    assert.equal(effective.action,offline?'deny':'allow');assert.equal(effective.pattern,'*');
    assert.equal(resolved.permission.read['private/**'],'deny');assert.equal(resolved.agent.build.permission.read['ask/**'],'ask');assert.equal(resolved.permission.external_directory,'ask');
    assert.equal(resolved.permission.bash,'allow');assert.equal(resolved.model,config.model);assert.equal(resolved.small_model,config.small_model);
    assert.ok(resolved.command['harness-task']);assert.ok(resolved.plugin.some(p=>p.includes('native-task-plugin')));
    // Fresh session is a supported preparation precondition. Reject custom session
    // permission overrides before sending any command (they outrank agent rules).
    const validateSession=s=>{assert.equal(s.parentID,undefined,'Resumed/child session unsupported');assert.deepEqual(s.permission??[],[],'Custom session permissions unsupported for this preparation');};
    const before=requests;
    const conflict=await api('POST','/session',{permission:[{permission:'webfetch',pattern:'*',action:'allow'}]});
    assert.throws(()=>validateSession(conflict),/Custom session permissions/);assert.equal(requests,before);
    await api('DELETE',`/session/${conflict.id}`);
    const session=await api('POST','/session',{});validateSession(session);
    await api('POST',`/session/${session.id}/command`,{command:'harness-task',arguments:'',agent:'build',model:'local-fixture/fixture'});
    if(providerError)throw providerError;
    const admissions=fs.readFileSync(base+'/admissions.jsonl','utf8').trim().split('\n').map(JSON.parse);
    const rawEvents=fs.readFileSync(base+'/native-events.jsonl','utf8').trim().split('\n').map(JSON.parse);
    const authorID=admissions.find(a=>a.input.tool==='read')?.input.sessionID;assert.ok(authorID);assert.notEqual(authorID,session.id);
    const child=await api('GET',`/session/${authorID}`);assert.equal(child.parentID,session.id);
    assert.deepEqual(child.permission,[{permission:'harness_task',pattern:'*',action:'deny'},{permission:'task',pattern:'*',action:'deny'}]);
    for(const inventory of inventories)inventory.sessionID=inventory.role==='author'?authorID:session.id;
    const authorRequests=inventories.filter(r=>r.role==='author');assert.equal(authorRequests.length,offline?7:8);assert.ok(authorRequests.slice(1).every(r=>r.toolResults>0));
    assert.equal(httpCount,offline?0:1);assert.equal(admissions.filter(a=>a.input.tool==='webfetch').length,offline?0:1);
    const finalTools=new Map();for(const e of rawEvents){const p=e.event.properties?.part;if(p?.type==='tool')finalTools.set(p.id,p);}
    assert.ok(finalTools.size>0);assert.ok([...finalTools.values()].every(p=>p.state.status==='completed'));
    const commands=[...finalTools.values()].filter(p=>p.tool==='bash').map(p=>({command:p.state.input.command,exit:p.state.metadata.exit,time:p.state.time,outputSha256:hash(p.state.output)}));
    assert.deepEqual(commands.map(c=>c.command),['npm test','git diff --check']);
    const lastEdit=Math.max(...[...finalTools.values()].filter(p=>p.tool==='edit').map(p=>p.state.time.end));
    assert.ok(commands.every(c=>c.exit===0&&c.time.start>=lastEdit));
    assert.ok(rawEvents.some(e=>{const p=e.event.properties?.part;return p?.sessionID===authorID&&p.type==='step-finish'&&p.reason==='stop';}));
    const dir=path.dirname(operationDirectory),report=JSON.parse(fs.readFileSync(dir+'/result.json'));
    assert.equal(report.termination.verified,true);assert.equal(report.termination.abortRequests,0);assert.ok(!fs.existsSync(dir+'/terminal-reason.json'));
    assert.equal(git('status','--porcelain'), '');assert.equal(hash(fs.readFileSync(project+'/.git/index')),index);
    const patch=fs.readFileSync(dir+'/terminal.patch','utf8');assert.ok(!patch.includes('/work/')&&!patch.includes('.git/harness-task')&&!patch.includes('opencode.json'));write(base+'/success.patch',patch);
    run('git',['clone','--quiet','--no-hardlinks',project,base+'/portable'],base);run('git',['apply',base+'/success.patch'],base+'/portable');run('npm',['test'],base+'/portable',env);run('git',['diff','--check'],base+'/portable');
    assert.equal(run('git',['diff','--name-only'],base+'/portable'),'value.mjs\nvalue.test.mjs');
    assert.equal(fs.readFileSync(base+'/portable/value.mjs','utf8'),source.replace('value = 2','value = 3'));
    assert.equal(fs.readFileSync(base+'/portable/value.test.mjs','utf8'),test.replace('value,2','value,3'));
    console.log(JSON.stringify({privatePatch:{mode,patch}}));
    const files={};for(const file of ['value.mjs','value.test.mjs']){const original=fs.readFileSync(operationDirectory+'/'+file),portable=fs.readFileSync(base+'/portable/'+file);assert.deepEqual(original,portable);const mode=fs.statSync(operationDirectory+'/'+file).mode&0o777;assert.equal(fs.statSync(base+'/portable/'+file).mode&0o777,mode);files[file]={sha256:hash(portable),mode};}
    const evidence={mode,offline,installedPluginSha256:installed,bundleHashes,requests,inventories,commands,httpCount,status:report.status,termination:report.termination,parent:{id:session.id,permission:session.permission??[]},child:{id:authorID,permission:child.permission},effectivePermissions:build.permission,configPermission:resolved.permission,selectedAgentPermission:resolved.agent.build.permission,conflictingSessionRejectedBeforeProvider:true,originalUnchanged:true,allToolsCompleted:true,portableChecks:'passed',patchSha256:hash(patch),files};
    results.push(evidence);console.log(JSON.stringify({progress:mode+' passed'}));
  }catch(e){console.error(log.slice(-5000));throw e;}
  finally{target.closeAllConnections();await new Promise(r=>target.close(r));server.kill('SIGTERM');await new Promise(r=>server.once('close',r));provider.closeAllConnections();await new Promise(r=>provider.close(r));}
  fs.rmSync(base,{recursive:true,force:true});
}
await scenario('sequential-offline',true);
await scenario('sequential-ordinary',false);
const concurrent=await Promise.allSettled([scenario('concurrent-offline',true),scenario('concurrent-ordinary',false)]);
for(const result of concurrent)if(result.status==='rejected')throw result.reason;
for(const role of ['parent','author']){
  const normal=results.find(r=>!r.offline).inventories.find(r=>r.role===role).tools;
  for(const result of results)for(const request of result.inventories.filter(r=>r.role===role))assert.deepEqual(request.tools,result.offline?normal.filter(t=>t!=='webfetch'):normal);
}
console.log(JSON.stringify({installed:'1.18.26',binarySha256:hash(fs.readFileSync('/opt/opencode')),network:'none; loopback only',realProviderCalls:0,fixtureSha256:hash(fs.readFileSync('/repo/scripts/verify-native-task-offline-installed.mjs')),override,results}));
