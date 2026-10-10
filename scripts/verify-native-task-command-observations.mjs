// Real local command executions; synthetic lifecycle controls use the same log.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess, {spawnSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {prepareObservations} from '../lib/native-task-observations.mjs';
import {compactTaskResult,taskResultText} from '../lib/native-task-plugin.mjs';
import {finalChecks,runWorkflow} from '../lib/native-task-workflow.mjs';
import {reviewContext} from '../lib/native-review-context.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-command-observations-'));
const rules=[{permission:'read',pattern:'*',action:'allow'}];
const scenarios=['compound','signal','timeout','nonzero','stale','revert','other-cwd','script-change','npmrc-change','hooks','partial','absent','supported','zero','denied','unfinished','environment','shell-chain','previous-failure','ava','mocha','tsd','lint'];
const workflowScenarios=['unparsed','partial-output','unparsed-failure','zero','failure','mixed','missing','stale','stale-diagnostic','other-command','whitespace-only','nonzero','signal','timeout','unknown','unfinished','permission','cancel','deadline','boundary','comment-only'];
try {
 // Actual Node output goes through the production observer, not a parser copy.
 const nodeProjects=(mode,body,task='Run `npm test`.',cwdControl=false)=>{
  const dir=path.join(temp,'node-evidence-'+mode);fs.mkdirSync(dir);
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
  const good="import {test,describe} from 'node:test';import assert from 'node:assert/strict';\n";
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test'}}));
  if(body!==null)fs.writeFileSync(path.join(dir,'value.test.mjs'),good+body+'\n');
  if(cwdControl){
   fs.mkdirSync(path.join(dir,'sub'));fs.writeFileSync(path.join(dir,'sub/package.json'),JSON.stringify({scripts:{test:'node --test public.spec.mjs'}}));
   // Explicit cwd control is not discovered by the root's automatic test run.
   fs.writeFileSync(path.join(dir,'sub/public.spec.mjs'),good+"test('cwd control',()=>{});\n");
  }
  git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base');
  const artifacts=path.join(dir,'.git/observations');fs.mkdirSync(artifacts);
  const observer=prepareObservations({directory:dir,artifacts,permissionRules:rules,task});
  const capture=()=>({...reviewContext({cwd:dir,base:'HEAD',permissionRules:rules}),task});
  const events=[];
  const execute=(command='npm test',workdir='.')=>{
   const before=capture().snapshotSha256,r=spawnSync('/bin/sh',['-c',command],{cwd:path.join(dir,workdir),encoding:'utf8',timeout:20000});
   const e={tool:'bash',callID:'call-'+events.length,args:{command,workdir},state:'completed',exit:r.status,signal:r.signal,output:r.stdout+r.stderr,before,after:capture().snapshotSha256};events.push(e);return e;
  };
  const mutate=body=>{const before=capture().snapshotSha256;fs.writeFileSync(path.join(dir,'value.test.mjs'),good+body+'\n');events.push({tool:'write',state:'completed',before,after:capture().snapshotSha256});};
  return {dir,artifacts,events,capture,execute,mutate,observe:()=>observer(events,capture())};
 };
 const bodies={skip:"test.skip('public',()=>{});",todo:"test.todo('public',()=>{});",'todo-failure':"test.todo('public',()=>{throw Error('expected TODO')});",pass:"test('public',()=>{});",mixed:"test('public',()=>{});test.skip('skip',()=>{});test.todo('todo',()=>{throw Error('expected TODO')});",nested:"describe('outer',()=>{test('public',()=>{});test.skip('skip',()=>{});describe('inner',()=>{test('nested',()=>{});test.todo('todo',()=>{})});});",'suite-skip':"describe.skip('skipped suite',()=>{test('public',()=>{})});",'suite-todo':"describe.todo('todo suite',()=>{test('public',()=>{})});",zero:null};
 const runnerResults=[];
 for(const reporter of ['tap','spec'])for(const [mode,body] of Object.entries(bodies)){
  const f=nodeProjects(reporter+'-'+mode,body,'Run `node --test --test-reporter='+reporter+'`.');
  const e=f.execute('node --test --test-reporter='+reporter),facts=f.observe(),check=facts.checks[0];
  runnerResults.push({reporter,mode,node:process.version,exit:e.exit,execution:check.execution,tests:check.tests,testSummary:check.testSummary,successful:check.successful,checksCurrent:facts.checksCurrent,output:e.output});
 }
 console.log(JSON.stringify({nodeRunnerReproduction:runnerResults}));
 for(const r of runnerResults){
  assert.equal(r.exit,0);assert.equal(r.execution.status,'completed_exit_0');assert.equal(r.execution.successful,true);
  assert.equal(r.successful,['pass','mixed','nested'].includes(r.mode),r.reporter+' '+r.mode+' must require passed tests');
  assert.equal(r.checksCurrent,r.successful,r.reporter+' '+r.mode);
  if(['mixed','nested'].includes(r.mode)){assert.equal(r.testSummary.skipped,1);assert.equal(r.testSummary.todo,1);}
 }
 // Malformations below are explicit corruptions of actual passing TAP/spec.
 for(const reporter of ['tap','spec']){
  const f=nodeProjects('summary-'+reporter,bodies.pass,'Run `node --test --test-reporter='+reporter+'`.');
  const e=f.execute('node --test --test-reporter='+reporter),output=e.output,prefix=reporter==='tap'?'# ':'ℹ ';
  const sum=Number(f.observe().checks[0].tests);
  const corruptions={missing:output.replace(new RegExp('^'+prefix+'fail .*\\n','m'),''),duplicate:output+prefix+'pass '+sum+'\n',malformedDuplicate:output+prefix+'pass unsupported\n',contradictory:output.replace(prefix+'tests '+sum,prefix+'tests '+(sum+1)),negative:output.replace(prefix+'pass '+sum,prefix+'pass -1'),unsafe:output.replace(prefix+'tests '+sum,prefix+'tests 9007199254740993'),mixedReporter:output.replace(prefix+'pass ',(reporter==='tap'?'ℹ ':'# ')+'pass '),cancelled:output.replace(prefix+'pass '+sum,prefix+'pass '+(sum-1)).replace(prefix+'cancelled 0',prefix+'cancelled 1')};
  for(const [name,bytes] of Object.entries(corruptions)){
   e.output=bytes;const facts=f.observe();assert.equal(facts.checks[0].successful,false,reporter+' '+name);assert.equal(facts.checksCurrent,false);
   if(name!=='cancelled')assert.equal(facts.checks[0].interpretation.status,'unparsed',reporter+' '+name);
  }
  e.output=output;
  for(const [field,value] of [['signal','SIGTERM'],['timeout',true],['exit',null],['state','running']]){
   const original=e[field];e[field]=value;assert.equal(f.observe().checks[0].successful,false,field);e[field]=original;
  }
 }
 for(const mode of ['required-skip','required-todo','required-stuck','optional-skip','optional-todo','required-with-green','failure-skip','failure-pass','diagnostic-failure-skip','other-command','other-filter','other-cwd','other-env','stale']){
  const optional=mode.startsWith('optional'),noPass=mode==='required-todo'||mode==='optional-todo'?bodies.todo:bodies.skip;
  const initialBody=mode==='optional-todo'?bodies.pass+bodies.todo.replace("'public'","'publicTodo'"):mode==='optional-skip'?bodies.pass+bodies.skip.replace("'public'","'publicSkip'"):bodies.pass;
  const f=nodeProjects('workflow-'+mode,initialBody,optional?'Run `node --test value.test.mjs`.':mode==='diagnostic-failure-skip'?'Run `node --test sub/public.spec.mjs`.':'Run `npm test`.',['other-cwd','required-with-green','diagnostic-failure-skip'].includes(mode));
  let first;const prompts=[];
  const report=await runWorkflow({capture:f.capture,observe:()=>{const facts=f.observe();first??=facts;return facts;},save:()=>{},messages:async()=>[],aborted:()=>false,checkActive:()=>{},prompt:async(role,prompt)=>{
   prompts.push(prompt);
   if(prompts.length===1){
    if(['required-skip','required-todo','required-stuck','required-with-green','failure-skip','failure-pass','diagnostic-failure-skip'].includes(mode)){
     if(mode.startsWith('failure')||mode==='diagnostic-failure-skip'){f.mutate("test('public',()=>assert.fail('real failure')); ");f.execute();}
     f.mutate(mode.startsWith('failure')?bodies.skip:noPass);f.execute();
     if(mode==='failure-pass'){f.mutate(bodies.pass);f.execute();}
     if(['required-with-green','diagnostic-failure-skip'].includes(mode))f.execute('node --test sub/public.spec.mjs');
    }else if(optional){f.execute('node --test value.test.mjs');f.execute('node --test --test-name-pattern='+ (mode==='optional-todo'?'publicTodo':'publicSkip')+' value.test.mjs');}
    else if(mode.startsWith('other-')){
     f.mutate("test('public',()=>assert.fail('real failure')); ");f.execute();
     f.mutate(bodies.pass);
     f.execute({'other-command':'node --test value.test.mjs','other-filter':'node --test --test-name-pattern=public value.test.mjs','other-cwd':'npm test','other-env':'CHECK_MODE=1 npm test'}[mode],mode==='other-cwd'?'sub':'.');
    }else{f.execute();f.mutate(bodies.pass+'// after PASS');}
   }else{
    const feedback=JSON.parse(prompt);assert.ok(feedback.observations.correctionReasons.length);
    if(['required-skip','required-todo','required-with-green','failure-skip'].includes(mode)){
     const check=feedback.observations.checks.findLast(c=>c.command==='npm test');
     assert.equal(check.execution.successful,true);assert.equal(check.testSummary.pass,0);assert.equal(check.successful,false);assert.equal(feedback.observations.checksCurrent,false);
     assert.ok(feedback.observations.correctionReasons.some(r=>r.includes('No passed tests')));
    }
    if(mode==='required-stuck')f.execute();
    else{f.mutate(bodies.pass);f.execute();if(mode==='diagnostic-failure-skip')f.execute('node --test sub/public.spec.mjs');}
   }
   return {info:{finish:'stop'},parts:[{type:'text',text:'Actual fixture events retained'}]};
  }});
  const noCorrection=optional||mode==='failure-pass';
  assert.equal(report.repairs,noCorrection?0:mode==='required-stuck'?2:1,mode);assert.equal(report.status,['required-stuck','other-env'].includes(mode)?'incomplete':'checks_passed',mode);assert.equal(report.observations.checksCurrent,mode!=='required-stuck',mode);
  if(mode==='required-stuck'){assert.match(report.stopReason,/Two consecutive/);assert.ok(report.remaining.some(r=>r.includes('No passed tests')));}
  assert.deepEqual(report.observations.unresolvedFailures,[],mode);
  if(optional){assert.deepEqual(first.correctionReasons,[]);assert.deepEqual(first.unresolvedFailures,[]);assert.equal(first.latestChecks.at(-1).successful,false);assert.equal(first.latestChecks.at(-1).testSummary.pass,0);assert.equal(first.checksCurrent,true);}
  if(['failure-skip','diagnostic-failure-skip'].includes(mode)||mode.startsWith('other-'))assert.ok(first.unresolvedFailures.some(c=>c.command==='npm test'&&c.exit===1),mode);
  if(mode==='stale')assert.equal(first.checks[0].current,false);
  const compact=compactTaskResult({observations:first,remaining:first.reasons,limits:first.limits},{artifacts:f.artifacts});
  assert.deepEqual(compact.observations.checks.map(c=>[c.execution,c.successful,c.testSummary]),first.checks.map(c=>[c.execution,c.successful,c.testSummary]));
  if(['required-skip','required-todo','required-with-green','failure-skip'].includes(mode))assert.match(taskResultText({observations:first},{artifacts:f.artifacts}),/No passed tests/);
  console.log(JSON.stringify({nodeEvidenceWorkflow:mode,repairs:report.repairs,status:report.status,firstChecksCurrent:first.checksCurrent,firstUnresolvedFailures:first.unresolvedFailures.length}));
 }
 // An executed required command needs no rerun solely for an absent adapter.
 // Build observations from real commands/snapshots and count actual author IO.
 {
  const dir=path.join(temp,'workflow-unsupported');fs.mkdirSync(dir);
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
  git('init','-q');
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test && node --version'}}));
  fs.writeFileSync(path.join(dir,'value.test.mjs'),"import {test} from 'node:test';test('public result',()=>{});\n");
  git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base');
  const artifacts=path.join(dir,'.git/observations');fs.mkdirSync(artifacts);
  const task='Run `npm test`.',observe=prepareObservations({directory:dir,artifacts,permissionRules:rules,task});
  const capture=()=>({...reviewContext({cwd:dir,base:'HEAD',permissionRules:rules}),task});
  const events=[],prompts=[];
  const report=await runWorkflow({capture,observe:s=>observe(events,s),save:()=>{},messages:async()=>[],aborted:()=>false,checkActive:()=>{},
   prompt:async(role,prompt)=>{
    assert.equal(role,'author');prompts.push(prompt);
    if(prompts.length===1){
     const before=capture().snapshotSha256,r=spawnSync('npm',['test'],{cwd:dir,encoding:'utf8'});
     assert.equal(r.status,0,r.stdout+r.stderr);
     events.push({tool:'bash',callID:'required',args:{command:'npm test'},state:'completed',exit:r.status,output:r.stdout+r.stderr,before,after:capture().snapshotSha256});
    }
    return {info:{finish:'stop'},parts:[{type:'text',text:'Executed the required command; runner results remain unverified.'}]};
   }});
  assert.equal(prompts.length-1,0,'Unsupported exit 0 must not cause a corrective author call');
  assert.equal(report.repairs,0);assert.equal(report.status,'incomplete');
  const check=report.observations.checks[0];
  assert.equal(check.execution.status,'completed_exit_0');assert.equal(check.current,true);
  assert.equal(check.interpretation.status,'unsupported');assert.equal(check.successful,false);
  assert.ok(report.remaining.length);assert.ok(report.limits.length);
  assert.match(report.stopReason,/No actionable/);assert.doesNotMatch(report.stopReason,/exhausted/);
  assert.deepEqual(report.observations.correctionReasons,[]);
  assert.match(taskResultText(report,{artifacts,executionDirectory:dir}),/Corrective passes: 0\. No actionable/);
  console.log(JSON.stringify({mode:'unsupported-current',repairs:report.repairs,status:report.status,stopReason:report.stopReason}));
 }
 for(const mode of workflowScenarios){
  const dir=path.join(temp,'workflow-'+mode);fs.mkdirSync(dir);
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
  git('init','-q');
  const unsupported=['missing','stale','nonzero','signal','timeout','unknown','unfinished','permission'].includes(mode);
  const script=unsupported?'node --test && node --version'+(mode==='nonzero'?' && node -e "process.exit(7)"':''):'node --test';
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:script,opaque:'node --version'}}));
  const good='export const value=1;\n',test="import {test} from 'node:test';import assert from 'node:assert/strict';import {value} from './value.mjs';test('public result',()=>assert.equal(value,1));\n";
  fs.writeFileSync(path.join(dir,'value.mjs'),good);
  if(mode!=='zero')fs.writeFileSync(path.join(dir,'value.test.mjs'),test);
  git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base');
  const artifacts=path.join(dir,'.git/observations');fs.mkdirSync(artifacts);
  const required=mode==='other-command'?'CHECK_MODE=required npm test':mode==='stale-diagnostic'?'npm run opaque':mode==='whitespace-only'?'git diff --check':'npm test';
  const task='Run `'+required+'`.'+(mode==='mixed'?' Also run `npm run opaque`.':'');
  const observe=prepareObservations({directory:dir,artifacts,permissionRules:rules,task});
  const capture=()=>({...reviewContext({cwd:dir,base:'HEAD',permissionRules:rules}),task});
  const events=[],prompts=[],feedback=[];let aborted=false,terminal,first;
  const mutate=(name,bytes)=>{const before=capture().snapshotSha256;fs.writeFileSync(path.join(dir,name),bytes);events.push({tool:'write',state:'completed',before,after:capture().snapshotSha256});};
  const execute=command=>{
   const before=capture().snapshotSha256,r=spawnSync('/bin/sh',['-c',command],{cwd:dir,encoding:'utf8',timeout:20000});
   const event={tool:'bash',callID:'call-'+events.length,args:{command},executionAdmitted:true,state:'completed',exit:r.status,signal:r.signal,output:r.stdout+r.stderr,before,after:capture().snapshotSha256};
   events.push(event);return event;
  };
  const lifecycle=event=>{
   if(mode==='signal')event.signal='SIGTERM';
   if(mode==='timeout')event.timeout=true;
   if(mode==='unknown')event.exit=null;
   if(mode==='unfinished'){event.state='running';delete event.exit;delete event.after;}
  };
  const report=await runWorkflow({capture,save:()=>{},messages:async()=>[],aborted:()=>aborted,terminalReason:()=>terminal,
   checkActive:()=>{if(terminal||aborted)throw Error(terminal?.message??(mode==='deadline'?'Task deadline exhausted':'cancelled'));},
   observe:s=>{if(mode==='unfinished')throw Error('Native processes have unresolved tool events');const facts=observe(events,s);first??=facts;return facts;},
   prompt:async(role,prompt)=>{
    assert.equal(role,'author');prompts.push(prompt);const pass=prompts.length-1;
    if(!pass){
     if(mode==='stale-diagnostic'){execute('npm test');mutate('value.mjs',good+'// changed after diagnostic\n');}
     if(['failure','mixed','unparsed-failure','comment-only','cancel','deadline','boundary'].includes(mode))mutate('value.mjs','export const value=0;\n');
     if(mode==='permission')events.push({tool:'bash',args:{command:required},state:'error',permissionDenied:true,executionAdmitted:false,before:capture().snapshotSha256,after:capture().snapshotSha256});
     else if(mode!=='missing'){
      const event=execute(mode==='other-command'?'node --test':required);lifecycle(event);
      if(mode==='unparsed')event.output='Output omitted by the native transport fixture';
      if(['partial-output','unparsed-failure'].includes(mode))event.output=event.output.replace(/^(?:# |ℹ )fail [\s\S]*$/m,'');
     }
     if(mode==='mixed')execute('npm run opaque');
     if(mode==='stale')mutate('value.mjs',good+'// after required command\n');
     if(mode==='permission'||mode==='boundary')terminal={kind:mode==='permission'?'permission_denied':'scope_violation',message:'Terminal '+mode+' fixture'};
     if(mode==='cancel'||mode==='deadline')aborted=true;
    }else{
     const facts=JSON.parse(prompt);feedback.push(facts);assert.equal(facts.pass,pass);assert.ok(facts.observations.correctionReasons.length);
     if(['failure','mixed','unparsed-failure'].includes(mode))mutate('value.mjs',good);
     if(mode==='zero')mutate('value.test.mjs',test);
     if(mode==='comment-only')mutate('value.mjs','export const value=0; // cosmetic '+pass+'\n');
     lifecycle(execute(mode==='whitespace-only'?'npm test':required));
     if(mode==='mixed')execute('npm run opaque');
    }
    return {info:{finish:'stop'},parts:[{type:'text',text:'Prose '+pass}]};
   }});
  const terminalMode=['unfinished','permission','cancel','deadline','boundary'].includes(mode);
  const noAction=['unparsed','partial-output','stale-diagnostic'].includes(mode);
  const stuck=['nonzero','signal','timeout','unknown','comment-only'].includes(mode);
  const corrections=terminalMode||noAction?0:stuck?2:1;
  assert.equal(prompts.length-1,corrections,mode);assert.equal(report.repairs,corrections,mode);
  assert.equal(feedback.length,corrections,mode);
  const passed=['zero','failure','whitespace-only'].includes(mode);
  assert.equal(report.status,passed?'checks_passed':['cancel','deadline'].includes(mode)?'cancelled':'incomplete',mode);
  if(stuck){assert.match(report.stopReason,/Two consecutive/);assert.ok(report.remaining.length);assert.ok(report.observations.unresolvedFailures.length);}
  else if(!terminalMode&&!passed){assert.match(report.stopReason,/No actionable/);assert.doesNotMatch(report.stopReason,/exhausted/);assert.ok(report.limits.length);assert.deepEqual(report.observations.correctionReasons,[]);}
  if(['unparsed','partial-output'].includes(mode)){
   const check=report.observations.checks[0];assert.equal(check.execution.successful,true);assert.equal(check.interpretation.status,'unparsed');assert.equal(check.successful,false);assert.equal(report.observations.checksCurrent,false);assert.ok(report.remaining.length);
   if(mode==='partial-output'){assert.equal(check.tests,1);assert.equal(check.testSummary.pass,1);assert.equal(check.testSummary.fail,undefined);}
  }
  if(mode==='mixed'){
   const facts=feedback[0].observations;assert.ok(facts.reasons.some(r=>r.includes('adapter sufficiency')));
   assert.ok(facts.correctionReasons.some(r=>r.includes('npm test')));assert.ok(!facts.correctionReasons.some(r=>r.includes('npm run opaque')));
   assert.ok(report.observations.latestChecks.every(c=>c.current));assert.ok(report.remaining.some(r=>r.includes('npm run opaque')));
   assert.equal(report.observations.latestChecks.find(c=>c.command==='npm test').successful,true);
   assert.equal(events.filter(e=>e.args?.command==='npm run opaque').length,2,'Required opaque command must run on the repaired snapshot');
  }
  if(mode==='stale-diagnostic'){assert.equal(first.latestChecks[0].current,false);assert.equal(first.latestChecks[0].successful,true);assert.equal(first.latestChecks[0].requirement,'diagnostic');assert.ok(report.remaining.some(r=>r.includes('No successful project')));}
  if(['missing','stale','other-command'].includes(mode)){
   assert.ok(first.correctionReasons.some(r=>r.includes(required)));assert.equal(report.observations.requiredChecks[0].executionStatus,'completed_exit_0');
   assert.equal(report.observations.latestChecks.find(c=>c.command===required).interpretation.status,'unsupported');
   if(mode==='stale')assert.equal(first.requiredChecks[0].observed,true);
   else assert.equal(first.requiredChecks[0].observed,false);
  }
  if(mode==='unparsed-failure'){assert.equal(first.latestChecks[0].exit,1);assert.equal(first.latestChecks[0].interpretation.status,'unparsed');assert.ok(report.observations.unclassifiedFailures.some(c=>c.exit===1));}
  if(mode==='zero'){assert.equal(first.latestChecks[0].tests,0);assert.ok(first.correctionReasons.length);}
  if(['nonzero','signal','timeout','unknown'].includes(mode)){
   assert.equal(report.observations.latestChecks[0].execution.status,{nonzero:'completed_nonzero',signal:'terminated_by_signal',timeout:'timed_out',unknown:'completion_unconfirmed'}[mode]);
   assert.equal(report.observations.latestChecks[0].successful,false);
  }
  if(terminalMode){assert.equal(report.stopReason,undefined);assert.ok(report.limits.length);assert.equal(feedback.length,0);assert.ok(!report.limits.some(l=>l.includes('exhausted;')));}
  if(mode==='permission')assert.deepEqual(observe(events,capture()).correctionReasons,[]);
  if(mode==='unfinished'){assert.match(report.limits.join(' '),/unresolved tool events/);assert.equal(observe(events,capture()).checks[0].execution.status,'completion_unconfirmed');}
  console.log(JSON.stringify({mode,repairs:report.repairs,status:report.status,stopReason:report.stopReason}));
 }
 for(const mode of scenarios){
  const dir=path.join(temp,mode);fs.mkdirSync(dir);
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
  git('init','-q');const artifacts=path.join(dir,'.git/observations');fs.mkdirSync(artifacts);
  const test="import {test} from 'node:test';import assert from 'node:assert/strict';test('public result',()=>assert.equal(2+2,4));\n";
  const supported=['supported','zero','script-change','npmrc-change','previous-failure'].includes(mode);
  let script=supported?'node --test':'node --test && node --version';
  // Unsupported runner names are replay controls, not claims those packages ran.
  if(['ava','mocha','tsd','lint'].includes(mode))script=mode==='lint'?'eslint .':mode;
  const pkg={scripts:{test:script,typecheck:'node --version',...(mode==='hooks'?{pretest:'node --version',posttest:'node --version'}:{})}};
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(pkg));
  if(mode!=='zero')fs.writeFileSync(path.join(dir,'value.test.mjs'),test);
  fs.mkdirSync(path.join(dir,'sub'));fs.writeFileSync(path.join(dir,'sub/package.json'),JSON.stringify(pkg));fs.writeFileSync(path.join(dir,'sub/value.test.mjs'),test);
  if(mode==='zero')fs.rmSync(path.join(dir,'sub'),{recursive:true});
  git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base');
  const task='Run `npm test`.'+(mode==='partial'?' Run `npm run typecheck`.':'');
  const observe=prepareObservations({directory:dir,artifacts,permissionRules:rules,task});
  const capture=()=>reviewContext({cwd:dir,base:'HEAD',permissionRules:rules});
  const events=[];
  const edit=(name,bytes)=>{const before=capture().snapshotSha256;fs.writeFileSync(path.join(dir,name),bytes);events.push({tool:'edit',state:'completed',before,after:capture().snapshotSha256});};
  const execute=(command='npm test',workdir='.')=>{
   const before=capture().snapshotSha256,startedAt=Date.now();
   const r=spawnSync('/bin/sh',['-c',command],{cwd:path.join(dir,workdir),encoding:'utf8',timeout:20000});
   const event={tool:'bash',callID:'call-'+events.length,args:{command,workdir},executionAdmitted:true,state:'completed',exit:r.status,signal:r.signal,output:r.stdout+r.stderr,startedAt,completedAt:Date.now(),before,after:capture().snapshotSha256};events.push(event);return event;
  };
  if(mode==='script-change')edit('package.json',JSON.stringify({scripts:{test:'echo fake'}}));
  if(mode==='npmrc-change')edit('.npmrc','ignore-scripts=true\n');
  if(mode==='nonzero'||mode==='previous-failure')edit('value.test.mjs',test.replace('2+2,4','2+2,5'));
  if(['ava','mocha','tsd','lint'].includes(mode))events.push({tool:'bash',callID:'replayed-runner',args:{command:'npm test'},state:'completed',exit:0,output:'uninterpreted saved runner output',before:capture().snapshotSha256,after:capture().snapshotSha256});
  else if(mode==='denied')events.push({tool:'bash',callID:'denied',args:{command:'npm test'},state:'error',executionAdmitted:false,permissionDenied:true,before:capture().snapshotSha256,after:capture().snapshotSha256});
  else if(mode==='unfinished')events.push({tool:'bash',callID:'unfinished',args:{command:'npm test'},state:'running',executionAdmitted:true,before:capture().snapshotSha256});
  else if(mode!=='absent')execute(mode==='environment'?'CHECK_MODE=1 npm test':mode==='shell-chain'?'npm test && node --version':'npm test',mode==='other-cwd'?'sub':'.');
  if(mode==='signal')events.at(-1).signal='SIGTERM';
  if(mode==='timeout')events.at(-1).timeout=true;
  if(['stale','revert'].includes(mode)){edit('value.test.mjs',test+'// edit\n');if(mode==='revert')edit('value.test.mjs',test);}
  if(mode==='previous-failure')execute('node --test sub/value.test.mjs');
  const facts=observe(events,capture()),check=facts.checks.find(c=>c.command==='npm test');
  if(mode==='absent'){assert.equal(facts.requiredChecks[0].executionStatus,'not_started');assert.equal(check,undefined);continue;}
  if(mode==='other-cwd'){assert.equal(facts.requiredChecks[0].observed,false);assert.equal(check.requirement,'diagnostic');continue;}
  if(['environment','shell-chain'].includes(mode)){assert.equal(facts.requiredChecks[0].observed,false);assert.equal(facts.checks[0].execution.successful,true);assert.equal(facts.checks[0].successful,false);continue;}
  assert.ok(check);assert.equal(check.exit,events.find(e=>e.callID===check.callID).exit??null);
  assert.equal(check.execution.status,mode==='signal'?'terminated_by_signal':mode==='timeout'?'timed_out':mode==='denied'?'denied_before_execution':mode==='unfinished'?'completion_unconfirmed':['nonzero','previous-failure'].includes(mode)?'completed_nonzero':'completed_exit_0');
  if(mode==='denied'){assert.equal(facts.requiredChecks[0].observed,false);assert.equal(check.successful,false);continue;}
  assert.equal(facts.requiredChecks[0].observed,true);
  assert.ok(!facts.reasons.some(r=>r.includes('not observed: npm test')));
  if(mode==='supported'){assert.equal(check.successful,true);assert.ok(check.tests>0);assert.equal(facts.checksCurrent,true);continue;}
  assert.equal(facts.checksCurrent,false);
  if(mode==='zero'){assert.equal(check.tests,0);assert.equal(check.successful,false);continue;}
  if(mode==='previous-failure'){assert.ok(facts.unresolvedFailures.some(c=>c.callID===check.callID));continue;}
  if(mode==='stale'||mode==='revert')assert.equal(check.current,false);
  if(mode==='partial')assert.equal(facts.requiredChecks.find(c=>c.command==='npm run typecheck').observed,false);
  assert.equal(check.successful,false);assert.equal(check.tests,null);
  const result={status:'incomplete',observations:facts,remaining:facts.reasons,limits:facts.limits,completedCommands:finalChecks(events,capture()).map(e=>({command:e.args.command}))};
  if(['signal','timeout'].includes(mode))assert.equal(result.completedCommands.length,0);
  const details={executionDirectory:dir,artifacts};
  assert.equal(compactTaskResult(result,details).observations.checks[0].execution.status,check.execution.status);
  assert.match(taskResultText(result,details),/Internal runner results not interpreted/);
  assert.ok(!taskResultText(result,details).includes('not observed: npm test'));
 }
 // A bind-mounted host worktree's .git pointer is not a portable source bundle.
 // Reproduce the Linux launcher failure without mounting host Git metadata, then
 // verify the corrected source-export cwd with the very same observer and files.
 {
  const cwd=process.cwd(),source=path.join(temp,'source-export'),dir=path.join(temp,'diff-inputs');
  fs.mkdirSync(source);fs.mkdirSync(dir);
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
  git('init','-q');
  const file=path.join(dir,'value.test.mjs'),committed='assert.equal(value(), 1);\n';
  fs.writeFileSync(file,committed);git('add','.');
  git('-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base');
  const dirty=committed+'assert.equal(userWork(), 2);\n';fs.writeFileSync(file,dirty);
  const artifacts=path.join(dir,'.git/observations');fs.mkdirSync(artifacts);
  const observe=prepareObservations({directory:dir,artifacts,permissionRules:rules});
  const snapshot={snapshotSha256:'fixture'};
  const realSpawn=childProcess.spawnSync;
  try {
   process.chdir(source);
   assert.deepEqual(observe([],snapshot).testChanges,[]);
   const before=path.join(artifacts,'original-tests/value.test.mjs');
   const equal=realSpawn('git',['diff','--no-index','--no-ext-diff','--no-textconv','--',before,file],{encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024});
   assert.equal(equal.status,0,equal.stderr);assert.equal(equal.stdout,'');
   fs.writeFileSync(file,committed+'assert.equal(userWork(), 3);\n');
   const gitfile=path.join(source,'.git');fs.writeFileSync(gitfile,'gitdir: '+path.join(temp,'unmounted-host-gitdir')+'\n');
   assert.throws(()=>observe([],snapshot),/Cannot capture exact test diff/);
   // Only the owned, invalid source metadata changes; project/snapshot bytes stay.
   fs.unlinkSync(gitfile);
   const facts=observe([],snapshot);assert.equal(facts.testChanges.length,1);
   const change=facts.testChanges[0];assert.equal(change.originalRetained,true);
   assert.equal(change.removedOrChangedLines,true);
   assert.match(change.diff,/^-assert\.equal\(userWork\(\), 2\);$/m);
   assert.match(change.diff,/^\+assert\.equal\(userWork\(\), 3\);$/m);
   assert.match(change.before,/userWork\(\), 2/);assert.match(change.after,/userWork\(\), 3/);
   assert.equal(fs.readFileSync(before,'utf8'),dirty);
   // Real Git covers the defect and success. Inject only unavailable process
   // outcomes, ensuring neither an empty nor a partial output becomes evidence.
   for(const failure of [
    {status:null,signal:null,error:Object.assign(new Error('fixture spawn failure'),{code:'ENOENT'}),stdout:'',stderr:''},
    {status:null,signal:'SIGTERM',stdout:'',stderr:''},
    {status:null,signal:'SIGTERM',error:Object.assign(new Error('fixture buffer failure'),{code:'ENOBUFS'}),stdout:change.diff.slice(0,40),stderr:''},
   ]) {
    let injected=0;
    childProcess.spawnSync=(exe,args,options)=>{
     if(exe==='git'&&args[0]==='diff'&&args[1]==='--no-index'){injected++;return failure;}
     return realSpawn(exe,args,options);
    };
    syncBuiltinESMExports();
    assert.throws(()=>observe([],snapshot),/Cannot capture exact test diff/);assert.equal(injected,1);
   }
  } finally {childProcess.spawnSync=realSpawn;syncBuiltinESMExports();process.chdir(cwd);}
 }
 console.log(JSON.stringify({passed:true,scenarios:scenarios.length,workflowScenarios:workflowScenarios.length+1,exactDiffBoundaries:true,portableSourceCwd:true,realModelRequests:0}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
