import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {calibrationTasks,calibrationSchedule,suiteFor,frozenManifest,repository} from '../suite.mjs';
import {verifyFrozenSchedule} from '../../support/scheduler.mjs';
import {deliveryFacts} from '../evaluate.mjs';
import {summarizeCalibration} from '../report.mjs';
import {verifyRealAdmission} from '../run.mjs';
import {providerConfig} from '../prepare.mjs';
import {manifest} from '../../support/manifest.mjs';
import {preflight} from '../preflight.mjs';

export async function verifyCalibration(output) {
  const spec=suiteFor({experimentKind:'feedback-calibration'});
  const schedule=calibrationSchedule.map(a=>({...a,source:path.join(spec.realBatch,'inputs',a.task)}));
  const f={experimentKind:spec.kind,suite:spec.config.suite,runId:spec.runId,model:'openai/gpt-5.6-luna',variant:'high',budgetMs:600000,strategy:'per-slot',streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,preflightPassed:true,armModes:{P:'plain',H0:'task',H1:'task'},files:{},attempts:schedule};
  verifyFrozenSchedule(f,()=>{});
  for(const change of [{budgetMs:600001},{variant:'low'},{attempts:schedule.slice(0,17)},{armModes:{P:'task',H0:'task',H1:'task'}},{attempts:schedule.map((a,i)=>i===0?{...a,arm:'H0'}:a)},{attempts:schedule.map((a,i)=>i===1?{...a,source:'/different'}:a)}])assert.throws(()=>verifyFrozenSchedule({...f,...change},()=>{}));
  for(const arm of ['P','H0','H1'])for(let position=0;position<3;position++)assert.equal(schedule.filter((a,i)=>i%3===position&&a.arm===arm).length,2);
  const plan=frozenManifest(),sourceCommit='b'.repeat(40),image='sha256:'+'a'.repeat(64),digest='c'.repeat(64);
  const admitted={...f,modelRunsAuthorized:true,runtimeVersion:spec.config.runtimeVersion,nodeVersion:spec.config.nodeVersion,executionImage:image,sourceCommit,config:providerConfig(f.model,f.variant),files:Object.fromEntries(Object.entries({...plan.files,...plan.product}).map(([n,v])=>[path.join(repository,n),v.sha256])),inputManifests:Object.fromEntries(schedule.map(a=>[a.task+'-'+a.arm,manifest(calibrationTasks.find(t=>t.id===a.task).source)]))};
  const seal={runId:spec.runId,conditionsHead:spec.conditionsHead,reviewedHead:sourceCommit,preRunSourceCommit:sourceCommit,sourceCommit,freezeSha256:digest,executionImage:image};
  verifyRealAdmission(spec.realBatch,admitted,seal,digest,image);
  assert.throws(()=>verifyRealAdmission(path.join(output,'copy'),admitted,seal,digest,image));
  const facts={mode:'plain',runtime:{nativeCompleted:true,continuationApplied:false,delivery:'/work/repo'},capture:{roundtripVerified:true,hasArtifacts:false,delivery:'/work/repo'},stop:{terminationVerified:true,captureSaved:true,relayRemoved:true,forwardingClosed:true,activeProviderHandlers:0},requests:[{forwarded:true,terminalResponse:{status:'completed'},clientDelivery:'stream-forwarded'}],nativeEvidence:{sessions:[{id:'plain-session',parent_id:null}],messages:[{id:'plain-terminal',session_id:'plain-session',data:{role:'assistant',finish:'stop',time:{created:1,completed:2},path:{cwd:'/work/repo'}}}],tools:[]},patchApplied:true};
  assert.equal(deliveryFacts(facts).delivery,true,'Plain completion needs no harness-specific artifact');
  assert.equal(deliveryFacts({...facts,mode:'task'}).delivery,false);
  for(const change of [{nativeEvidence:{...facts.nativeEvidence,messages:[]}},{capture:{...facts.capture,delivery:'/other'}},{stop:{...facts.stop,terminationVerified:false}},{nativeEvidence:{...facts.nativeEvidence,tools:[{data:{state:{status:'running'}}}]}},{requests:[{forwarded:true}]},{runtime:{...facts.runtime,nativeCompleted:false}}])assert.equal(deliveryFacts({...facts,...change}).delivery,false);
  const rows=calibrationTasks.flatMap(t=>['P','H0','H1'].map(arm=>({task:t.id,arm,R:arm!=='P',Q:arm!=='P',evaluationProven:true,initialR:false,initialEvaluationProven:true,corrections:arm==='H1'?1:0,patchChanged:arm==='H1'})));
  const summary=summarizeCalibration(rows);assert.equal(summary.plainFailures,6);assert.equal(summary.contrasts.H0_vs_P.wins,6);assert.equal(summary.contrasts.H1_vs_H0.ties,6);assert.equal(summary.D.improvedR,6);
  const unknown=rows.map((r,i)=>i===0?{...r,evaluationProven:false}:r);assert.equal(summarizeCalibration(unknown).contrasts.H0_vs_P.unknown,1);assert.equal(summarizeCalibration(unknown).contrasts.H0_vs_P.deltaQPercentagePoints,null);assert.equal(summarizeCalibration([...rows,rows[0]]).contrasts.H0_vs_P.unknown,1);
  await preflight(path.join(output,'controls'),{calibration:true});
  return {passed:true,realProviderCalls:0,tasks:6,attempts:18,plainDeliveryWithoutHarnessArtifacts:true,balancedPositions:true,unknownNotMeasured:true};
}
