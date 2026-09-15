// Real local command executions; synthetic lifecycle controls use the same log.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareObservations} from '../lib/native-task-observations.mjs';
import {compactTaskResult,taskResultText} from '../lib/native-task-plugin.mjs';
import {finalChecks} from '../lib/native-task-workflow.mjs';
import {reviewContext} from '../lib/native-review-context.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-command-observations-'));
const rules=[{permission:'read',pattern:'*',action:'allow'}];
const scenarios=['compound','signal','timeout','nonzero','stale','revert','other-cwd','script-change','npmrc-change','hooks','partial','absent','supported','zero','denied','unfinished','environment','shell-chain','previous-failure','ava','mocha','tsd','lint'];
try {
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
 console.log(JSON.stringify({passed:true,scenarios:scenarios.length,realModelRequests:0}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
