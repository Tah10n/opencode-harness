import fs from 'node:fs';import path from 'node:path';
const root=path.resolve('local/native-command-hints-comparison/batch'),f=JSON.parse(fs.readFileSync(root+'/freeze.json'));
const read=p=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null,rows=[];
for(const a of f.attempts){
 const d=root+'/runs/'+a.task+'-'+a.arm,started=read(d+'/started.json');
 if(!started){rows.push({...a,source:undefined,status:'not_started',Q:null,T:null,D:null,providerRequests:0,knownUsage:null,unknownUsageRequests:0,elapsedMs:null});continue;}
 const requests=read(d+'/provider-metadata.json')??[],result=read(d+'/result.json'),stop=read(d+'/stop-verification.json'),completed=read(d+'/completed.json'),native=read(d+'/native-evidence.json');
 const sent=requests.filter(r=>r.forwarded),usage=sent.filter(r=>r.usage);const knownUsage={},usageFieldCoverage={};for(const k of ['input_tokens','output_tokens','total_tokens','cached_tokens','reasoning_tokens']){const present=usage.filter(r=>Number.isFinite(r.usage[k]));knownUsage[k]=present.length?present.reduce((n,r)=>n+r.usage[k],0):null;usageFieldCoverage[k]=present.length;}
 const artifacts=d+'/candidate/.git/harness-task',names=fs.existsSync(artifacts)?fs.readdirSync(artifacts):[],artifact=names.length===1?artifacts+'/'+names[0]:null;
 const workflow=artifact?read(artifact+'/result.json'):null,hint=artifact?read(artifact+'/command-hint.json'):null;
 const T=!!(result?.nativeCompleted&&result?.termination?.terminationVerified&&workflow?.termination?.verified&&artifact&&fs.existsSync(artifact+'/terminal.patch')&&stop?.relayRemoved&&stop?.activeProviderHandlers===0);
 rows.push({...a,source:undefined,status:completed?'locally_stopped':'interrupted',T,workflowStatus:workflow?.status??null,providerRequests:sent.length,relayRequests:requests.length,auxiliaryRequests:sent.filter(r=>r.requestKind==='title').length,knownUsage,usageFieldCoverage,knownUsageRequests:usage.length,unknownUsageRequests:sent.length-usage.length,serverOutcomeUnknownRequests:sent.filter(r=>r.serverCompletion==='unknown').length,nativeTools:native?.tools.length??null,authorTools:native?.tools.filter(t=>t.data.tool!=='harness_task').length??null,elapsedMs:result?.elapsedMs??null,slotWallMs:completed?Date.parse(completed.at)-Date.parse(started.at):null,hintCost:hint?.cost??null,hintStatus:hint?.status??null,dependencyIntegrity:read(d+'/session/dependency-integrity.json'),stop});
}
const usage={};for(const k of ['input_tokens','output_tokens','total_tokens','cached_tokens','reasoning_tokens'])usage[k]=rows.reduce((n,r)=>n+(r.knownUsage?.[k]??0),0);
const totals={taskRuns:rows.filter(r=>r.status!=='not_started').length,providerRequests:rows.reduce((n,r)=>n+r.providerRequests,0),knownUsage:usage,unknownUsageRequests:rows.reduce((n,r)=>n+r.unknownUsageRequests,0),cacheAndReasoningAreSubsets:true,noDollarEstimate:true};
fs.writeFileSync(root+'/accounting.json',JSON.stringify({rows,totals},null,2)+'\n');console.log(JSON.stringify({totals,rows:rows.map(({task,arm,T,providerRequests,unknownUsageRequests})=>({task,arm,T,providerRequests,unknownUsageRequests}))},null,2));
