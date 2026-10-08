import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluatePatch,readEvaluation,deliveryFacts} from '../feedback-development/evaluate.mjs';
import {privateJSON} from '../support/output-files.mjs';
import {tasks,campaignFor} from './suite.mjs';
export function summarizePairs(rows) {
  return tasks.map(t=>{
    const a=rows.filter(r=>r.task===t.id&&r.arm==='control'),b=rows.filter(r=>r.task===t.id&&r.arm==='candidate');
    return {task:t.id,result:a.length===1&&b.length===1&&[a[0],b[0]].every(r=>r.status==='completed'&&r.evaluationProven&&typeof r.R==='boolean'&&typeof r.Q==='boolean')?(a[0].Q===b[0].Q?'tie':b[0].Q?'win':'loss'):'unknown'};
  });
}
export async function report(root) {
  const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json'))),rows=[];
  for(const attempt of f.attempts) {
    const out=path.join(root,'runs',attempt.task+'-'+attempt.arm),task=tasks.find(t=>t.id===attempt.task),errors=[];
    const read=file=>{try{return JSON.parse(fs.readFileSync(path.join(out,file)));}catch{return null;}};
    async function grade(patch,file) {
      if(!fs.existsSync(path.join(out,file)))await evaluatePatch({task,patch,output:path.join(out,file),toolchain:f.toolchain});
      const r=readEvaluation({task,patch,output:path.join(out,file),executionImage:f.executionImage});
      if(!r.proven)errors.push(r.reason);return r.proven?r.result:null;
    }
    const runtime=read('result.json'),requests=read('provider-metadata.json'),stop=read('stop-verification.json'),capture=read('patch-capture.json');
    const dirs=fs.existsSync(path.join(out,'task-artifacts'))?fs.readdirSync(path.join(out,'task-artifacts')).filter(n=>fs.existsSync(path.join(out,'task-artifacts',n,'result.json'))):[];
    const prefix=dirs.length===1?path.join('task-artifacts',dirs[0]):null,workflow=prefix?read(path.join(prefix,'result.json')):null;
    let final=null,initial=null,observations=[],stages=[];
    if(fs.existsSync(path.join(out,'model.patch')))final=await grade(fs.readFileSync(path.join(out,'model.patch')),'independent');
    if(prefix&&fs.existsSync(path.join(out,prefix,'D0.patch')))initial=await grade(fs.readFileSync(path.join(out,prefix,'D0.patch')),'initial-independent');
    if(prefix)observations=fs.readdirSync(path.join(out,prefix)).filter(n=>/^D\d+-observations.json$/.test(n)).sort().map(n=>({stage:n,...read(path.join(prefix,n))}));
    for(const observation of observations){const stage=observation.stage.split('-')[0],file=path.join(out,prefix,stage+'.patch');if(fs.existsSync(file)){const scored=stage==='D0'?initial:await grade(fs.readFileSync(file),'stage-'+stage+'-independent');stages.push({stage,R:scored?.R??null,evaluationProven:!!scored,obligations:scored?.obligations??[]});}}
    const facts=deliveryFacts({runtime,capture,stop,requests,workflow,nativeEvidence:read('native-evidence.json'),patchApplied:final?.patchApplied===true});
    const forwarded=requests?.filter(r=>r.forwarded),known=forwarded?.filter(r=>r.usage)??[];
    const knownTokens=Object.fromEntries(['input_tokens','output_tokens','cached_tokens','reasoning_tokens'].map(k=>[k,known.length&&known.every(r=>Number.isFinite(r.usage[k]))?known.reduce((n,r)=>n+r.usage[k],0):null]));
    const delivered=observations.slice(0,workflow?.repairs??0).filter(o=>o.compatReplay?.status==='different');
    rows.push({...attempt,status:!fs.existsSync(out)?'not_started':!runtime?'unknown':'completed',R:final?.R??null,obligations:final?.obligations??[],stages,evaluationProven:!!final,initialR:initial?.R??null,initialEvaluationProven:!!initial,...facts,Q:final?facts.delivery&&final.R:null,requests:forwarded?.length??null,requestsWithoutUsage:forwarded?forwarded.length-known.length:null,knownTokens,tokens:forwarded?.length===known.length?knownTokens:null,money:'unknown',taskElapsedMs:runtime?.executionElapsedMs??null,preparationElapsedMs:runtime?.preparationElapsedMs??null,evaluationElapsedMs:final?.evaluationElapsedMs??null,cleanupElapsedMs:runtime?.cleanupElapsedMs??null,probeElapsedMs:observations.reduce((n,o)=>n+(o.compatReplay?.elapsedMs??0),0),newDifferencesDelivered:delivered.reduce((n,o)=>n+o.compatReplay.differences.length,0),probeObservations:observations.map(o=>({stage:o.stage,status:o.compatReplay?.status??'disabled',snapshotSha256:o.snapshotSha256,differences:o.compatReplay?.differences??[],limits:o.compatReplay?.limits??[]})),errors});
  }
  const pairs=summarizePairs(rows);
  const result={suite:campaignFor(f.runId).runId,usageKind:f.experimentKind==='fixture'?'synthetic':'provider-reported',rows,pairs,...Object.fromEntries(['win','loss','tie','unknown'].map(k=>[k,pairs.filter(p=>p.result===k).length])),money:'unknown'};
  privateJSON(path.join(root,'report.json'),result);return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await report(process.argv[2])));
