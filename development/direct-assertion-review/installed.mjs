// One predetermined native author per scenario; no model-quality inference.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {materializeNativeTemplate} from '../../lib/native-template.mjs';
import {original,changed,gated,mixed,oldAssertion,newAssertion,regression,task,preservedTask,acceptanceSource} from './fixture.mjs';
const root='/repo', hash=x=>createHash('sha256').update(x).digest('hex');
const write=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
const json=(p,x)=>write(p,JSON.stringify(x,null,2)+'\n');
const run=(bin,args,cwd,env=process.env)=>{const r=spawnSync(bin,args,{cwd,env,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return r.stdout.trim();};
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const privateDir='/work/evidence';fs.mkdirSync(privateDir,{recursive:true});
const results=[];
for(const mode of ['replacement','preserved']) {
  const started=Date.now(), replaced=mode==='replacement';
  const base='/work/'+mode,project=base+'/project',bundle=base+'/bundle',taskFile=base+'/task.txt';
  for(const n of ['home','config','cache','state','tmp','project','bin'])fs.mkdirSync(base+'/'+n,{recursive:true});
  const git=(...args)=>run('git',args,project);
  write(project+'/index.cjs',original);write(project+'/mixed.test.cjs',mixed);
  write(project+'/check.sh','#!/bin/sh\nexec node --test\n');fs.chmodSync(project+'/check.sh',0o755);
  write(project+'/draft.txt','initial user draft\n');
  json(project+'/package.json',{name:'neutral-normalization',private:true,scripts:{test:'node --test'}});
  json(project+'/opencode.json',{$schema:'https://opencode.ai/config.json',permission:{task:'allow',bash:'allow',external_directory:'allow'}});
  git('init','-q');git('add','.');git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','baseline');
  write(project+'/draft.txt','staged user draft\n');git('add','draft.txt');write(project+'/draft.txt','staged user draft\nunstaged addition\n');write(project+'/notes.txt','untracked user note\n');
  const originalDiff=git('diff','HEAD'),originalStatus=git('status','--porcelain'),originalIndex=hash(fs.readFileSync(project+'/.git/index'));
  const taskText=replaced?task:preservedTask;write(taskFile,taskText);
  materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,task:true});
  const dependencies=root+'/local/native-task-integrated/plain-dependencies';
  for(const n of ['node_modules','package-lock.json'])fs.cpSync(dependencies+'/'+n,bundle+'/'+n,{recursive:true,verbatimSymlinks:true});
  fs.mkdirSync(base+'/config/opencode',{recursive:true});
  for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync(dependencies+'/'+n,base+'/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});
  fs.copyFileSync(dependencies+'/rg',base+'/bin/rg');fs.chmodSync(base+'/bin/rg',0o755);
  const installed=Object.fromEntries(['native-task-workflow.mjs','native-task-plugin.mjs','native-task-observations.mjs'].map(n=>{
    const sha=hash(fs.readFileSync(bundle+'/'+n));assert.equal(sha,hash(fs.readFileSync(root+'/lib/'+n)));return [n,sha];
  }));
  const workflowBytes=fs.readFileSync(bundle+'/native-task-workflow.mjs','utf8');
  const block=workflowBytes.match(/const directAssertionReview = `([\s\S]*?)`;/)[1];
  let step=0,parentSteps=0,requests=0,authorRequests=0,worktree,providerError;
  const requestEvidence=[];
  const bash=command=>({name:'bash',args:{command,workdir:'.',description:'Public contract check',timeout:90000}});
  const edit=(filePath,oldString,newString)=>({name:'edit',args:{filePath,oldString,newString}});
  const probe=`node -e ${JSON.stringify("require('node:assert/strict').equal(require('./index.cjs').normalize('  AbC  '), 'abc')")}`;
  const sequence=[
    {name:'read',args:{filePath:'mixed.test.cjs'}},
    edit('index.cjs',original,changed),
    bash('node --test'),
    ...(replaced?[
      edit('index.cjs',changed,gated),
      bash('git diff -- index.cjs mixed.test.cjs'),
      bash(probe),
      edit('index.cjs',gated,changed),
      edit('mixed.test.cjs',oldAssertion,newAssertion),
      {name:'write',args:{filePath:'policy.test.cjs',content:regression}},
      bash('node --test policy.test.cjs'),
      bash('node --test mixed.test.cjs'),
    ]:[bash('git diff -- index.cjs mixed.test.cjs'),edit('index.cjs',changed,original)]),
    bash('node --test'),
  ];
  const respond=(res,call,content='')=>{
    const delta=call?{role:'assistant',...(content?{content}:{}),tool_calls:[{index:0,id:'fixture-'+requests,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}:{role:'assistant',content};
    const b={id:'r'+requests,object:'chat.completion.chunk',created:1,model:'fixture'};
    res.writeHead(200,{'content-type':'text/event-stream'});res.end(`data: ${JSON.stringify({...b,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...b,choices:[{index:0,delta:{},finish_reason:call?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`);
  };
  const provider=http.createServer(async(req,res)=>{try {
    assert.equal(req.url,'/v1/chat/completions');const chunks=[];for await(const c of req)chunks.push(c);
    const bytes=Buffer.concat(chunks),body=JSON.parse(bytes);requests++;write(privateDir+'/'+mode+'-request-'+requests+'.json',bytes);
    if(!body.tools?.length){respond(res,null,'Fixture title');return;}
    const user=body.messages.findLast(m=>m.role==='user'),text=typeof user?.content==='string'?user.content:JSON.stringify(user?.content);
    if(!text.includes('Implement the complete original task')){respond(res,parentSteps++===0?{name:'harness_task',args:{}}:null,'Report actual workflow status.');return;}
    authorRequests++;assert.ok(text.includes(taskText),'Full task missing');assert.ok(text.includes(block),'Complete direct instruction missing from real request');
    const last=JSON.stringify(body.messages.findLast(m=>m.role==='tool'))??'';
    if(step===3){assert.match(last,/ERR_ASSERTION|AssertionError/);assert.match(last,/abc/);assert.match(last,/AbC/);}
    if(replaced&&step===5){assert.match(last,/options.fold/);assert.match(last,/value.trim/);}
    if(replaced&&step===6){assert.match(last,/ERR_ASSERTION|AssertionError/);assert.match(last,/AbC/);}
    requestEvidence.push({request:requests,authorStep:step,sha256:hash(bytes),fullTask:true,fullInstruction:true,lastToolSha256:hash(last),oldFailureReceived:step===3,gateDiffReceived:replaced&&step===5,ungatedCallerFailureReceived:replaced&&step===6});
    if(!worktree){const dirs=fs.readdirSync(project+'/.git/harness-task');assert.equal(dirs.length,1);worktree=project+'/.git/harness-task/'+dirs[0]+'/worktree';}
    const call=sequence[step];
    if(!call){assert.match(last,/(?:#|ℹ) fail 0/);step++;respond(res,null,replaced?'The task explicitly replaces case preservation. The one-argument call returned AbC under the unjustified gate and now returns abc. Only that mixed expectation changed; validation and boundary assertions remain. Final node --test passed.':'Case preservation remains required. Repaired production and preserved the complete mixed test. Final node --test passed.');return;}
    assert.ok(body.tools.some(t=>t.function?.name===call.name));
    const rationale=replaced&&step===5?'The actual diff adds an optional gate absent from the task and existing caller. Check the same one-argument input against the required lowercase result.':replaced&&step===6?'The public check failed under the gate. The task explicitly replaces case preservation; remove the gate and change only that expectation.':!replaced&&step===4?'The requirement preserves case. The failing assertion is valid, so repair production and keep every assertion.':'';
    step++;respond(res,call,rationale);
  }catch(e){providerError=e;console.error(e.stack);respond(res,null,'Scripted fixture stopped after assertion failure.');}});
  await listen(provider);
  const config={model:'local-fixture/fixture',small_model:'local-fixture/fixture',provider:{'local-fixture':{npm:'@ai-sdk/openai-compatible',name:'Local scripted author',options:{baseURL:`http://127.0.0.1:${provider.address().port}/v1`,apiKey:'not-a-credential'},models:{fixture:{name:'fixture',limit:{context:200000,output:10000}}}}}};
  const env={PATH:base+'/bin:/usr/local/bin:/usr/bin:/bin',SHELL:'/bin/bash',HOME:base+'/home',TMPDIR:base+'/tmp',...Object.fromEntries(['config','cache','state'].map(n=>['XDG_'+n.toUpperCase()+'_HOME',base+'/'+n])),XDG_DATA_HOME:'/work/data',OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_CONFIG_DIR:bundle,OPENCODE_CONFIG_CONTENT:JSON.stringify(config),HARNESS_TASK_FILE:taskFile,HARNESS_TASK_TIMEOUT_MS:'240000',HARNESS_TASK_STRATEGY:'direct',...Object.fromEntries(['PRESERVATION_NUDGE','TYPE_COMPAT','COMMAND_HINTS','CONTEXT','CHECKS','SENSITIVITY','INVESTIGATION','EXTRA_ATTENTION'].map(n=>['HARNESS_TASK_'+n,'0']))};
  assert.equal(run('/opt/opencode',['--version'],project,env),'1.18.26');
  const portServer=http.createServer();await listen(portServer);const port=portServer.address().port;await new Promise(r=>portServer.close(r));
  const server=spawn('/opt/opencode',['serve','--hostname','127.0.0.1','--port',String(port)],{cwd:project,env,stdio:['ignore','pipe','pipe']});let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);
  const closed=new Promise(r=>server.once('close',r));
  const api=async(method,p,body)=>{const r=await fetch(`http://127.0.0.1:${port}${p}`,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(p==='/global/health'?1500:270000)});assert.ok(r.ok,await r.clone().text());return r.json();};
  try {
    let ready=false;for(let n=0;n<200;n++){try{await api('GET','/global/health');ready=true;break;}catch{await wait(100);}}assert.ok(ready,log);
    const session=await api('POST','/session',{});await api('POST',`/session/${session.id}/command`,{command:'harness-task',arguments:'',agent:'build',model:'local-fixture/fixture'});if(providerError)throw providerError;
    assert.equal(step,sequence.length+1);assert.equal(parentSteps,2);
    const artifacts=path.dirname(worktree),report=JSON.parse(fs.readFileSync(artifacts+'/result.json')),events=JSON.parse(fs.readFileSync(artifacts+'/tool-events.json'));
    assert.equal(report.termination.verified,true);assert.ok(!fs.existsSync(artifacts+'/terminal-reason.json'));
    assert.deepEqual(report.stages.map(s=>[s.role,s.label]),[['author','implementation']]);assert.equal(report.repairs,0);
    assert.ok(!fs.existsSync(artifacts+'/preservation-nudge.json'));
    assert.equal(git('diff','HEAD'),originalDiff);assert.equal(git('status','--porcelain'),originalStatus);assert.equal(hash(fs.readFileSync(project+'/.git/index')),originalIndex);
    assert.equal(fs.readFileSync(project+'/notes.txt','utf8'),'untracked user note\n');
    const checks=events.filter(e=>e.tool==='bash').map(e=>({command:e.args.command,exit:e.exit,durationMs:e.completedAt-e.startedAt}));
    assert.deepEqual(checks.map(c=>c.exit),replaced?[1,0,1,0,0,0]:[1,0,0]);
    const patch=fs.readFileSync(artifacts+'/terminal.patch','utf8');assert.ok(!patch.includes('/work/')&&!patch.includes('/repo/')&&!patch.includes('.git/harness-task'));
    const clone=base+'/portable';run('git',['clone','--quiet','--no-hardlinks',project,clone],base);run('git',['apply',artifacts+'/terminal.patch'],clone);
    assert.equal(fs.readFileSync(clone+'/index.cjs','utf8'),replaced?changed:original);
    assert.equal(fs.readFileSync(clone+'/mixed.test.cjs','utf8'),replaced?mixed.replace(oldAssertion,newAssertion):mixed);
    if(replaced)assert.equal(fs.readFileSync(clone+'/policy.test.cjs','utf8'),regression);
    const inventory=dir=>fs.readdirSync(dir).filter(n=>n!=='.git').sort().map(n=>({path:n,sha256:hash(fs.readFileSync(dir+'/'+n)),mode:fs.statSync(dir+'/'+n).mode&0o777}));
    assert.deepEqual(inventory(clone),inventory(worktree));assert.equal(fs.statSync(clone+'/check.sh').mode&0o777,0o755);
    assert.deepEqual(fs.readdirSync(clone).filter(n=>n!=='.git').sort(),['check.sh','draft.txt','index.cjs','mixed.test.cjs','notes.txt','opencode.json','package.json',...(replaced?['policy.test.cjs']:[])].sort());
    const portable=run('node',['--test'],clone,env), independent=run('node',['-e',acceptanceSource(replaced)],clone,env);
    write(privateDir+'/'+mode+'-portable.txt',portable+'\n'+independent+'\n');
    write(privateDir+'/'+mode+'-terminal.patch',patch);json(privateDir+'/'+mode+'-events.json',events);json(privateDir+'/'+mode+'-result.json',report);
    results.push({mode,installed,requests,authorRequests,requestEvidence,instruction:{words:block.split(/\s+/).length,bytes:Buffer.byteLength(block),sha256:hash(block)},status:report.status,remaining:report.remaining,limits:report.limits,stages:report.stages,repairs:report.repairs,termination:report.termination,checks,portable:{exit:0,independentExit:0,patchSha256:hash(patch),inventory:inventory(clone)},originalCheckoutAndIndexUnchanged:true});
  } finally {
    server.kill('SIGTERM');await closed;await new Promise(r=>provider.close(r));write(privateDir+'/'+mode+'-server.log',log);
  }
  results.at(-1).durationMs=Date.now()-started;results.at(-1).serverTerminated=true;
  console.log(JSON.stringify({completed:mode,status:results.at(-1).status}));
  fs.rmSync(base,{recursive:true,force:true});
}
const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});
const tools=db.prepare("SELECT session_id, id, data FROM part WHERE json_extract(data,'$.type')='tool'").all().map(r=>({...r,data:JSON.parse(r.data)}));
const authorSessions=db.prepare("SELECT id, title FROM session WHERE title='Harness task: author'").all();db.close();
assert.equal(authorSessions.length,2);json(privateDir+'/native-evidence.json',{tools});
console.log(JSON.stringify({installed:'1.18.26',network:'none; loopback scripted provider',realProviderCalls:0,scriptedAuthor:true,authorSessions:authorSessions.length,results}));
