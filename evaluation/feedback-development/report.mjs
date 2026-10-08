import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createHash} from 'node:crypto';
import {privateJSON} from '../support/output-files.mjs';
import {tasks,suiteFor,calibrationTasks} from './suite.mjs';
import {evaluatePatch,readEvaluation,deliveryFacts} from './evaluate.mjs';

async function evaluationFor(out,task,f,{toolchain,evaluate,patchFile='model.patch',prefix='independent'},environmentErrors,unknownResults) {
  const patch=fs.readFileSync(path.join(out,patchFile));
  const candidates=fs.readdirSync(out).filter(name=>new RegExp('^'+prefix+'(?:-[a-f0-9-]{36})?$').test(name));
  let diagnostic=null;
  for(const name of candidates) {
    const checked=readEvaluation({task,patch,output:path.join(out,name),executionImage:f.executionImage});
    if(checked.proven)return {...checked.result,evaluationProven:true,diagnosticR:checked.result.R};
    diagnostic=checked;
  }
  if(evaluate) {
    const target=path.join(out,fs.existsSync(path.join(out,prefix))?prefix+'-'+randomUUID():prefix);
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
  const spec=suiteFor(f);
  for(const attempt of f.attempts) {
    const out=path.join(root,'runs',attempt.task+'-'+attempt.arm),task=spec.tasks.find(t=>t.id===attempt.task);
    if(!task)throw Error('Unknown task');
    const environmentErrors=[],unknownResults=[];
    const read=file=>{try{return JSON.parse(fs.readFileSync(path.join(out,file)));}catch(error){unknownResults.push(file+': '+error.code);return null;}};
    const runtime=read('result.json'),requests=read('provider-metadata.json');
    if(fs.existsSync(path.join(out,'error.json')))environmentErrors.push(read('error.json'));
    const forwarded=Array.isArray(requests)?requests.filter(r=>r.forwarded):null,known=forwarded?.filter(r=>r.usage)??[],unknown=forwarded?.filter(r=>!r.usage).length??null;
    const knownTokens=Object.fromEntries(['input_tokens','output_tokens','cached_tokens','reasoning_tokens'].map(k=>[k,known.length&&known.every(r=>Number.isFinite(r.usage[k]))?known.reduce((n,r)=>n+r.usage[k],0):null]));
    const tokens=Object.fromEntries(Object.entries(knownTokens).map(([k,value])=>[k,unknown===0?value:null]));
    const accounting={requests:forwarded?.length??null,requestsWithoutUsage:unknown,tokens,knownTokens,money:'unknown',usageKind:f.experimentKind==='fixture'?'synthetic':'provider-reported'};
    if(!runtime) {
      let scoring=null;
      if(fs.existsSync(path.join(out,'model.patch'))) {
        try {scoring=await evaluationFor(out,task,f,{toolchain,evaluate},environmentErrors,unknownResults);}
        catch(error){environmentErrors.push({phase:'independent_evaluation',message:error.message});}
        unknownResults.push('Native completion unavailable; retained full partial patch evaluated independently');
      }
      rows.push({...attempt,R:scoring?.R??null,diagnosticR:scoring?.diagnosticR??null,evaluationProven:scoring?.evaluationProven??false,delivery:scoring?false:null,Q:scoring&&scoring.R!==null?false:null,internalStatus:null,corrections:null,...accounting,evaluationElapsedMs:scoring?.evaluationElapsedMs??null,obligations:scoring?.obligations??[],environmentErrors,unknownResults,status:fs.existsSync(out)?'environment_or_unknown':'not_started'});continue;
    }
    const capture=read('patch-capture.json'),stop=read('stop-verification.json'),nativeEvidence=read('native-evidence.json');
    const artifacts=path.join(out,'task-artifacts');
    const reports=fs.existsSync(artifacts)?fs.readdirSync(artifacts).filter(id=>fs.existsSync(path.join(artifacts,id,'result.json'))):[];
    const workflow=reports.length===1?read(path.join('task-artifacts',reports[0],'result.json')):null;
    let scoring;
    try{scoring=await evaluationFor(out,task,f,{toolchain,evaluate},environmentErrors,unknownResults);}
    catch(error){environmentErrors.push({phase:'independent_evaluation',message:error.message});}
    scoring??={R:null,patchApplied:false,reason:'Independent evaluation unavailable',obligations:[]};
    const facts=deliveryFacts({runtime,capture,stop,requests,workflow,nativeEvidence,patchApplied:scoring.evaluationProven===true&&scoring.patchApplied,mode:attempt.arm==='P'?'plain':'task'});
    let initial={};
    if(attempt.arm==='H1'&&workflow&&reports.length===1) {
      const original=path.join(artifacts,reports[0],'D0.patch'),final=path.join(out,'model.patch');
      if(fs.existsSync(original)) {
        const d0=fs.readFileSync(original),patchChanged=!d0.equals(fs.readFileSync(final));
        let checked=scoring;
        if(patchChanged){const retained=path.join(out,'D0.patch');if(fs.existsSync(retained)&&!fs.readFileSync(retained).equals(d0))throw Error('Initial patch evidence changed');if(!fs.existsSync(retained))fs.writeFileSync(retained,d0,{flag:'wx',mode:0o600});checked=await evaluationFor(out,task,f,{toolchain,evaluate,patchFile:'D0.patch',prefix:'initial-independent'},environmentErrors,unknownResults);}
        initial={initialR:checked.R,initialEvaluationProven:checked.evaluationProven===true,initialPatchSha256:createHash('sha256').update(d0).digest('hex'),patchChanged,correctionReasons:workflow.observations?.correctionReasons??[]};
      }else initial={initialR:null,initialEvaluationProven:false,patchChanged:null,correctionReasons:workflow.observations?.correctionReasons??[]};
    }
    if(scoring.R===null)unknownResults.push(scoring.reason);
    if(!facts.authorCompleted)unknownResults.push('Normal author completion unproven');
    if(!facts.providerConfirmed)unknownResults.push('Provider completion or forwarding unproven');
    if(unknown)unknownResults.push('Provider usage missing for '+unknown+' requests');
    const duration=(a,b)=>stop?.timing?.[a]&&stop?.timing?.[b]?stop.timing[b].monotonicMs-stop.timing[a].monotonicMs:null;
    rows.push({slot:attempt.slot,task:attempt.task,arm:attempt.arm,R:scoring.R,diagnosticR:scoring.diagnosticR??null,evaluationProven:scoring.evaluationProven===true,...facts,...initial,Q:facts.delivery?scoring.R:false,...accounting,taskElapsedMs:runtime.executionElapsedMs,preparationElapsedMs:runtime.preparationElapsedMs,evaluationElapsedMs:scoring.evaluationElapsedMs,evaluationCleanupElapsedMs:scoring.cleanupElapsedMs,cleanupElapsedMs:duration('cleanupStarted','cleanupFinished'),environmentErrors,unknownResults,obligations:scoring.obligations});
  }
  const result={suite:spec.config.suite,experimentKind:f.experimentKind,model:f.model,variant:f.variant,money:'unknown',rows,comparison:f.experimentKind==='feedback-calibration'?summarizeCalibration(rows):summarize(rows)};
  privateJSON(path.join(root,'report.json'),result);return result;
}
export function summarizeCalibration(rows) {
  const proven=r=>r?.evaluationProven===true&&typeof r.R==='boolean'&&typeof r.Q==='boolean';
  const contrasts={};
  for(const [base,candidate] of [['P','H0'],['P','H1'],['H0','H1']]) {
    const pairs=calibrationTasks.map(task=>{
      const a=rows.filter(r=>r.task===task.id&&r.arm===base),b=rows.filter(r=>r.task===task.id&&r.arm===candidate);
      if(a.length!==1||b.length!==1||!proven(a[0])||!proven(b[0]))return {task:task.id,result:'unknown'};
      return {task:task.id,result:a[0].Q===b[0].Q?'tie':b[0].Q?'win':'loss'};
    });
    const count=k=>pairs.filter(p=>p.result===k).length;
    contrasts[candidate+'_vs_'+base]={wins:count('win'),losses:count('loss'),ties:count('tie'),unknown:count('unknown'),deltaQPercentagePoints:count('unknown')?null:100*(count('win')-count('loss'))/6,pairs};
  }
  const plain=rows.filter(r=>r.arm==='P'&&proven(r)),d=rows.filter(r=>r.arm==='H1'),initial=d.filter(r=>proven(r)&&r.initialEvaluationProven===true&&typeof r.initialR==='boolean');
  return {kind:'calibration',plainProven:plain.length,plainCorrect:plain.filter(r=>r.R).length,plainFailures:plain.filter(r=>!r.R).length,contrasts,D:{activated:d.filter(r=>r.corrections>0).length,changedPatch:d.filter(r=>r.patchChanged===true).length,initialProven:initial.length,improvedR:initial.filter(r=>!r.initialR&&r.R).length,worsenedR:initial.filter(r=>r.initialR&&!r.R).length},limitation:'Six known calibration mini-projects, one attempt per mode: descriptive contrasts only, no independent confirmation or equivalence claim.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const root=process.argv[2];if(!root||!path.isAbsolute(root))throw Error('Absolute result root required');
  console.log(JSON.stringify(await report(root,{evaluate:!process.argv.includes('--read-only')})));
}
