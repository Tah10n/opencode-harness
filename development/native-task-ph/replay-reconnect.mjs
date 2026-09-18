// Replay only retained reconnect test bytes. No historical outcome is regraded.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {prepareObservations} from '../../lib/native-task-observations.mjs';import {runWorkflow} from '../../lib/native-task-workflow.mjs';
const root=path.resolve('.'),source=path.join(root,'local/native-task-abc/tasks/reconnect-revoked/initial'),file='packages/connector/test/config.test.mjs',original=fs.readFileSync(path.join(source,file),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex'),rows=[];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-d-reconnect-'));
try {for(const arm of ['B','C']) {
 const dir=path.join(temp,arm);fs.mkdirSync(path.join(dir,path.dirname(file)),{recursive:true});fs.writeFileSync(path.join(dir,file),original);fs.writeFileSync(path.join(dir,'package.json'),'{"scripts":{"test":"node --test"}}');fs.writeFileSync(path.join(dir,'.gitignore'),'.observations\n');
 const git=args=>{const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 git(['init','-q']);git(['add','.']);git(['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','original test bytes']);
 const artifacts=path.join(dir,'.observations');fs.mkdirSync(artifacts);
 const observe=prepareObservations({directory:dir,artifacts,permissionRules:[{permission:'read',pattern:'*',action:'allow'}]});
 const patchFile=path.join(root,'development/native-task-abc/results/patches/reconnect-revoked',arm+'-final.patch'),patch=fs.readFileSync(patchFile,'utf8');
 git(['apply','--include='+file,patchFile]);
 const observed=observe([],{snapshotSha256:'retained-replay'}),change=observed.testChanges.find(t=>t.path===file);
 assert.ok(change);assert.ok(change.diff.includes('-  mode = "disconnected";'));assert.ok(change.diff.includes('+  mode = "unauthorized";'));
 assert.ok(change.diff.includes('-      /Existing installation authorization cannot be reconciled; run `viberacing disconnect`/,'));
 let feedback;
 const report=await runWorkflow({capture:()=>({status:'captured',snapshotSha256:'retained-replay',task:fs.readFileSync(path.join(source,'TASK.md'),'utf8'),diff:patch}),save:()=>{},checkActive:()=>{},aborted:()=>false,messages:async()=>[],observe:()=>observed,prompt:async(role,text)=>{assert.equal(role,'author');if(text.startsWith('{'))feedback=JSON.parse(text);return{info:{finish:'stop'},parts:[{type:'text',text:'Replay only; retained result not corrected.'}]};}});
 assert.ok(feedback.observations.testChanges.some(t=>t.diff===change.diff));assert.equal(report.repairs,2);assert.equal(report.status,'incomplete');assert.equal(sha(fs.readFileSync(patchFile)),sha(patch));
 rows.push({arm,historicalPatchSha256:sha(patch),originalTestSha256:sha(original),feedbackIncludesExactDiff:true,intentionallyReplacedExpectation:'401 no longer requires a manual disconnect; removal of that rejection is permitted by the task',separateLostScenario:'mode = disconnected was replaced by unauthorized; explicit disconnected-source retirement must retain its own necessary scenario',historicalResultRepaired:false});
}}
finally{fs.rmSync(temp,{recursive:true,force:true});}
const result={passed:true,scope:'B/C retained reconnect material only; program feedback regression, not historical repair or model effectiveness',realProviderRequests:0,rows};
fs.writeFileSync('development/native-task-ph/reconnect-replay.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
