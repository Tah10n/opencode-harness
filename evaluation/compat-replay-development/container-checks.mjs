// Every fixture's project code executes through the existing offline session.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {startContainer} from '../support/container-session.mjs';
import {stopWorkload} from '../support/stop-workload.mjs';
import {applyPatch} from '../feedback-development/suite.mjs';
import {evaluatePatch} from '../feedback-development/evaluate.mjs';
import {tasks,directory} from './suite.mjs';
import {treeHash,pinInputs} from './probe.mjs';
import {privateJSON,hashFile} from '../support/output-files.mjs';
import {manifest} from '../support/manifest.mjs';

export async function check({source,patch=Buffer.alloc(0),toolchain,output,baseline=source,pins=pinInputs(baseline),mutate='',remaining=10000}) {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'compat-control-'));let session;
  try {
    const candidate=path.join(temp,'candidate');applyPatch(source,patch,candidate);
    // Only public baseline and experiment code mount; no judge or reference patches.
    const template=path.join(temp,'template');fs.mkdirSync(template);fs.cpSync(baseline,path.join(template,'baseline'),{recursive:true});
    for(const f of ['worker.mjs','probe.mjs'])fs.copyFileSync(path.join(directory,f),path.join(template,f));
    for(const f of ['native-task-observations.mjs','native-task-workflow.mjs'])fs.copyFileSync(path.resolve(directory,'../../lib',f),path.join(template,f));
    fs.chmodSync(temp,0o755);
    session=await startContainer({source:candidate,toolchain,template,output:path.join(output,'session'),onRequest:()=>{throw Error('Model-free only');}});
    if(mutate){const r=session.exec(['node','-e',mutate]);assert.equal(r.status,0,r.stderr);}
    const code=`import {probe,addObservation,treeHash} from '/template/probe.mjs';import fs from 'node:fs';import {spawnSync} from 'node:child_process';
      const {prepareObservations}=await import('/template/native-task-observations.mjs');fs.mkdirSync('/work/observations');const observe=prepareObservations({directory:'/work/repo',artifacts:'/work/observations',permissionRules:[{permission:'*',pattern:'*',action:'allow'}],task:fs.readFileSync('/input/TASK.md','utf8')});
      const start=performance.now();const r=probe({baseline:'/template/baseline',candidate:'/work/repo',pins:${JSON.stringify(pins)},snapshotSha256:treeHash('/work/repo'),remainingMs:()=>${remaining}-(performance.now()-start)});
      const p=spawnSync('npm',['test'],{encoding:'utf8',timeout:5000,killSignal:'SIGKILL'});
      const snapshot={snapshotSha256:treeHash('/work/repo')};const facts=observe([{tool:'bash',callID:'public',state:'completed',exit:p.status,args:{command:'npm test',workdir:'/work/repo'},output:p.stdout,before:snapshot.snapshotSha256,after:snapshot.snapshotSha256}],snapshot);
      console.log(JSON.stringify({probe:r,existingCorrectionReasons:facts.correctionReasons,extendedCorrectionReasons:addObservation(facts,r,snapshot.snapshotSha256).correctionReasons,publicExit:p.status,publicOutput:p.stdout,judgeAbsent:!fs.existsSync('/judge')}));`;
    const run=session.exec(['node','--input-type=module','-e',code]);assert.equal(run.status,0,run.stderr);
    const result=JSON.parse(run.stdout);assert.equal(result.judgeAbsent,true);
    result.termination=stopWorkload(session);assert.equal(result.termination.terminationVerified,true);
    privateJSON(path.join(output,'result.json'),result);return result;
  }finally{if(session)assert.equal(session.close(),0);fs.rmSync(temp,{recursive:true,force:true});}
}
export async function preflight({output,toolchain}) {
  fs.mkdirSync(output,{recursive:true});const rows=[];
  for(const task of tasks) {
    const row={task:task.id,results:{}};
    for(const label of ['baseline','gold','wrong']) {
      const patch=label==='baseline'?Buffer.alloc(0):fs.readFileSync(path.join(task.directory,label+'.patch'));
      const dir=path.join(output,task.id,label);fs.mkdirSync(dir,{recursive:true});
      const result=await check({source:task.source,patch,toolchain,output:dir});
      assert.equal(result.publicExit,0,task.id+' '+label+' public');assert.deepEqual(result.existingCorrectionReasons,[],JSON.stringify(result));assert.equal(result.extendedCorrectionReasons.length,label==='wrong'?1:0);
      assert.equal(result.probe.status,label==='wrong'?'different':'matched',JSON.stringify(result.probe));
      const independent=await evaluatePatch({task,patch,output:path.join(dir,'independent'),toolchain});
      assert.equal(independent.R,label==='gold',task.id+' '+label+' independent');
      row.results[label]={publicExit:result.publicExit,existingCorrectionReasons:result.existingCorrectionReasons,extendedCorrectionReasons:result.extendedCorrectionReasons,probe:result.probe,independentR:independent.R};
    }
    rows.push(row);console.log('PASS contained baseline/gold/wrong '+task.id);
  }
  const negative=[];const task=tasks[0];
  for(const [name,body,expected,reason] of [
    ['unsupported','export function encode(){return undefined;}','unsupported','Unsupported JSON value'],
    ['nondeterminism','export function encode(){return Math.random();}','unproven','nondeterminism'],
    ['stateful','let n=0;export function encode(){return ++n;}','unproven','nondeterminism'],
    ['execution','this is invalid JavaScript','unsupported','module execution'],
    ['timeout','export function encode(){while(true){}}','unproven','timeout'],
  ]) {
    const out=path.join(output,'negative-'+name);fs.mkdirSync(out);
    const r=await check({source:task.source,toolchain,output:out,mutate:`require('fs').writeFileSync('src/index.mjs',${JSON.stringify(body)})`});
    assert.equal(r.probe.status,expected);assert.ok(r.probe.limits.some(x=>x.includes(reason)),JSON.stringify(r.probe));assert.deepEqual(r.probe.differences,[]);
    negative.push({name,status:r.probe.status,limits:r.probe.limits});
  }
  for(const name of ['corpus','baseline']) {
    const out=path.join(output,'negative-'+name);fs.mkdirSync(out);const pins=pinInputs(task.source);pins[name==='corpus'?'corpusSha256':'baselineSha256']='0'.repeat(64);
    const r=await check({source:task.source,toolchain,output:out,pins});assert.equal(r.probe.status,'unproven');assert.match(r.probe.limits.join(),/integrity/);negative.push({name,status:r.probe.status,limits:r.probe.limits});
  }
  for(const [name,mutate] of [['participant-corpus',"require('fs').writeFileSync('compat.json','{}')"],['missing-corpus',"require('fs').unlinkSync('compat.json')"]]) {
    const out=path.join(output,'negative-'+name);fs.mkdirSync(out);const r=await check({source:task.source,toolchain,output:out,mutate});assert.equal(r.probe.status,'unproven');negative.push({name,status:r.probe.status,limits:r.probe.limits});
  }
  const timeoutOut=path.join(output,'negative-worker-timeout');fs.mkdirSync(timeoutOut);const timeoutResult=await check({source:task.source,toolchain,output:timeoutOut,remaining:1});assert.equal(timeoutResult.probe.status,'unproven');assert.match(timeoutResult.probe.limits.join(),/timeout|budget/);negative.push({name:'worker-timeout',status:timeoutResult.probe.status,limits:timeoutResult.probe.limits});
  const receipt={inputHashes:manifest(path.join(directory,'tasks')),probeSha256:hashFile(path.join(directory,'probe.mjs')).sha256,workerSha256:hashFile(path.join(directory,'worker.mjs')).sha256,executionImage:process.env.EVALUATION_IMAGE,passed:true,contained:true,modelFree:true,realProviderCalls:0,taskHashes:Object.fromEntries(tasks.map(t=>[t.id,treeHash(t.source)])),rows,negative};
  privateJSON(path.join(output,'preflight.json'),receipt);return receipt;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const [output,toolchain]=process.argv.slice(2);await preflight({output,toolchain});}
