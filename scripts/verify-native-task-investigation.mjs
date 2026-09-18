import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareInvestigation, integrateInvestigation, investigationEnabled} from '../lib/native-task-investigation.mjs';
import {reviewContext} from '../lib/native-review-context.mjs';
import {createSensitivity} from '../lib/native-sensitivity.mjs';
import nativeTaskPlugin from '../lib/native-task-plugin.mjs';
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'native-investigation-'))),rules=[{permission:'*',pattern:'*',action:'allow'}];
const put=(d,n,s)=>{fs.mkdirSync(path.dirname(path.join(d,n)),{recursive:true});fs.writeFileSync(path.join(d,n),s);};
const git=(d,...args)=>{const r=spawnSync('git',args,{cwd:d,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
try {
 assert.equal(investigationEnabled({}),false);assert.equal(investigationEnabled({HARNESS_TASK_INVESTIGATION:'1'}),true);assert.throws(()=>investigationEnabled({HARNESS_TASK_INVESTIGATION:'true'}));
 const hooks=await nativeTaskPlugin({client:{},directory:temp});assert.ok(!hooks.tool.harness_investigate);
 const repo=temp+'/author';fs.mkdirSync(repo);
 put(repo,'package.json',JSON.stringify({type:'module',scripts:{test:'node --test'}}));put(repo,'.gitignore','node_modules/\n');
 put(repo,'value.mjs','export const accepts = n => n > 2;\n');put(repo,'value.test.mjs',"import {test} from 'node:test';import assert from 'node:assert/strict';import {accepts} from './value.mjs';test('outer range',()=>{assert.equal(accepts(3),true);assert.equal(accepts(1),false);});\n");
 git(repo,'init','-q');git(repo,'add','.');git(repo,'-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base');
 const work=repo+'/.git/harness-task/author/worktree';git(repo,'worktree','add','--detach',work,'HEAD');put(work,'value.mjs','export const accepts = n => n >= 2;\n');
 put(work,'node_modules/choice/index.js','exports.answer=7;\n');
 const capture=()=>reviewContext({cwd:work,base:'HEAD',permissionRules:rules});
 for(const mode of ['accept','conflict','stale','production','test-config','dependency','allowed']) {
  const before=capture(),copy=await prepareInvestigation({directory:work,artifacts:temp+'/'+mode,base:'HEAD',rules,active(){}});
  assert.equal(copy.capture().snapshotSha256,copy.initial.snapshotSha256);
  assert.equal(fs.readFileSync(copy.directory+'/value.mjs','utf8'),fs.readFileSync(work+'/value.mjs','utf8'));
  if(mode==='dependency'){put(copy.directory,'node_modules/choice/index.js','exports.answer=8;\n');assert.throws(copy.testPatch,/non-test|production/);assert.equal(fs.readFileSync(work+'/node_modules/choice/index.js','utf8'),'exports.answer=7;\n');continue;}
  if(mode==='production'){put(copy.directory,'value.mjs','export const accepts = () => false;\n');assert.throws(copy.testPatch,/non-test|production/);continue;}
  if(mode==='test-config'){put(copy.directory,'test/package.json','{}');assert.throws(copy.testPatch,/non-test|production/);continue;}
  if(mode==='allowed'){assert.equal(copy.testPatch(),'');continue;}
  put(copy.directory,'boundary.test.mjs',"import {test} from 'node:test';import assert from 'node:assert/strict';import {accepts} from './value.mjs';test('inclusive boundary',()=>assert.equal(accepts(2),true));\n");
  const check=spawnSync(process.execPath,['--test'],{cwd:copy.directory,encoding:'utf8'});assert.equal(check.status,0,check.stdout+check.stderr);
  const patch=copy.testPatch();assert.match(patch,/boundary.test.mjs/);assert.doesNotMatch(patch,/diff --git a\/value.mjs/);
  assert.equal(capture().snapshotSha256,before.snapshotSha256,'Child leaves author bytes/index unchanged');
  if(mode==='conflict'){const bad=patch+'diff --git a/value.mjs b/value.mjs\n--- a/value.mjs\n+++ b/value.mjs\n@@ -1 +1 @@\n-impossible context\n+bad replacement\n';assert.throws(()=>integrateInvestigation({directory:work,capture,expected:before.snapshotSha256,patch:bad}));assert.equal(capture().snapshotSha256,before.snapshotSha256);continue;}
  if(mode==='stale')put(work,'user.txt','later user bytes\n');
  const result=integrateInvestigation({directory:work,capture,expected:before.snapshotSha256,patch});
  assert.equal(result.accepted,mode==='accept');
  if(mode==='stale')assert.equal(fs.readFileSync(work+'/user.txt','utf8'),'later user bytes\n');
  if(mode==='accept')fs.unlinkSync(work+'/boundary.test.mjs');
 }
 const budget={spentMs:179500},events=[];
 for(let i=0;i<2;i++) {
  const sense=createSensitivity({directory:work,rules,base:'HEAD',budget,save:(n,v)=>events.push([n,v]),checkActive(){},remainingMs:()=>900000});
  const prior=sense.before({tool:'harness_sense'},{args:{path:'value.mjs'}},'snapshot');
  const result=JSON.parse(await sense.execute(prior,{ask:async()=>{},abort:new AbortController().signal}));
  assert.equal(result.cost.commands,0);assert.match(result.limits.join(' '),/budget/);
 }
 assert.ok(budget.spentMs>=179500);
 console.log('Investigation copy, test-only patch, exact-snapshot integration, preservation, opt-out and shared-budget checks passed; real provider requests: 0');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
