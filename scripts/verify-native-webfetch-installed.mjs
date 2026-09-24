// Installed lifecycle counterexample, no external network or model requests.
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
const modes=['baseline-success','transport','http-stream','challenge-transport','deny','baseline-transport'];
for (const mode of (process.env.WEBFETCH_MODES?.split(',') ?? modes)) {
  assert.ok(modes.includes(mode),'Unknown fixture mode');
  const isHarness=mode.startsWith('baseline-'),isSuccess=mode.endsWith('success');
  const base='/work/'+mode, project=base+'/project', bundle=base+'/bundle';
  for(const n of ['home','config','data','cache','state','tmp','project','bin'])fs.mkdirSync(base+'/'+n,{recursive:true});
  const git=(...a)=>run('git',a,project);
  const source='export const value = 2; export const legacy = () => 7;\n';
  const test="import {value,legacy} from './value.mjs'; import assert from 'node:assert/strict'; import {test} from 'node:test';\ntest('public behavior',()=>{assert.equal(value,2);assert.equal(legacy(),7);});\n";
  write(project+'/value.mjs',source);write(project+'/value.test.mjs',test);
  write(project+'/package.json',JSON.stringify({private:true,scripts:{test:'node --test'}}));
  write(project+'/opencode.json',JSON.stringify({$schema:'https://opencode.ai/config.json',permission:{task:'allow',bash:'allow',webfetch:'allow'}}));
  git('init','-q');git('add','.');git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','baseline');
  const index=hash(fs.readFileSync(project+'/.git/index'));
  materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,task:true});
  const deps=root+'/local/native-task-integrated/plain-dependencies';
  for(const n of ['node_modules','package-lock.json'])fs.cpSync(deps+'/'+n,bundle+'/'+n,{recursive:true,verbatimSymlinks:true});
  for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync(deps+'/'+n,base+'/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});
  fs.copyFileSync(deps+'/rg',base+'/bin/rg');fs.chmodSync(base+'/bin/rg',0o755);
  const installed=hash(fs.readFileSync(bundle+'/native-task-plugin.mjs'));
  assert.equal(installed,hash(fs.readFileSync(root+'/lib/native-task-plugin.mjs')));
  // Separate passive observer: neither wraps fetch nor supplies terminal events.
  write(bundle+'/plugins/webfetch-observer.mjs',`import fs from 'node:fs';export default async()=>({event:async({event})=>{if(event.type==='message.part.updated'||event.type.startsWith('permission.'))fs.appendFileSync(${JSON.stringify(base+'/native-events.jsonl')},JSON.stringify({at:Date.now(),event})+'\\n');},'tool.execute.before':async(input,output)=>{fs.appendFileSync(${JSON.stringify(base+'/admissions.jsonl')},JSON.stringify({at:Date.now(),input,args:output.args})+'\\n');}});`);
  const bundleConfig=JSON.parse(fs.readFileSync(bundle+'/opencode.json'));bundleConfig.plugin.push('file://'+bundle+'/plugins/webfetch-observer.mjs');write(bundle+'/opencode.json',JSON.stringify(bundleConfig));
  let httpCount=0, activeResponse, streamingSocket, timer, writesAfterError=0, writeErrorsAfterReceipt=0, activeAtReceipt=false, activeAfterObservation=false, errorReceiptAt, providerError, step=0,parentStep=0,requests=0, toolReceipt, operationDirectory=project;
  const webEvents=[];
  const target=http.createServer((req,res)=>{
    httpCount++;webEvents.push({kind:'request',at:Date.now(),url:req.url,userAgent:req.headers['user-agent']});
    if(mode.includes('transport')&&!(mode==='challenge-transport'&&httpCount===1)){req.socket.destroy();return;}
    if(['http-stream','challenge-transport'].includes(mode)){
      activeResponse=res;streamingSocket=req.socket;
      res.writeHead(mode==='challenge-transport'?403:503,{'content-type':'text/plain',...(mode==='challenge-transport'?{'cf-mitigated':'challenge'}:{})});res.write('first chunk\n');
      res.on('close',()=>webEvents.push({kind:'response-close',at:Date.now(),finished:res.writableFinished}));
      timer=setInterval(()=>{if(!res.destroyed)res.write('still active body\n',error=>{if(errorReceiptAt){if(error)writeErrorsAfterReceipt++;else writesAfterError++;}});},40);return;
    }
    res.end('permission denied / fetch failed: successful page content');
  });await listen(target);
  const url=`http://127.0.0.1:${target.address().port}/resource`;
  const respond=(res,call,content='')=>{
    const delta=call?{role:'assistant',tool_calls:[{index:0,id:'fixture-'+requests,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}:{role:'assistant',content};
    const b={id:'r'+requests,object:'chat.completion.chunk',created:1,model:'fixture'};
    res.writeHead(200,{'content-type':'text/event-stream'});res.end(`data: ${JSON.stringify({...b,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...b,choices:[{index:0,delta:{},finish_reason:call?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`);
  };
  const provider=http.createServer(async(req,res)=>{try{
    assert.equal(req.url,'/v1/chat/completions');const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));requests++;
    if(!body.tools?.length){respond(res,null,'Fixture title');return;}
    const u=body.messages.findLast(m=>m.role==='user'),text=typeof u?.content==='string'?u.content:JSON.stringify(u?.content);
    if(isHarness&&!text.includes('Implement the complete original task')){respond(res,parentStep++===0?{name:'harness_task',args:{}}:null,'Retain actual workflow result');return;}
    if(step===0&&isHarness){const ids=fs.readdirSync(project+'/.git/harness-task');assert.equal(ids.length,1);operationDirectory=project+'/.git/harness-task/'+ids[0]+'/worktree';}
    if(step===1){
      toolReceipt=body.messages.filter(m=>m.role==='tool').at(-1);assert.ok(toolReceipt,'Native tool result absent');errorReceiptAt=Date.now();
      if(isSuccess)assert.match(JSON.stringify(toolReceipt),/successful page content/);
      else if(mode==='deny')assert.match(JSON.stringify(toolReceipt),/specified a rule/);
      else if(mode==='http-stream')assert.match(JSON.stringify(toolReceipt),/503/);
      else assert.match(JSON.stringify(toolReceipt),/Transport error/);
      if(activeResponse){
        activeAtReceipt=!activeResponse.destroyed&&!activeResponse.writableFinished&&!streamingSocket.destroyed;
        await sleep(240);
        activeAfterObservation=!activeResponse.destroyed&&!activeResponse.writableFinished&&!streamingSocket.destroyed;
        // GC/finalization can close the response between observations. Report that
        // outcome; do not retry or turn non-reproduction into a settlement guarantee.
      }
    }
    const edit=(file,oldString,newString)=>({name:'edit',args:{filePath:file,oldString,newString}});
    const bash=command=>({name:'bash',args:{command,description:'Actual local project check'}});
    const calls=[{name:'webfetch',args:{url,format:'text',timeout:2}},{name:'read',args:{filePath:'value.mjs'}},edit('value.mjs','value = 2','value = 3'),{name:'read',args:{filePath:'value.test.mjs'}},edit('value.test.mjs','value,2','value,3'),bash('npm test'),bash('git diff --check')];
    // This bare-native diagnostic deliberately stops on errors. Only the success control delivers.
    const call=isSuccess||step===0?calls[step]:null;step++;respond(res,call,'Native diagnostic complete.');
  }catch(e){providerError=e;res.writeHead(400);res.end(e.message);}});await listen(provider);
  const config={model:'local-fixture/fixture',small_model:'local-fixture/fixture',provider:{'local-fixture':{npm:'@ai-sdk/openai-compatible',name:'Loopback fixture',options:{baseURL:`http://127.0.0.1:${provider.address().port}/v1`,apiKey:'not-a-credential'},models:{fixture:{name:'fixture',limit:{context:200000,output:10000}}}}}};
  write(base+'/task.txt','Change value from 2 to 3. Preserve legacy. Update the project test, run npm test and git diff --check.');
  const env={PATH:base+'/bin:/usr/local/bin:/usr/bin:/bin',SHELL:'/bin/bash',HOME:base+'/home',TMPDIR:base+'/tmp',...Object.fromEntries(['config','data','cache','state'].map(n=>['XDG_'+n.toUpperCase()+'_HOME',base+'/'+n])),OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_CONFIG_DIR:bundle,OPENCODE_CONFIG_CONTENT:JSON.stringify(config),HARNESS_TASK_FILE:base+'/task.txt',HARNESS_TASK_TIMEOUT_MS:'60000',HARNESS_TASK_STRATEGY:'direct',...Object.fromEntries(['TYPE_COMPAT','COMMAND_HINTS','CONTEXT','CHECKS','SENSITIVITY','INVESTIGATION','EXTRA_ATTENTION'].map(n=>['HARNESS_TASK_'+n,'0']))};
  assert.equal(run('/opt/opencode',['--version'],project,env),'1.18.26');
  const portProbe=http.createServer();await listen(portProbe);const port=portProbe.address().port;await new Promise(r=>portProbe.close(r));
  const server=spawn('/opt/opencode',['serve','--hostname','127.0.0.1','--port',String(port)],{cwd:project,env,stdio:['ignore','pipe','pipe']});let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);
  const api=async(method,p,body)=>{const r=await fetch(`http://127.0.0.1:${port}${p}`,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});assert.ok(r.ok,await r.clone().text());return r.json();};
  try{
    let ready=false;for(let n=0;n<150;n++){try{await api('GET','/global/health');ready=true;break;}catch{await sleep(100);}}assert.ok(ready,log);
    const session=await api('POST','/session',mode==='deny'?{permission:[{permission:'webfetch',pattern:url,action:'deny'}]}:{});let nativeReply;
    if(isHarness)await api('POST',`/session/${session.id}/command`,{command:'harness-task',arguments:'',agent:'build',model:'local-fixture/fixture'});
    else nativeReply = await api('POST',`/session/${session.id}/message`,{agent:'build',model:{providerID:'local-fixture',modelID:'fixture'},parts:[{type:'text',text:'Run the controlled native webfetch diagnostic.'}]});
    if(providerError)throw providerError;
    assert.ok(step>0,JSON.stringify({requests,response:nativeReply}));
    const admissions=fs.readFileSync(base+'/admissions.jsonl','utf8').trim().split('\n').map(JSON.parse);
    const rawEvents=fs.readFileSync(base+'/native-events.jsonl','utf8').trim().split('\n').map(JSON.parse);
    const native=rawEvents.filter(e=>e.event.properties?.part?.tool==='webfetch');
    const terminal=native.findLast(e=>['completed','error'].includes(e.event.properties.part.state.status));assert.ok(terminal,log);
    const part=terminal.event.properties.part;assert.equal(part.state.status,isSuccess?'completed':'error');
    assert.equal(httpCount,mode==='deny'?0:mode==='challenge-transport'?2:1);
    const admission=admissions.find(a=>a.input.callID===part.callID&&a.input.sessionID===part.sessionID);
    assert.ok(admission);assert.deepEqual(admission.args,part.state.input);
    assert.ok(Number.isFinite(part.state.time.start)&&Number.isFinite(part.state.time.end)&&part.state.time.end>=part.state.time.start&&part.state.time.end>=admission.at);
    assert.ok(['pending','running',part.state.status].every(status=>native.some(e=>e.event.properties.part.state.status===status)));
    const evidence={mode,installedPluginSha256:installed,requests,httpCount,toolReceipt,admission,native:native.map(e=>({at:e.at,part:e.event.properties.part})),webEvents,writesAfterError,writeErrorsAfterReceipt,activeAtReceipt,activeAfterObservation,counterexample:activeResponse?(activeAfterObservation&&writesAfterError>0?'observed':'not-observed'):'not-applicable'};
    if(isHarness){
      const dir=path.dirname(operationDirectory),report=JSON.parse(fs.readFileSync(dir+'/result.json'));
      evidence.terminalReason=fs.existsSync(dir+'/terminal-reason.json')?JSON.parse(fs.readFileSync(dir+'/terminal-reason.json')):null;evidence.toolEvents=JSON.parse(fs.readFileSync(dir+'/tool-events.json'));evidence.status=report.status;
      if(!isSuccess){assert.equal(evidence.terminalReason.kind,'tool_error');assert.equal(step,1,'Harness unexpectedly continued');}else{assert.equal(report.termination.verified,true);assert.equal(report.termination.abortRequests,0);assert.ok(rawEvents.some(e=>{const p=e.event.properties?.part;return p?.sessionID===part.sessionID&&p.type==='step-finish'&&p.reason==='stop';}));assert.ok(!evidence.terminalReason);}assert.equal(git('diff'),'');assert.equal(hash(fs.readFileSync(project+'/.git/index')),index);
    }else assert.ok(toolReceipt);
    if(isSuccess){
      const patch=isHarness?fs.readFileSync(path.dirname(operationDirectory)+'/terminal.patch','utf8'):git('diff')+'\n';assert.ok(!patch.includes('/work/')&&!patch.includes('.git/harness-task'));write(base+'/success.patch',patch);
      run('git',['clone','--quiet','--no-hardlinks',project,base+'/portable'],base);run('git',['apply',base+'/success.patch'],base+'/portable');run('npm',['test'],base+'/portable',env);run('git',['diff','--check'],base+'/portable');evidence.portableChecks='passed (successful webfetch control only)';
    }
    results.push(evidence);console.log(JSON.stringify({completed:evidence}));
  }catch(e){console.error(log.slice(-5000));throw e;}
  finally{clearInterval(timer);target.closeAllConnections();await new Promise(r=>target.close(r));server.kill('SIGTERM');await new Promise(r=>server.once('close',r));provider.closeAllConnections();await new Promise(r=>provider.close(r));}
  fs.rmSync(base,{recursive:true,force:true});
}
console.log(JSON.stringify({installed:'1.18.26',binarySha256:hash(fs.readFileSync('/opt/opencode')),network:'none; loopback only',realProviderCalls:0,results}));
