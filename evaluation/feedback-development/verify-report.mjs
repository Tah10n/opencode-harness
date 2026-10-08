import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {tasks,schedule} from './suite.mjs';
import {evaluatePatch} from './evaluate.mjs';
import {report,summarize} from './report.mjs';

async function verifyPairedReport(root) {
  const image='sha256:'+'a'.repeat(64),freeze={experimentKind:'fixture',executionImage:image,attempts:schedule},saved=new Map();
  const output=(task,arm)=>path.join(root,'runs',task.id+'-'+arm);
  const write=(out,file,value)=>{const p=path.join(out,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(value));};
  const saveFreeze=()=>fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify(freeze));
  for(const task of tasks)for(const arm of ['direct','D']) {
    const out=output(task,arm);fs.mkdirSync(out,{recursive:true});
    const patch=fs.readFileSync(path.join(task.directory,'gold.patch'));fs.writeFileSync(path.join(out,'model.patch'),patch);
    write(out,'result.json',{nativeCompleted:true,continuationApplied:false,delivery:'/public/worktree'});
    write(out,'patch-capture.json',{roundtripVerified:true,hasArtifacts:true,delivery:'/public/worktree'});
    write(out,'stop-verification.json',{terminationVerified:true,captureSaved:true,relayRemoved:true,forwardingClosed:true,activeProviderHandlers:0});
    write(out,'provider-metadata.json',[{forwarded:true,terminalResponse:{status:'completed'},clientDelivery:'stream-forwarded'}]);
    write(out,'task-artifacts/only/result.json',{status:'complete',repairs:0,stages:[{role:'author',messageID:'author'}],termination:{verified:true,abortRequests:0,pendingTools:0,queuedTools:0,activeTools:0,abortErrors:[]}});
    write(out,'native-evidence.json',{messages:[{id:'author',data:{role:'assistant',finish:'stop',time:{created:1,completed:2},path:{cwd:'/public/worktree'}}}]});
    // Real offline reporter output with synthetic containment metadata, as above.
    const result=await evaluatePatch({task,patch,output:path.join(out,'independent'),contained:false});
    assert.equal(result.R,true);
    const score={...result,contained:true,executionImage:image};saved.set(out,score);
    write(out,'independent/evaluation.json',score);
    write(out,'independent/session/container.json',{image,argv:['type=bind,target=/judge,readonly','type=bind,target=/input,readonly']});
    write(out,'independent/session/cleanup.json',{status:0});
  }
  saveFreeze();
  const metrics=result=>Object.fromEntries(['candidateWins','candidateLosses','ties','unknownPairs','deltaQPercentagePoints'].map(k=>[k,result.comparison[k]]));
  const expectedUnknown={candidateWins:0,candidateLosses:0,ties:7,unknownPairs:1,deltaQPercentagePoints:null};
  for(const arms of [['direct'],['D'],['direct','D']]) {
    for(const arm of ['direct','D']) {
      const out=output(tasks[0],arm);write(out,'independent/evaluation.json',{...saved.get(out),...(arms.includes(arm)?{cleanupVerified:false}:{})});
    }
    const first=await report(root,{evaluate:false}),second=await report(root,{evaluate:false});
    if(arms.length===1&&arms[0]==='direct')console.log('Paired report counterexample '+JSON.stringify(metrics(first)));
    assert.deepEqual(metrics(first),expectedUnknown);
    assert.deepEqual(second,first,'Repeated reporting must preserve pair admission');
    for(const row of first.rows.filter(r=>r.task===tasks[0].id&&arms.includes(r.arm))) {
      assert.equal(row.R,null);assert.equal(row.evaluationProven,false);assert.equal(row.Q,false);assert.equal(row.diagnosticR,true);
      assert.ok(row.unknownResults.includes('Evaluation containment/completion/cleanup unproven'));
    }
  }
  const firstTask=tasks[0];
  for(const arm of ['direct','D'])write(output(firstTask,arm),'independent/evaluation.json',saved.get(output(firstTask,arm)));
  // Absent grading also stays unknown, even when the row's conservative Q is false.
  const missing=path.join(output(firstTask,'direct'),'independent/evaluation.json');fs.unlinkSync(missing);
  assert.deepEqual(metrics(await report(root,{evaluate:false})),expectedUnknown);
  write(output(firstTask,'direct'),'independent/evaluation.json',saved.get(output(firstTask,'direct')));
  const baseline=await report(root);
  assert.deepEqual(metrics(baseline),{candidateWins:0,candidateLosses:0,ties:8,unknownPairs:0,deltaQPercentagePoints:0});
  assert.equal(baseline.rows[0].money,'unknown','No billing is required for quality admission');
  for(const arm of ['direct','D']) {
    const out=output(firstTask,arm),patch=fs.readFileSync(path.join(firstTask.directory,'wrong.patch'));
    fs.writeFileSync(path.join(out,'model.patch'),patch);
    const result=await evaluatePatch({task:firstTask,patch,output:path.join(out,'independent'),contained:false});
    assert.equal(result.R,false);assert.equal(result.status,'FAIL');
    write(out,'independent/evaluation.json',{...result,contained:true,executionImage:image});
    const reported=await report(root),row=reported.rows.find(r=>r.task===firstTask.id&&r.arm===arm);
    assert.equal(row.R,false);assert.equal(row.evaluationProven,true);assert.equal(row.Q,false);
    assert.deepEqual(metrics(reported),arm==='direct'?{candidateWins:1,candidateLosses:0,ties:7,unknownPairs:0,deltaQPercentagePoints:12.5}:{candidateWins:0,candidateLosses:0,ties:8,unknownPairs:0,deltaQPercentagePoints:0});
  }
  const measured=await report(root);assert.deepEqual(await report(root),measured);
  const direct=output(firstTask,'direct');
  fs.writeFileSync(path.join(direct,'model.patch'),fs.readFileSync(path.join(firstTask.directory,'gold.patch')));
  write(direct,'independent/evaluation.json',saved.get(direct));
  // The gold process evidence is regenerated for its unchanged patch.
  const restored=await evaluatePatch({task:firstTask,patch:fs.readFileSync(path.join(direct,'model.patch')),output:path.join(direct,'independent'),contained:false});
  write(direct,'independent/evaluation.json',{...restored,contained:true,executionImage:image});
  assert.deepEqual(metrics(await report(root)),{candidateWins:0,candidateLosses:1,ties:7,unknownPairs:0,deltaQPercentagePoints:-12.5});
  fs.writeFileSync(path.join(direct,'model.patch'),fs.readFileSync(path.join(firstTask.directory,'wrong.patch')));
  const failed=await evaluatePatch({task:firstTask,patch:fs.readFileSync(path.join(direct,'model.patch')),output:path.join(direct,'independent'),contained:false});
  write(direct,'independent/evaluation.json',{...failed,contained:true,executionImage:image});
  freeze.attempts=schedule.slice(1);saveFreeze();assert.deepEqual(metrics(await report(root)),expectedUnknown);
  freeze.attempts=[...schedule,schedule[0]];saveFreeze();assert.deepEqual(metrics(await report(root)),expectedUnknown);
  // Admission uses structured facts, not diagnostic prose or just Q=false.
  const rows=measured.rows;
  for(const change of [{evaluationProven:false},{evaluationProven:undefined},{R:null},{R:undefined},{Q:null}])assert.deepEqual(metrics({comparison:summarize(rows.map((row,i)=>i===0?{...row,...change}:row))}),expectedUnknown);
  assert.deepEqual(summarize(rows.map(row=>({...row,unknownResults:['unknown money; no billing; failed diagnostic']}))),measured.comparison);
  console.log('PASS eight-pair report reader, unknown direct/D/both, genuine FAIL/PASS and FAIL/FAIL, missing/duplicate rows and repeat');
}

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
  await verifyPairedReport(path.join(root,'pairs'));
  console.log('PASS report repeat, interrupted assembly, diagnostic R and patch/task/acceptance/reporter/cleanup binding');
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-report-regression-'));
  try{await verifyReport(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
