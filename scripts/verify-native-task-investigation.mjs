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
 const asset=Buffer.alloc(769479,0x80);asset.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
 put(repo,'docs/assets/preview.png',asset);put(repo,'public/font.ttf',Buffer.from([0,1,0,0,255,128]));
 git(repo,'init','-q');git(repo,'add','.');git(repo,'-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base');
 const work=repo+'/.git/harness-task/author/worktree';git(repo,'worktree','add','--detach',work,'HEAD');put(work,'value.mjs','export const accepts = n => n >= 2;\n');
 put(work,'node_modules/choice/index.js','exports.answer=7;\n');
 const capture=()=>reviewContext({cwd:work,base:'HEAD',permissionRules:rules});
 for(const mode of ['accept','conflict','stale','production','binary','test-config','dependency','allowed']) {
  const before=capture(),copy=await prepareInvestigation({directory:work,artifacts:temp+'/'+mode,base:'HEAD',rules,active(){}});
  assert.equal(copy.capture().snapshotSha256,copy.initial.snapshotSha256);
  assert.equal(fs.readFileSync(copy.directory+'/value.mjs','utf8'),fs.readFileSync(work+'/value.mjs','utf8'));
  assert.deepEqual(fs.readFileSync(copy.directory+'/docs/assets/preview.png'),asset);
  assert.deepEqual(fs.readFileSync(copy.directory+'/public/font.ttf'),fs.readFileSync(work+'/public/font.ttf'));
  assert.equal(fs.statSync(copy.directory+'/docs/assets/preview.png').mode&0o777,fs.statSync(work+'/docs/assets/preview.png').mode&0o777);
  if(mode==='dependency'){put(copy.directory,'node_modules/choice/index.js','exports.answer=8;\n');assert.throws(copy.testPatch,/non-test|production/);assert.equal(fs.readFileSync(work+'/node_modules/choice/index.js','utf8'),'exports.answer=7;\n');continue;}
  if(mode==='production'){put(copy.directory,'value.mjs','export const accepts = () => false;\n');assert.throws(copy.testPatch,/non-test|production/);continue;}
  if(mode==='binary'){put(copy.directory,'docs/assets/preview.png',Buffer.from([0,1,2]));assert.throws(copy.testPatch,/non-test|production/);continue;}
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
 put(work,'docs/assets/preview.png',Buffer.from([0,1,2]));
 await assert.rejects(prepareInvestigation({directory:work,artifacts:temp+'/changed-opaque',base:'HEAD',rules,active(){}}),/opaque author file/);
 put(work,'docs/assets/preview.png',asset);
 put(work,'docs/assets/new.png',Buffer.from([0,1,2]));
 await assert.rejects(prepareInvestigation({directory:work,artifacts:temp+'/new-opaque',base:'HEAD',rules,active(){}}),/opaque author file/);
 fs.unlinkSync(work+'/docs/assets/new.png');
 put(work,'docs/assets/too-large.png',Buffer.alloc(2*1024*1024+1,0x80));
 await assert.rejects(prepareInvestigation({directory:work,artifacts:temp+'/oversized',base:'HEAD',rules,active(){}}),/size limit/);
 fs.unlinkSync(work+'/docs/assets/too-large.png');
 put(work,'large.mjs','x'.repeat(512*1024+1));
 await assert.rejects(prepareInvestigation({directory:work,artifacts:temp+'/large-source',base:'HEAD',rules,active(){}}),/text snapshot size limit/);
 fs.unlinkSync(work+'/large.mjs');
 for(let i=0;i<9;i++)put(work,'assets/opaque-'+i+'.bin',Buffer.alloc(1024*1024,0x80));
 await assert.rejects(prepareInvestigation({directory:work,artifacts:temp+'/total-opaque',base:'HEAD',rules,active(){}}),/opaque investigation file/);
 fs.rmSync(work+'/assets',{recursive:true});
 for(let i=0;i<1501;i++)put(work,'many/'+String(i).padStart(4,'0')+'.txt','');
 await assert.rejects(prepareInvestigation({directory:work,artifacts:temp+'/many-files',base:'HEAD',rules,active(){}}),/file limit/);
 fs.rmSync(work+'/many',{recursive:true});
 fs.symlinkSync(work+'/value.mjs',work+'/linked.mjs');
 await assert.rejects(prepareInvestigation({directory:work,artifacts:temp+'/symlink',base:'HEAD',rules,active(){}}),/file kind or mount/);
 fs.unlinkSync(work+'/linked.mjs');
 await assert.rejects(prepareInvestigation({directory:work,artifacts:temp+'/denied',base:'HEAD',rules:[...rules,{permission:'read',pattern:'*preview.png',action:'deny'}],active(){}}),/unreadable investigation path/);
 await assert.rejects(prepareInvestigation({directory:work,artifacts:temp+'/cancelled',base:'HEAD',rules,active(){throw Error('cancelled')}}),/cancelled/);
 await assert.rejects(prepareInvestigation({directory:work,artifacts:temp+'/deadline',base:'HEAD',rules,active(){throw Error('deadline')}}),/deadline/);
 const senseRepo=temp+'/sense';fs.mkdirSync(senseRepo);
 put(senseRepo,'package.json',JSON.stringify({type:'module',scripts:{test:'node --test'}}));
 put(senseRepo,'value.mjs','export const value = 1;\n');
 git(senseRepo,'init','-q');git(senseRepo,'add','.');git(senseRepo,'-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base');
 put(senseRepo,'value.mjs','export const value = 2;\n');
 const budget={spentMs:179500},events=[];
 for(let i=0;i<2;i++) {
  const sense=createSensitivity({directory:senseRepo,rules,base:'HEAD',budget,save:(n,v)=>events.push([n,v]),checkActive(){},remainingMs:()=>900000});
  const prior=sense.before({tool:'harness_sense'},{args:{path:'value.mjs'}},'snapshot');
  const result=JSON.parse(await sense.execute(prior,{ask:async()=>{},abort:new AbortController().signal}));
  assert.equal(result.cost.commands,0);assert.match(result.limits.join(' '),/budget/);
 }
 assert.ok(budget.spentMs>=179500);
 console.log('Investigation copy, test-only patch, exact-snapshot integration, preservation, opt-out and shared-budget checks passed; real provider requests: 0');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
