import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {privateJSON} from '../support/output-files.mjs';
import {tasks,config} from './suite.mjs';
import {evaluatePatch,readEvaluation,deliveryFacts} from './evaluate.mjs';

async function evaluationFor(out,task,f,{toolchain,evaluate},environmentErrors,unknownResults) {
  const patch=fs.readFileSync(path.join(out,'model.patch'));
  const candidates=fs.readdirSync(out).filter(name=>/^independent(?:-[a-f0-9-]{36})?$/.test(name));
  let diagnostic=null;
  for(const name of candidates) {
    const checked=readEvaluation({task,patch,output:path.join(out,name),executionImage:f.executionImage});
    if(checked.proven)return {...checked.result,evaluationProven:true,diagnosticR:checked.result.R};
    diagnostic=checked;
  }
  if(evaluate) {
    const target=path.join(out,fs.existsSync(path.join(out,'independent'))?'independent-'+randomUUID():'independent');
    try{await evaluatePatch({task,patch,output:target,toolchain:toolchain??f.toolchain});}
    catch(error){environmentErrors.push({phase:'independent_evaluation',message:error.message});}
    const checked=readEvaluation({task,patch,output:target,executionImage:f.executionImage});
    if(checked.proven)return {...checked.result,evaluationProven:true,diagnosticR:checked.result.R};
    diagnostic=checked;
  }
  const reason=diagnostic?.reason??'Independent evaluation unavailable';
  unknownResults.push(reason);
  return {...diagnostic?.result,R:null,diagnosticR:diagnostic?.result?.R??null,evaluationProven:false,patchApplied:false,reason,obligations:diagnostic?.result?.obligations??[]};
}

export function summarize(rows) {
  const pairs=tasks.map(task=>{
    const matching=rows.filter(r=>r.task===task.id),pair=Object.fromEntries(matching.map(r=>[r.arm,r]));
    if(matching.length!==2||!pair.direct||!pair.D||![pair.direct,pair.D].every(row=>row.evaluationProven===true&&typeof row.R==='boolean'&&typeof row.Q==='boolean'))return {task:task.id,result:'unknown'};
    return {task:task.id,result:pair.D.Q===pair.direct.Q?'tie':pair.D.Q?'candidate_win':'candidate_loss'};
  });
  const wins=pairs.filter(p=>p.result==='candidate_win').length,losses=pairs.filter(p=>p.result==='candidate_loss').length,ties=pairs.filter(p=>p.result==='tie').length,unknown=pairs.filter(p=>p.result==='unknown').length;
  return {kind:'development-screening',candidateWins:wins,candidateLosses:losses,ties,unknownPairs:unknown,deltaQPercentagePoints:unknown?null:100*(wins-losses)/8,pairs,limitation:'Eight development tasks; no independent confirmation or statistically persuasive effectiveness claim.'};
}
export async function report(root,{toolchain,evaluate=true}={}) {
  const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json'))),rows=[];
  for(const attempt of f.attempts) {
    const out=path.join(root,'runs',attempt.task+'-'+attempt.arm),task=tasks.find(t=>t.id===attempt.task);
    if(!task)throw Error('Unknown task');
    const environmentErrors=[],unknownResults=[];
    const read=file=>{try{return JSON.parse(fs.readFileSync(path.join(out,file)));}catch(error){unknownResults.push(file+': '+error.code);return null;}};
    const runtime=read('result.json'),requests=read('provider-metadata.json');
    if(fs.existsSync(path.join(out,'error.json')))environmentErrors.push(read('error.json'));
    const forwarded=Array.isArray(requests)?requests.filter(r=>r.forwarded):null,known=forwarded?.filter(r=>r.usage)??[],unknown=forwarded?.filter(r=>!r.usage).length??null;
    const knownTokens=Object.fromEntries(['input_tokens','output_tokens','cached_tokens','reasoning_tokens'].map(k=>[k,known.length&&known.every(r=>Number.isFinite(r.usage[k]))?known.reduce((n,r)=>n+r.usage[k],0):null]));
    const tokens=Object.fromEntries(Object.entries(knownTokens).map(([k,value])=>[k,unknown===0?value:null]));
    const accounting={requests:forwarded?.length??null,requestsWithoutUsage:unknown,tokens,knownTokens,money:'unknown',usageKind:f.experimentKind==='fixture'?'synthetic':'provider-reported'};
    if(!runtime) {rows.push({...attempt,R:null,delivery:null,Q:null,internalStatus:null,corrections:null,...accounting,environmentErrors,unknownResults,status:fs.existsSync(out)?'environment_or_unknown':'not_started'});continue;}
    const capture=read('patch-capture.json'),stop=read('stop-verification.json'),nativeEvidence=read('native-evidence.json');
    const artifacts=path.join(out,'task-artifacts');
    const reports=fs.existsSync(artifacts)?fs.readdirSync(artifacts).filter(id=>fs.existsSync(path.join(artifacts,id,'result.json'))):[];
    const workflow=reports.length===1?read(path.join('task-artifacts',reports[0],'result.json')):null;
    let scoring;
    try{scoring=await evaluationFor(out,task,f,{toolchain,evaluate},environmentErrors,unknownResults);}
    catch(error){environmentErrors.push({phase:'independent_evaluation',message:error.message});}
    scoring??={R:null,patchApplied:false,reason:'Independent evaluation unavailable',obligations:[]};
    const facts=deliveryFacts({runtime,capture,stop,requests,workflow,nativeEvidence,patchApplied:scoring.evaluationProven===true&&scoring.patchApplied});
    if(scoring.R===null)unknownResults.push(scoring.reason);
    if(!facts.authorCompleted)unknownResults.push('Normal author completion unproven');
    if(!facts.providerConfirmed)unknownResults.push('Provider completion or forwarding unproven');
    if(unknown)unknownResults.push('Provider usage missing for '+unknown+' requests');
    const duration=(a,b)=>stop?.timing?.[a]&&stop?.timing?.[b]?stop.timing[b].monotonicMs-stop.timing[a].monotonicMs:null;
    rows.push({slot:attempt.slot,task:attempt.task,arm:attempt.arm,R:scoring.R,diagnosticR:scoring.diagnosticR??null,evaluationProven:scoring.evaluationProven===true,...facts,Q:facts.delivery?scoring.R:false,...accounting,taskElapsedMs:runtime.executionElapsedMs,preparationElapsedMs:runtime.preparationElapsedMs,evaluationElapsedMs:scoring.evaluationElapsedMs,evaluationCleanupElapsedMs:scoring.cleanupElapsedMs,cleanupElapsedMs:duration('cleanupStarted','cleanupFinished'),environmentErrors,unknownResults,obligations:scoring.obligations});
  }
  const result={suite:config.suite,experimentKind:f.experimentKind,model:f.model,variant:f.variant,money:'unknown',rows,comparison:summarize(rows)};
  privateJSON(path.join(root,'report.json'),result);return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const root=process.argv[2];if(!root||!path.isAbsolute(root))throw Error('Absolute result root required');
  console.log(JSON.stringify(await report(root,{evaluate:!process.argv.includes('--read-only')})));
}
