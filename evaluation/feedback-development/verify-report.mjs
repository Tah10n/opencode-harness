import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {tasks,schedule} from './suite.mjs';
import {evaluatePatch} from './evaluate.mjs';
import {report} from './report.mjs';

export async function verifyReport(root) {
  const task=tasks[0],out=path.join(root,'runs',task.id+'-direct'),image='sha256:'+'a'.repeat(64);
  fs.mkdirSync(out,{recursive:true});
  const freeze={experimentKind:'fixture',executionImage:image,attempts:[schedule[0]]};
  const write=(file,value)=>{const p=path.join(out,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(value));};
  const saveFreeze=()=>fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify(freeze));saveFreeze();
  fs.writeFileSync(path.join(out,'model.patch'),fs.readFileSync(task.directory+'/gold.patch'));
  write('result.json',{nativeCompleted:true,continuationApplied:false,delivery:'/public/worktree'});
  write('patch-capture.json',{roundtripVerified:true,hasArtifacts:true,delivery:'/public/worktree'});
  write('stop-verification.json',{terminationVerified:true,captureSaved:true,relayRemoved:true,forwardingClosed:true,activeProviderHandlers:0});
  write('provider-metadata.json',[{forwarded:true,terminalResponse:{status:'completed'},clientDelivery:'stream-forwarded'}]);
  write('task-artifacts/only/result.json',{status:'complete',repairs:0,stages:[{role:'author',messageID:'author'}],termination:{verified:true,abortRequests:0,pendingTools:0,queuedTools:0,activeTools:0,abortErrors:[]}});
  write('native-evidence.json',{messages:[{id:'author',data:{role:'assistant',finish:'stop',time:{created:1,completed:2},path:{cwd:'/public/worktree'}}}]});
  // Synthetic metadata fixture for reader validation; actual containment is tested by installed.mjs.
  const scoring=await evaluatePatch({task,patch:fs.readFileSync(path.join(out,'model.patch')),output:path.join(out,'independent'),contained:false});
  const saved={...scoring,contained:true,executionImage:image};
  write('independent/session/container.json',{image,argv:['type=bind,target=/judge,readonly','type=bind,target=/input,readonly']});
  write('independent/session/cleanup.json',{status:0});
  const evaluateFile='independent/evaluation.json';write(evaluateFile,saved);
  const first=await report(root),second=await report(root);
  assert.equal(first.rows[0].Q,true);assert.deepEqual(second,first);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,evaluateFile))),saved);
  for(const change of [{cleanupVerified:false},{contained:false},{terminationVerified:false},{evaluationComplete:false},{patchSha256:'other patch'},{task:'other task'},{acceptanceSha256:'other acceptance'},{reporterSha256:'other reporter'},{sourceSha256:'other source'},{processSha256:'other process'},{R:false},{taskSha256:'other obligations'}]) {
    write(evaluateFile,{...saved,...change});
    const row=(await report(root,{evaluate:false})).rows[0];
    assert.equal(row.evaluationProven,false);assert.equal(row.R,null);assert.equal(row.Q,false);
    assert.equal(row.diagnosticR,change.R??true);
  }
  write(evaluateFile,{R:true,patchApplied:true});
  assert.equal((await report(root,{evaluate:false})).rows[0].Q,false);
  write(evaluateFile,saved);
  const completed=await report(root),published=fs.readFileSync(path.join(root,'report.json'));
  freeze.attempts.push({...schedule[1],task:'invalid-task'});saveFreeze();
  await assert.rejects(()=>report(root),/Unknown task/);
  assert.deepEqual(fs.readFileSync(path.join(root,'report.json')),published,'Interrupted assembly must not replace a completed report');
  freeze.attempts[1]=schedule[1];saveFreeze();
  const partial=await report(root,{evaluate:false});assert.deepEqual(partial.rows[0],completed.rows[0]);assert.equal(partial.rows[1].Q,null);
  freeze.attempts.pop();saveFreeze();assert.deepEqual(await report(root),completed);
  console.log('PASS report repeat, interrupted assembly, diagnostic R and patch/task/acceptance/reporter/cleanup binding');
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-report-regression-'));
  try{await verifyReport(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
