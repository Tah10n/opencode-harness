import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import nativeTaskPlugin from '../lib/native-task-plugin.mjs';
import {prepareObservations,commandWords} from '../lib/native-task-observations.mjs';
import {runWorkflow,nativePermissionDenial,stateTransition} from '../lib/native-task-workflow.mjs';
import {reviewContext} from '../lib/native-review-context.mjs';
import {materializeNativeTemplate} from '../lib/native-template.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-d-check-'));
const rules=[{permission:'read',pattern:'*',action:'allow'}];
const run=(cwd,args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
try {
 const bundle=path.join(temp,'bundle');materializeNativeTemplate({repositoryRoot:path.resolve('.'),outputDirectory:bundle,task:true,review:true});
 const config=JSON.parse(fs.readFileSync(path.join(bundle,'opencode.json')));
 assert.ok(config.command['harness-review']);assert.ok(config.command['harness-task']);assert.equal(config.agent['harness-task-reviewer'],undefined);
 for(const mode of ['correct','fail','stale','revert','unknown','echo','coverage','move','deny','cancel','unavailable']){
  const dir=path.join(temp,mode);fs.mkdirSync(dir);const artifacts=path.join(dir,'.artifacts');
  const original="import {test} from 'node:test';import assert from 'node:assert/strict';test('kept name',()=>{assert.equal(1,1);assert.equal(2,2);});\n";
  fs.writeFileSync(path.join(dir,'legacy.test.mjs'),original);fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test'}}));fs.writeFileSync(path.join(dir,'.gitignore'),'.artifacts\n');
  run(dir,['init','-q']);run(dir,['add','.']);run(dir,['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base']);fs.mkdirSync(artifacts);
  const observe=prepareObservations({directory:dir,artifacts,permissionRules:rules});let state='S',events=[],prompts=[],aborted=false;
  const capture=()=>({...reviewContext({cwd:dir,base:'HEAD',permissionRules:rules}),snapshotSha256:state,task:'Keep independent scenarios; replace only explicitly requested expectation.'});
  const check=()=>{const r=spawnSync(process.execPath,['--test'],{cwd:dir,encoding:'utf8'});events.push({tool:'bash',callID:'call-'+events.length,state:'completed',args:{command:'node --test'},exit:r.status,output:r.stdout+r.stderr,before:state,after:state});};
  const mutate=bytes=>{fs.writeFileSync(path.join(dir,'legacy.test.mjs'),bytes);const before=state;state+='T';events.push({tool:'write',state:'completed',before,after:state});};
  const io={capture,observe:s=>observe(events,s),save:(n,v)=>fs.writeFileSync(path.join(artifacts,n),typeof v==='string'?v:JSON.stringify(v)),aborted:()=>aborted,
   checkActive:()=>{if(aborted)throw Error('cancelled');if(events.some(e=>e.permissionDenied))throw Error('permission denied');},messages:async()=>[],
   prompt:async(role,prompt)=>{assert.equal(role,'author');prompts.push(prompt);
    if(prompts.length===1){
     if(mode==='fail')mutate(original.replace('1,1','1,2'));
     if(mode==='coverage')mutate(original.replace('assert.equal(2,2);',''));
     if(mode==='move'){fs.renameSync(path.join(dir,'legacy.test.mjs'),path.join(dir,'new.test.mjs'));events.push({tool:'bash',state:'completed',exit:0,args:{command:'mv legacy.test.mjs new.test.mjs'},before:state,after:'T'});state='T';}
     if(mode==='deny')events.push({permissionDenied:true});
     if(mode==='cancel')aborted=true;
     if(mode==='echo')events.push({tool:'bash',args:{command:'echo ok'},state:'completed',exit:0,before:state,after:state});
     else if(mode!=='unavailable')check();
     if(mode==='stale')mutate(original+'// edit\n');
     if(mode==='revert'){mutate(original+'// edit\n');mutate(original);state='S';}
     if(mode==='unknown')events.push({tool:'read',state:'error',before:null,after:state});
    }else {
     const feedback=JSON.parse(prompt);assert.ok(feedback.observations.reasons.length);assert.ok(feedback.originalTask);
     if(mode==='fail'){assert.equal(feedback.observations.latestChecks[0].exit,1);mutate(original);check();}
     if(mode==='coverage'){assert.ok(feedback.observations.testChanges[0].before.includes('2,2'));assert.ok(feedback.observations.checksCurrent);mutate(original);check();}
     if(mode==='move'){assert.equal(feedback.observations.testChanges[0].after,null);assert.equal(feedback.observations.addedTests[0].content,original);}
     if(['stale','revert','unknown'].includes(mode))check();
    }
    return {info:{finish:'stop',id:'message-'+prompts.length},parts:[{type:'text',text:'Ordinary prose; no JSON IDs'}]};
   }};
  const result=await runWorkflow(io);assert.ok(prompts.length<=4);
  assert.equal(result.repairs,['correct','coverage','move','deny','cancel'].includes(mode)?0:['echo','unavailable'].includes(mode)?2:1,mode);
  assert.equal(result.status,mode==='cancel'?'cancelled':['echo','unavailable','deny'].includes(mode)?'incomplete':'checks_passed',JSON.stringify(result));
 }
 // Independent review counterexamples: a new smoke is not the required route,
 // Node root names and pure additions still receive scenario assessment.
 for(const filename of ['test.js','test-legacy.js','legacy.test.mjs']) {
  const dir=path.join(temp,'counter-'+filename);fs.mkdirSync(dir);const artifacts=path.join(dir,'.artifacts');fs.mkdirSync(artifacts);
  const original="import {test} from 'node:test';import assert from 'node:assert/strict';\ntest('two independent scenarios',()=>{\nassert.equal(1,1);\nassert.equal(2,2);\n});\n";
  fs.writeFileSync(path.join(dir,filename),original);fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({type:'module',scripts:{test:'node --test '+filename}}));fs.writeFileSync(path.join(dir,'.gitignore'),'.artifacts\n');
  run(dir,['init','-q']);run(dir,['add','.']);
  const observe=prepareObservations({directory:dir,artifacts,permissionRules:rules});
  fs.writeFileSync(path.join(dir,'scratch.test.mjs'),"import {test} from 'node:test';test('smoke',()=>{});");
  const executed=command=>{const r=spawnSync(process.execPath,command.split(' ').slice(1),{cwd:dir,encoding:'utf8'});return{tool:'bash',state:'completed',args:{command},exit:r.status,output:r.stdout+r.stderr,before:'S',after:'S'};};
  assert.equal(observe([executed('node --test scratch.test.mjs')],{snapshotSha256:'S'}).checksCurrent,false);
  fs.writeFileSync(path.join(dir,filename),original.replace('assert.equal(2,2);','return;\nassert.equal(2,2);'));
  const facts=observe([executed('node --test '+filename)],{snapshotSha256:'S'});
  assert.equal(facts.checksCurrent,true);assert.ok(facts.testChanges.length);assert.equal(facts.testChanges[0].removedOrChangedLines,false);assert.equal(facts.reasons.length,0);assert.ok(facts.coverageWarnings.length);
 }
 // Real files, real commands, current snapshots: two independent defects.
 for (const mode of ['two-fixes','three-corrections','stuck','comment-only','diagnostic','unresolved','quota','uncertain']) {
  const dir=path.join(temp,'cycle-'+mode);fs.mkdirSync(dir);const artifacts=path.join(dir,'.artifacts');
  fs.writeFileSync(path.join(dir,'.gitignore'),'.artifacts\n');
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test'}}));
  const good='export const a=1; export const b=2;\n';
  fs.writeFileSync(path.join(dir,'value.mjs'),good);
  fs.writeFileSync(path.join(dir,'value.test.mjs'),"import {test} from 'node:test';import assert from 'node:assert/strict';import {a,b} from './value.mjs';test('first defect',()=>assert.equal(a,1));test('second defect',()=>assert.equal(b,2));\n");
  run(dir,['init','-q']);run(dir,['add','.']);run(dir,['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base']);fs.mkdirSync(artifacts);
  const task='Deliver a=1 and b=2 with independent regressions. Run `node --test`.';
  const observer=prepareObservations({directory:dir,artifacts,permissionRules:rules,task});
  const capture=()=>({...reviewContext({cwd:dir,base:'HEAD',permissionRules:rules}),task});
  const events=[],prompts=[];
  const mutate=bytes=>{const before=capture().snapshotSha256;fs.writeFileSync(path.join(dir,'value.mjs'),bytes);events.push({tool:'write',state:'completed',before,after:capture().snapshotSha256});};
  const check=(command='node --test',recorded=command)=>{const before=capture().snapshotSha256;const r=spawnSync(process.execPath,command.split(' ').slice(1),{cwd:dir,encoding:'utf8'});events.push({tool:'bash',callID:'call-'+events.length,state:'completed',args:{command:recorded},exit:r.status,output:r.stdout+r.stderr,before,after:capture().snapshotSha256});};
  const result=await runWorkflow({capture,observe:s=>observer(events,s),save:()=>{},messages:async()=>[],aborted:()=>false,checkActive:()=>{},
   prompt:async(role,prompt)=>{prompts.push(prompt);const pass=prompts.length-1;
    if(!pass){
     if(mode==='quota')return {info:{error:{name:'usage_limit_reached'}}};
     if(mode==='uncertain')return {info:{finish:'tool-calls'}};
     if(!['diagnostic','unresolved'].includes(mode))mutate('export const a=0; export const b=0;\n');
     if(mode==='unresolved'){mutate('export const a=0; export const b=2;\n');check('node --test value.test.mjs');observer(events,capture());check();}else check();
     if(mode==='diagnostic') {check('node --test --test-name-pattern=[ value.test.mjs');assert.equal(events.at(-1).exit,1);}
    } else {
     const feedback=JSON.parse(prompt);assert.equal(feedback.pass,pass);
     if(['two-fixes','three-corrections'].includes(mode)){
      const output=feedback.observations.latestChecks[0].output;
      if(pass<3)assert.match(output,/(?:not ok .*|✖ )second defect/);
      if(pass===2)assert.doesNotMatch(output,/(?:not ok .*|✖ )first defect/);
      if(pass<3)mutate(pass===1?'export const a=1; export const b=0;\n':good);if(mode!=='three-corrections'||pass!==2)check();
     }else if(mode==='comment-only'){mutate('export const a=0; export const b=0; // comment '+pass+'\n');check();}
     else if(mode==='stuck')check();
    }
    return {info:{finish:'stop'},parts:[{type:'text',text:'done '+pass}]};
   }});
  assert.equal(result.repairs,mode==='three-corrections'?3:mode==='two-fixes'?2:['stuck','comment-only','unresolved'].includes(mode)?2:0,JSON.stringify(result));
  assert.equal(result.status,['two-fixes','three-corrections'].includes(mode)?'checks_passed':'incomplete',JSON.stringify(result));
  if(['stuck','comment-only'].includes(mode))assert.match(result.stopReason,/Two consecutive/);
  if(mode==='diagnostic'){assert.equal(result.repairs,0);assert.equal(result.observations.unresolvedFailures.length,1);assert.equal(result.observations.latestChecks.at(-1).requirement,'diagnostic');assert.equal(result.observations.latestChecks.at(-1).successful,false);}
  if(mode==='unresolved')assert.ok(result.limits.some(x=>x.includes('unresolved task relevance')));
 }
 // Obligation provenance and exact Node command scope, using actual checks.
 for (const mode of ['variant','both-required','narrow','stale','diagnostic-failure','environment']) {
  const dir=path.join(temp,'obligation-'+mode);fs.mkdirSync(dir);const artifacts=path.join(dir,'.artifacts');
  fs.writeFileSync(path.join(dir,'.gitignore'),'.artifacts\n');
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test'}}));
  const good="import {test} from 'node:test';import assert from 'node:assert/strict';test('first',()=>assert.equal(1,1));test('second',()=>assert.equal(2,2));\n";
  fs.writeFileSync(path.join(dir,'value.test.mjs'),good);
  run(dir,['init','-q']);run(dir,['add','.']);run(dir,['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base']);fs.mkdirSync(artifacts);
  const plain='node --test value.test.mjs',variant='node --test --test-concurrency=1 value.test.mjs';
  const needed=mode==='environment'?'CHECK_MODE=required '+plain:mode==='diagnostic-failure'?'node --test --test-name-pattern=second value.test.mjs':plain;
  const task='Run `'+needed+'`.'+(mode==='both-required'?' Also run `'+variant+'`.':'');
  const observe=prepareObservations({directory:dir,artifacts,permissionRules:rules,task});
  const capture=()=>({...reviewContext({cwd:dir,base:'HEAD',permissionRules:rules}),task});
  const events=[];let prompts=0,first;
  const check=command=>{const before=capture().snapshotSha256;const argv=commandWords(command),env={...process.env};while(argv[0].includes('=')){const [k,...v]=argv.shift().split('=');env[k]=v.join('=');}const r=spawnSync(process.execPath,argv.slice(1),{cwd:dir,env,encoding:'utf8'});events.push({tool:'bash',state:'completed',args:{command},exit:r.status,output:r.stdout+r.stderr,before,after:capture().snapshotSha256});};
  const mutate=bytes=>{const before=capture().snapshotSha256;fs.writeFileSync(path.join(dir,'value.test.mjs'),bytes);events.push({tool:'write',state:'completed',before,after:capture().snapshotSha256});};
  const result=await runWorkflow({capture,observe:s=>{const facts=observe(events,s);first??=facts;return facts;},save:()=>{},messages:async()=>[],aborted:()=>false,checkActive:()=>{},prompt:async()=>{
   prompts++;
   if(prompts===1){
    if(['variant','both-required'].includes(mode)){check(variant);mutate(good+'// edit\n');check(plain);}
    if(mode==='narrow')check('node --test --test-name-pattern=first value.test.mjs');
    if(mode==='stale'){check(plain);mutate(good+'// edit\n');}
    if(mode==='environment')check(plain);
    if(mode==='diagnostic-failure'){mutate(good.replace('1,1','1,0'));check('node --test --test-name-pattern=first value.test.mjs');mutate(good.replace('1,1','1,0')+'// another edit\n');check(needed);}
   }else check(mode==='diagnostic-failure'?'node --test --test-name-pattern=first value.test.mjs':mode==='both-required'?variant:needed);
   return {info:{finish:'stop'},parts:[{type:'text',text:'actual tools recorded'}]};
  }});
  assert.equal(result.repairs,mode==='variant'?0:mode==='diagnostic-failure'?3:mode==='environment'?2:1,mode);
  assert.equal(result.status,['diagnostic-failure','environment'].includes(mode)?'incomplete':'checks_passed',mode);
  if(mode==='variant'){assert.equal(first.checks[0].requirement,'diagnostic');assert.equal(first.checks[0].current,false);assert.equal(first.checks[1].requirement,'required');}
  if(mode==='environment'){assert.ok(result.remaining.some(r=>r.includes('CHECK_MODE=required')));assert.ok(result.observations.checks.every(c=>!c.command.startsWith('CHECK_MODE=')));}
  if(mode==='both-required')assert.ok(first.latestChecks.every(c=>c.requirement==='required'));
  // Re-executing the stale failure gives current evidence once; two subsequent identical failures stop.
  if(mode==='diagnostic-failure'){assert.equal(result.observations.unresolvedFailures.length,4);assert.equal(result.remaining.length,1);assert.equal(result.observations.unresolvedFailures[0].current,false);assert.match(result.remaining.join(' '),/additional project check failure/);}
 }
 // Native hook races: primary denial survives abort, and terminal bytes seal
 // only after an actual in-flight process exits. No provider is involved here.
 for (const mode of ['denial-active','create-cancel','abort-unverified']) {
  const dir=path.join(temp,mode);fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir,'value.test.mjs'),"import {test} from 'node:test';test('real',()=>{});\n");
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test'}}));
  const taskFile=path.join(dir,'TASK.md');fs.writeFileSync(taskFile,'Run `node --test`.');
  run(dir,['init','-q']);run(dir,['add','.']);run(dir,['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base']);
  const previous={file:process.env.HARNESS_TASK_FILE,timeout:process.env.HARNESS_TASK_TIMEOUT_MS};
  process.env.HARNESS_TASK_FILE=taskFile;process.env.HARNESS_TASK_TIMEOUT_MS='20000';
  const parent='parent-'+mode,childID='child-'+mode,abort=new AbortController();
  let hooks,worktree,worker,settlePrompt,abortCalls=0,promptCalls=0,nativeParts=[];
  const denied={type:'message.part.updated',properties:{part:{type:'tool',sessionID:childID,callID:'denied',tool:'read',state:{status:'error',input:{filePath:'/forbidden'},error:'The user rejected permission to use this specific tool call.'}}}};
  const client={app:{agents:async()=>({data:[{name:'build',permission:[{permission:'*',pattern:'*',action:'allow'}]}]})},session:{
   get:async()=>({data:{permission:[]}}),
   create:async({query})=>{worktree=query.directory;if(mode==='create-cancel')abort.abort();return {data:{id:childID}};},
   abort:async()=>{abortCalls++;if(mode==='abort-unverified'){settlePrompt({error:{name:'AbortError'}});throw Error('Scripted abort acknowledgement unavailable');}if(worker){worker.kill('SIGTERM');await new Promise(resolve=>worker.once('exit',resolve));
    nativeParts=[{type:'tool',state:{status:'error'}}];
    await hooks.event({event:{type:'message.part.updated',properties:{part:{type:'tool',sessionID:childID,callID:'active',tool:'bash',state:{status:'error',input:{command:'node delayed-write'},error:'AbortError'}}}}});
    settlePrompt({error:{name:'AbortError'}});
   }return {data:true};},
   messages:async()=>({data:[{parts:nativeParts}]}),
   prompt:async()=>{promptCalls++;return new Promise((resolve,reject)=>{settlePrompt=resolve;(async()=>{
    await hooks['tool.execute.before']({sessionID:childID,tool:'bash',callID:'active'});
    worker=spawn(process.execPath,['-e',"setTimeout(()=>require('fs').writeFileSync('late.txt','bad'),500);setInterval(()=>{},1000)"],{cwd:worktree,stdio:'ignore'});
    await new Promise(resolve=>worker.once('spawn',resolve));nativeParts=[{type:'tool',state:{status:'running'}}];
    await hooks.event({event:denied});await hooks.event({event:denied});
    await assert.rejects(hooks['chat.params']({sessionID:childID}),/Native permission boundary/);
   })().catch(reject);});},
  }};
  try {
   hooks=await nativeTaskPlugin({client,directory:dir});
   await hooks['command.execute.before']({command:'harness-task',arguments:'',sessionID:parent});
   await hooks['chat.message']({sessionID:parent},{message:{model:{providerID:'fixture',modelID:'fixture'},agent:'build'}});
   const report=JSON.parse(await hooks.tool.harness_task.execute({}, {sessionID:parent,abort:abort.signal,ask:async()=>{},metadata:async()=>{}}));
   assert.equal(abortCalls,1);assert.equal(report.repairs,0);assert.equal(report.termination.verified,mode!=='abort-unverified');
   assert.equal(promptCalls,mode==='create-cancel'?0:1);
   assert.equal(report.status,mode==='create-cancel'?'cancelled':'incomplete');
   if(mode==='abort-unverified'){assert.equal(fs.existsSync(path.join(report.artifacts,'terminal.patch')),false);assert.equal(report.terminalReason.kind,'permission_denied');process.kill(worker.pid,0);}
   if(mode==='denial-active'){
    assert.equal(report.terminalReason.kind,'permission_denied');assert.equal(report.terminalReason.facts.callID,'denied');
    assert.throws(()=>process.kill(worker.pid,0),e=>e.code==='ESRCH');
    const names=['terminal.patch','terminal.json','result.json','terminal-reason.json','tool-events.json'];
    const saved=names.map(n=>fs.readFileSync(path.join(report.artifacts,n),'utf8'));
    await hooks.event({event:{...denied,properties:{part:{...denied.properties.part,state:{...denied.properties.part.state,error:'late failure'}}}}});
    await hooks['tool.execute.after']({sessionID:childID,callID:'active'}, {output:'late output',metadata:{exit:0}});
    await new Promise(resolve=>setTimeout(resolve,550));assert.equal(fs.existsSync(path.join(worktree,'late.txt')),false);
    assert.deepEqual(names.map(n=>fs.readFileSync(path.join(report.artifacts,n),'utf8')),saved);
   }
   await hooks.event({event:{type:'command.executed',properties:{name:'harness-task',sessionID:parent}}});
  } finally {
   if(worker&&worker.exitCode===null&&worker.signalCode===null){worker.kill('SIGKILL');await new Promise(resolve=>worker.once('exit',resolve));}
   for(const [key,value] of [['HARNESS_TASK_FILE',previous.file],['HARNESS_TASK_TIMEOUT_MS',previous.timeout]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
 {let captured=0;const report=await runWorkflow({checkActive:()=>{},save:()=>{},aborted:()=>false,messages:async()=>[],prompt:async()=>({info:{finish:'stop'},parts:[]}),capture:()=>({status:'captured',snapshotSha256:++captured<3?'checked':'changed',diff:'',task:'task'}),observe:()=>({reasons:[],limits:[],testChanges:[],checksCurrent:true})});assert.equal(report.status,'incomplete');assert.ok(report.limits.some(l=>l.includes('Final snapshot changed')));}
 assert.equal(nativePermissionDenial('The user rejected permission to use this specific tool call.'),true);
 assert.equal(nativePermissionDenial('File not found: The user rejected permission to use this specific tool call.'),false);
 assert.equal(stateTransition({state:'error',before:null,after:'S',stateObservation:{basis:'host-rejected-before-execution',snapshot:'S'}}),'unchanged');
 for(const cmd of ['echo hi','node --test; echo ok','node --test $(whoami)','node --test `pwd`'])if(cmd!=='echo hi')assert.equal(commandWords(cmd),null);
 console.log(JSON.stringify({passed:true,realTemporaryFiles:true,nativeStateAndPermissions:true,threeCorrectionBound:true,realProviderRequests:0}));
} finally {fs.rmSync(temp,{recursive:true,force:true});}
