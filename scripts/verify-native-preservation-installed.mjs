// Predetermined author: integration evidence, not model selection/quality evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {materializeNativeTemplate} from '../lib/native-template.mjs';
const root='/repo', hash=x=>createHash('sha256').update(x).digest('hex');
const write=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
const json=(p,x)=>write(p,JSON.stringify(x,null,2)+'\n');
const run=(bin,args,cwd,env=process.env)=>{const r=spawnSync(bin,args,{cwd,env,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return r.stdout.trim();};
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
for(const mode of (process.env.PRESERVATION_MODES?.split(',')??['counter','parcel','off','irrelevant'])) {
  const base='/work/'+mode, project=base+'/project', bundle=base+'/bundle', task=base+'/task.txt';
  for(const n of ['home','config','data','cache','state','tmp','project','bin'])fs.mkdirSync(base+'/'+n,{recursive:true});
  const git=(...args)=>run('git',args,project);
  const alternate=mode==='parcel', oldName=alternate?'lookup':'increment', featureName=alternate?'inspect':'double';
  const old=`exports.${oldName} = n => n + 1;\n`, dirty='// user draft retained\n';
  const addition=`exports.${featureName} = n => n * 2;\n`;
  const broken=old.replace('n + 1','n - 1')+addition+dirty, repaired=old+addition+dirty;
  const folder=alternate?'spec':'test';
  const featureFile=folder+(alternate?'/extension.test.mjs':'/feature.test.js');
  const oldTest=`const test = require('node:test'), assert = require('node:assert/strict'), api = require('../index');\ntest('existing ${oldName}', () => assert.equal(api.${oldName}(4), 5));\n`;
  const featureTest=alternate ? `import test from 'node:test'; import assert from 'node:assert/strict'; import api from '../index.js';\ntest('new ${featureName}', () => assert.equal(api.${featureName}(4), 8));\n` : `const test = require('node:test'), assert = require('node:assert/strict'), api = require('../index');\ntest('new ${featureName}', () => assert.equal(api.${featureName}(4), 8));\n`;
  write(project+'/index.js',old);write(project+'/'+folder+'/old.test.js',oldTest);
  write(project+'/'+folder+'/unrelated.test.js',"const test = require('node:test'), assert = require('node:assert/strict');\ntest('constant behavior', () => assert.equal(2 + 2, 4));\n");
  write(project+'/check.sh','#!/bin/sh\nexec node --test\n');fs.chmodSync(project+'/check.sh',0o755);
  json(project+'/package.json',{name:'preservation-'+mode,private:true,scripts:{test:'node --test'}});
  json(project+'/opencode.json',{$schema:'https://opencode.ai/config.json',permission:{task:'allow',bash:'allow',external_directory:'allow'}});
  git('init','-q');git('add','.');git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','baseline');
  write(project+'/index.js',old+dirty);
  const originalDiff=git('diff'),originalStatus=git('status','--porcelain'),originalIndex=hash(fs.readFileSync(project+'/.git/index'));
  const taskText=`Add ${featureName}(n), returning twice n, to the public module. Preserve ${oldName}(n), returning n plus one. Keep existing assertions and user draft. Add a feature test and run npm test after the final production change.`;
  write(task,taskText);materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,task:true});
  const dependencies=root+'/local/native-task-integrated/plain-dependencies';
  for(const n of ['node_modules','package-lock.json'])fs.cpSync(dependencies+'/'+n,bundle+'/'+n,{recursive:true,verbatimSymlinks:true});
  fs.mkdirSync(base+'/config/opencode',{recursive:true});
  for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync(dependencies+'/'+n,base+'/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});
  fs.copyFileSync(dependencies+'/rg',base+'/bin/rg');fs.chmodSync(base+'/bin/rg',0o755);
  const installed=Object.fromEntries(['native-task-plugin.mjs','native-task-observations.mjs','native-preservation-nudge.mjs'].map(n=>{const sha=hash(fs.readFileSync(bundle+'/'+n));assert.equal(sha,hash(fs.readFileSync(root+'/lib/'+n)));return[n,sha];}));
  if(mode==='off')fs.unlinkSync(bundle+'/native-preservation-nudge.mjs');
  let step=0,parentSteps=0,requests=0,worktree,providerError,received=false,receivedFailure=false;
  const requestEvidence=[];
  const respond=(res,call,content='')=>{const delta=call?{role:'assistant',tool_calls:[{index:0,id:'fixture-'+requests,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}:{role:'assistant',content};const b={id:'r'+requests,object:'chat.completion.chunk',created:1,model:'fixture'};res.writeHead(200,{'content-type':'text/event-stream'});res.end(`data: ${JSON.stringify({...b,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...b,choices:[{index:0,delta:{},finish_reason:call?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`);};
  const provider=http.createServer(async(req,res)=>{try{
    assert.equal(req.url,'/v1/chat/completions');const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));requests++;
    if(!body.tools?.length){respond(res,null,'Fixture title');return;}
    const user=body.messages.findLast(m=>m.role==='user'),text=typeof user?.content==='string'?user.content:JSON.stringify(user?.content);
    if(!text.includes('Implement the complete original task')){respond(res,parentSteps++===0?{name:'harness_task',args:{}}:null,'Report actual results.');return;}
    assert.ok(text.includes(taskText),'Full task missing');
    const outputs=body.messages.filter(m=>m.role==='tool').map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content)).join('\n');
    const bash=command=>({name:'bash',args:{command,workdir:'.',description:'Public project check',timeout:90000}});
    let call;
    if(step===0){const dirs=fs.readdirSync(project+'/.git/harness-task');assert.equal(dirs.length,1);worktree=project+'/.git/harness-task/'+dirs[0]+'/worktree';call={name:'read',args:{filePath:'index.js'}};}
    else if(step===1)call={name:'edit',args:{filePath:'index.js',oldString:old+dirty,newString:broken}};
    else if(step===2)call={name:'write',args:{filePath:path.join(worktree,featureFile),content:featureTest}};
    else if(step===3)call=bash('node --test '+featureFile);
    else if(step===4){received=outputs.includes('Preservation advisory:');requestEvidence.push({kind:'feature-receipt',request:requests,sha256:hash(Buffer.concat(chunks)),advisoryInLastTool:JSON.stringify(body.messages.findLast(m=>m.role==='tool')).includes('Preservation advisory:')});assert.equal(requestEvidence.at(-1).advisoryInLastTool,mode!=='off');assert.equal(received,mode!=='off',JSON.stringify({advisory:fs.existsSync(path.dirname(worktree)+'/preservation-nudge.json')?JSON.parse(fs.readFileSync(path.dirname(worktree)+'/preservation-nudge.json')):null,events:JSON.parse(fs.readFileSync(path.dirname(worktree)+'/tool-events.json')).slice(-1)}));assert.ok(outputs.includes('new '+featureName));call=bash('node --test '+folder+(mode==='irrelevant'?'/unrelated.test.js':'/old.test.js'));}
    else if(step===5){receivedFailure=outputs.includes('ERR_ASSERTION');requestEvidence.push({kind:'existing-check-receipt',request:requests,sha256:hash(Buffer.concat(chunks)),failureInLastTool:JSON.stringify(body.messages.findLast(m=>m.role==='tool')).includes('ERR_ASSERTION')});assert.equal(requestEvidence.at(-1).failureInLastTool,mode!=='irrelevant');assert.equal(receivedFailure,mode!=='irrelevant');if(mode==='irrelevant'){respond(res,null,'Checked unrelated constant behavior. Existing behavior remains unverified.');step++;return;}call={name:'edit',args:{filePath:'index.js',oldString:broken,newString:repaired}};}
    else if(step===6)call=bash('node --test '+featureFile);
    else if(step===7)call=bash('node --test '+folder+'/old.test.js');
    else if(step===8)call=bash('npm test');
    else {assert.ok(outputs.includes('# fail 0') || outputs.includes('ℹ fail 0'));respond(res,null,'Implemented the feature, repaired existing behavior and ran npm test after the last edit.');step++;return;}
    assert.ok(body.tools.some(t=>t.function?.name===call.name),'Native tool absent');step++;respond(res,call);
  }catch(e){providerError=e;console.error(e.stack);respond(res,null,'Scripted fixture stopped after assertion failure.');}});
  await listen(provider);
  const config={model:'local-fixture/fixture',small_model:'local-fixture/fixture',provider:{'local-fixture':{npm:'@ai-sdk/openai-compatible',name:'Local scripted author',options:{baseURL:`http://127.0.0.1:${provider.address().port}/v1`,apiKey:'not-a-credential'},models:{fixture:{name:'fixture',limit:{context:200000,output:10000}}}}}};
  const env={PATH:base+'/bin:/usr/local/bin:/usr/bin:/bin',SHELL:'/bin/bash',HOME:base+'/home',TMPDIR:base+'/tmp',...Object.fromEntries(['config','data','cache','state'].map(n=>['XDG_'+n.toUpperCase()+'_HOME',base+'/'+n])),OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_CONFIG_DIR:bundle,OPENCODE_CONFIG_CONTENT:JSON.stringify(config),HARNESS_TASK_FILE:task,HARNESS_TASK_TIMEOUT_MS:'240000',HARNESS_TASK_STRATEGY:'direct',HARNESS_TASK_PRESERVATION_NUDGE:mode==='off'?'0':'1',HARNESS_TASK_TYPE_COMPAT:'0',HARNESS_TASK_COMMAND_HINTS:'0',HARNESS_TASK_CONTEXT:'0',HARNESS_TASK_CHECKS:'0',HARNESS_TASK_SENSITIVITY:'0',HARNESS_TASK_INVESTIGATION:'0',HARNESS_TASK_EXTRA_ATTENTION:'0'};
  assert.equal(run('/opt/opencode',['--version'],project,env),'1.18.26');
  const portServer=http.createServer();await listen(portServer);const port=portServer.address().port;await new Promise(r=>portServer.close(r));
  const server=spawn('/opt/opencode',['serve','--hostname','127.0.0.1','--port',String(port)],{cwd:project,env,stdio:['ignore','pipe','pipe']});let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);
  const api=async(method,p,body)=>{const r=await fetch(`http://127.0.0.1:${port}${p}`,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(p==='/global/health'?1500:270000)});assert.ok(r.ok,await r.clone().text());return r.json();};
  try{
    let ready=false;for(let n=0;n<200;n++){try{await api('GET','/global/health');ready=true;break;}catch{await wait(100);}}assert.ok(ready,log);
    const session=await api('POST','/session',{});await api('POST',`/session/${session.id}/command`,{command:'harness-task',arguments:'',agent:'build',model:'local-fixture/fixture'});if(providerError)throw providerError;
    assert.ok(worktree,log);const artifacts=path.dirname(worktree),report=JSON.parse(fs.readFileSync(artifacts+'/result.json')),events=JSON.parse(fs.readFileSync(artifacts+'/tool-events.json'));
    assert.ok(!JSON.stringify(events).includes('Preservation advisory:'));assert.equal(report.termination.verified,true);assert.ok(!fs.existsSync(artifacts+'/terminal-reason.json'));
    assert.equal(git('diff'),originalDiff);assert.equal(git('status','--porcelain'),originalStatus);assert.equal(hash(fs.readFileSync(project+'/.git/index')),originalIndex);
    const advisory=mode==='off'?null:JSON.parse(fs.readFileSync(artifacts+'/preservation-nudge.json'));
    if(mode==='off')assert.ok(!fs.existsSync(artifacts+'/preservation-nudge.json'));else assert.equal(advisory.attachedBlocks,1);
    const checks=events.filter(e=>e.tool==='bash').map(e=>({command:e.args.command,exit:e.exit,durationMs:e.completedAt-e.startedAt}));assert.deepEqual(checks.map(c=>c.exit),mode==='irrelevant'?[0,0]:[0,1,0,0,0]);
    if(mode!=='irrelevant') assert.equal(report.observations.unresolvedFailures.length,0,JSON.stringify(report));
    const patch=fs.readFileSync(artifacts+'/terminal.patch','utf8');assert.ok(!patch.includes('/work/')&&!patch.includes('/repo/')&&!patch.includes('.git/harness-task'));
    const clone=base+'/portable';run('git',['clone','--quiet','--no-hardlinks',project,clone],base);run('git',['apply',artifacts+'/terminal.patch'],clone);
    assert.equal(fs.readFileSync(clone+'/'+folder+'/old.test.js','utf8'),oldTest);assert.equal(fs.readFileSync(clone+'/'+featureFile,'utf8'),featureTest);
    for(const file of ['index.js',folder+'/old.test.js',featureFile,'check.sh']){assert.equal(hash(fs.readFileSync(clone+'/'+file)),hash(fs.readFileSync(worktree+'/'+file)));assert.equal(fs.statSync(clone+'/'+file).mode&0o777,fs.statSync(worktree+'/'+file).mode&0o777);}
    const t=Date.now(), portable=spawnSync('npm',['test'],{cwd:clone,env,encoding:'utf8',timeout:90000});assert.equal(portable.status,mode==='irrelevant'?1:0,portable.stdout+portable.stderr);
    results.push({mode,installed,requests,requestEvidence,received,receivedFailure,status:report.status,checks,advisory,portable:{exit:portable.status,durationMs:Date.now()-t,patchSha256:hash(patch),bytesAndModes:true},originalCheckoutAndIndexUnchanged:true});
    console.log(JSON.stringify({completed:mode}));
  }catch(e){console.error(log.slice(-10000));throw e;}finally{server.kill('SIGTERM');await new Promise(r=>server.once('close',r));await new Promise(r=>provider.close(r));}
  fs.rmSync(base,{recursive:true,force:true});
}
console.log(JSON.stringify({installed:'1.18.26',network:'none; loopback scripted provider',realProviderCalls:0,scriptedAuthor:true,results}));
