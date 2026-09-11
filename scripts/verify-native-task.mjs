import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import nativeTaskPlugin from '../lib/native-task-plugin.mjs';
import {prepareObservations,commandWords} from '../lib/native-task-observations.mjs';
import {runWorkflow,nativePermissionDenial,nativePermissionKind,stateTransition} from '../lib/native-task-workflow.mjs';
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
 // Admission is per workflow/call, not global error text. These hook cases use
 // real worktrees and commands; installed fixtures below own native provenance.
 {
  const dir=path.join(temp,'continuation-cases');fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test'}}));
  fs.writeFileSync(path.join(dir,'value.test.mjs'),"import {test} from 'node:test';import assert from 'node:assert/strict';test('kept',()=>assert.equal(1,1));\n");
  const taskFile=path.join(dir,'TASK.md');fs.writeFileSync(taskFile,'Preserve the project and run `node --test`.');
  run(dir,['init','-q']);run(dir,['add','.']);run(dir,['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base']);
  const automatic='The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules '+JSON.stringify([{permission:'*',pattern:'*',action:'allow'},{permission:'external_directory',pattern:'*',action:'deny'}]);
  assert.equal(nativePermissionKind(automatic),'automatic');
  for(const text of ['permission denied','File not found: '+automatic,automatic+' trailing',automatic.replace('"deny"','"bogus"')])assert.equal(nativePermissionKind(text),'unknown');
  async function scenario(name,mode,barrier=async()=>{}) {
   const parent='continuation-parent-'+name,childID='continuation-child-'+name,controller=new AbortController();
   let hooks,worktree,abortCalls=0,promptCalls=0;const parts=new Map();
   const input=(id,tool='bash')=>({sessionID:childID,callID:id,tool});
   const event=async(id,state,tool='bash')=>{
    const part={type:'tool',...input(id,tool),state};parts.set(id,part);
    await hooks.event({event:{type:'message.part.updated',properties:{part}}});
   };
   const error=(id='denied',text=automatic,tool='bash')=>event(id,{status:'error',input:{command:'node --test',workdir:'..'},error:text},tool);
   const reject=()=>hooks.event({event:{type:'permission.replied',properties:{sessionID:childID,requestID:'request',reply:'reject'}}});
   const execute=async(id,args)=>{
    await hooks['tool.execute.before'](input(id));await hooks['shell.env']({sessionID:childID,callID:id,cwd:worktree});
    const result=spawnSync(process.execPath,args,{cwd:worktree,encoding:'utf8'});
    await hooks['tool.execute.after']({...input(id),args:{command:'node '+args.join(' ')}},{output:result.stdout+result.stderr,metadata:{exit:result.status}});
   };
   const client={app:{agents:async()=>({data:[{name:'build',permission:[{permission:'*',pattern:'*',action:'allow'}]}]})},session:{
    get:async()=>({data:{permission:[]}}),create:async({query})=>{worktree=query.directory;return{data:{id:childID}};},
    abort:async()=>{abortCalls++;for(const [id,part] of parts)if(['pending','running'].includes(part.state.status))await event(id,{status:'error',input:{},error:'Cancelled'},part.tool);return{data:true};},
    messages:async()=>({data:[{parts:[...parts.values()]}]}),
    prompt:async()=>{
     promptCalls++;
     if(promptCalls>1){assert.ok(['missing-check','real-failure'].includes(mode));if(mode==='real-failure')await execute('check-'+promptCalls,['--test']);return{data:{info:{finish:'stop'},parts:[]}};}
     await barrier();
     if(mode==='no-denial'){await execute('check',['--test']);return{data:{info:{finish:'stop'},parts:[]}};}
     if(mode==='preserve-check')await execute('earlier-check',['--test']);
     if(mode!=='missing-before')await hooks['tool.execute.before'](input('denied',mode==='other-tool'?'read':'bash'));
     if(mode==='after-start'){
      await hooks['shell.env']({sessionID:childID,callID:'denied',cwd:worktree});
      const r=spawnSync(process.execPath,['-e',"require('fs').writeFileSync('executed.txt','ran')"],{cwd:worktree});assert.equal(r.status,0);
     }
     if(mode==='outside-change')fs.writeFileSync(path.join(worktree,'external.txt'),'user save');
     if(mode==='parallel-tool')await event('untracked',{status:'running',input:{}},'unknown');
     if(mode==='reject-before')await reject();
     if(mode==='cancel-before')controller.abort();
     await error('denied',mode==='unknown'?'Unknown native tool error':automatic,mode==='other-tool'?'read':'bash');
     if(mode==='duplicate')await error();
     if(mode==='reject-after')await reject();
     if(mode==='cancel-after')controller.abort();
     if(mode==='conflicting-tool')await error('denied',automatic,'read');
     if(mode==='conflicting-duplicate')await error('denied','Different native error');
     const admitted=['continued','duplicate','second-denial','preserve-check','missing-check','real-failure'].includes(mode);
     if(!admitted){await assert.rejects(hooks['chat.params']({sessionID:childID}));return{data:{info:{finish:'stop'},parts:[]}};}
     await hooks['chat.params']({sessionID:childID});
     const system={system:[]};await hooks['experimental.chat.system.transform']({sessionID:childID},system);
     assert.match(system.system.join('\n'),/Do not repeat the forbidden operation/);assert.ok(system.system[0].includes(worktree));
     if(mode==='second-denial'){
      await hooks['tool.execute.before'](input('second'));await error('second');
      await assert.rejects(hooks['chat.params']({sessionID:childID}));
     }else if(!['preserve-check','missing-check'].includes(mode)){
      if(mode==='real-failure'){
       await hooks['tool.execute.before'](input('edit','edit'));
       fs.writeFileSync(path.join(worktree,'value.test.mjs'),"import {test} from 'node:test';import assert from 'node:assert/strict';test('kept',()=>assert.equal(1,2));\n");
       await hooks['tool.execute.after']({...input('edit','edit'),args:{}},{output:'changed',metadata:{}});
      }
      await execute('check',['--test']);
     }
     return{data:{info:{finish:'stop'},parts:[]}};
    },
   }};
   hooks=await nativeTaskPlugin({client,directory:dir});
   const previous=process.env.HARNESS_TASK_FILE;process.env.HARNESS_TASK_FILE=taskFile;
   try{await hooks['command.execute.before']({command:'harness-task',arguments:'',sessionID:parent});}
   finally{if(previous===undefined)delete process.env.HARNESS_TASK_FILE;else process.env.HARNESS_TASK_FILE=previous;}
   try{
    await hooks['chat.message']({sessionID:parent},{message:{agent:'build',model:{providerID:'fixture',modelID:'fixture'}}});
    const result=JSON.parse(await hooks.tool.harness_task.execute({}, {sessionID:parent,abort:controller.signal,ask:async()=>{},metadata:async()=>{}}));
    const log=JSON.parse(fs.readFileSync(path.join(result.artifacts,'tool-events.json')));
    const passing=['continued','duplicate','preserve-check','no-denial'].includes(mode);
    assert.equal(result.status,passing?'checks_passed':mode.startsWith('cancel-')?'cancelled':'incomplete',name);
    const allowed=['continued','duplicate','second-denial','reject-after','cancel-after','conflicting-duplicate','conflicting-tool','preserve-check','missing-check','real-failure'].includes(mode);
    assert.equal(result.permissionContinuations.length,allowed?1:0,name);
    assert.equal(result.termination.verified,true,name);
    assert.equal(result.repairs,['missing-check','real-failure'].includes(mode)?2:0,name);
    if(passing||['missing-check','real-failure'].includes(mode))assert.equal(abortCalls,0,name);else assert.equal(abortCalls,1,name);
    if(mode==='second-denial')assert.equal(log.filter(e=>e.permissionDenied).length,2);
    if(mode==='duplicate')assert.equal(log.filter(e=>e.callID==='denied').length,1);
    if(mode==='after-start'){assert.equal(fs.readFileSync(path.join(worktree,'executed.txt'),'utf8'),'ran');assert.equal(log[0].execution,undefined);}
    if(mode==='outside-change'){assert.equal(result.terminalReason.kind,'scope_violation');assert.equal(fs.readFileSync(path.join(worktree,'external.txt'),'utf8'),'user save');}
    if(mode==='preserve-check'){assert.equal(result.observations.checks[0].current,true);assert.equal(result.observations.checks.length,1);assert.equal(result.permissionContinuations[0].continuedWith,undefined);}
    if(mode==='real-failure')assert.ok(result.observations.unresolvedFailures.some(e=>e.exit===1));
    if(result.observations)assert.ok(!result.observations.checks.some(e=>e.callID==='denied'));
    return result;
   }finally{await hooks.event({event:{type:'command.executed',properties:{name:'harness-task',sessionID:parent}}});}
  }
  for(const mode of ['continued','duplicate','second-denial','reject-before','reject-after','cancel-before','cancel-after','unknown','after-start','outside-change','parallel-tool','missing-before','other-tool','conflicting-duplicate','conflicting-tool','preserve-check','missing-check','real-failure','no-denial'])await scenario(mode,mode);
  // Both native workflows coexist before either emits its first denial; the
  // same callID in each must consume only that workflow's own allowance.
  let entered=0,release;const ready=new Promise(resolve=>{release=resolve;});
  const barrier=async()=>{if(++entered===2)release();await ready;};
  const concurrent=await Promise.all([scenario('concurrent-a','second-denial',barrier),scenario('concurrent-b','continued',barrier)]);
  assert.notEqual(concurrent[0].permissionContinuations[0].sessionID,concurrent[1].permissionContinuations[0].sessionID);
 }
 assert.equal(nativePermissionDenial('The user rejected permission to use this specific tool call.'),true);
 assert.equal(nativePermissionDenial('File not found: The user rejected permission to use this specific tool call.'),false);
 assert.equal(stateTransition({state:'error',before:null,after:'S',stateObservation:{basis:'host-rejected-before-execution',snapshot:'S'}}),'unchanged');
 for(const cmd of ['echo hi','node --test; echo ok','node --test $(whoami)','node --test `pwd`'])if(cmd!=='echo hi')assert.equal(commandWords(cmd),null);
 console.log(JSON.stringify({passed:true,realTemporaryFiles:true,nativeStateAndPermissions:true,threeCorrectionBound:true,realProviderRequests:0}));
} finally {fs.rmSync(temp,{recursive:true,force:true});}
