// Artifact-only accounting/export after R/F stop. Never launches a model.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {get,hash,save,git,init,apply} from '../chain.mjs';import {projectManifest} from '../patch-integrity.mjs';
const dev='development/ledger-review-delivery/post-capture-followup',root=path.resolve('local/ledger-review-delivery/post-capture-followup/real');
const summary=get(root+'/chain-result.json'),usageKeys=['input_tokens','output_tokens','cached_tokens','reasoning_tokens'];
const sum=records=>Object.fromEntries(usageKeys.map(k=>[k,records.reduce((n,r)=>n+(r.usage?.[k]??0),0)]));
const stages={},receipts={};let all=[];
for(const stage of ['R','F']){
 const out=root+'/'+stage+'/runs/account-switch-ledger-'+stage;
 if(!fs.existsSync(out)){stages[stage]={status:'not_started',requests:0};continue;}
 const records=get(out+'/provider-metadata.json');all.push(...records);
 receipts[stage]=records.map(r=>{
  const hashes={};for(const k of ['response','clientRequest','upstreamRequest']){const info=r.recording?.[k];if(!info?.file)continue;const bytes=fs.readFileSync(out+'/'+info.file);assert.equal(bytes.length,info.size);assert.equal(hash(bytes),info.sha256);hashes[k]=info.sha256;}
  return {index:r.requestIndex,kind:r.requestKind,forwarded:r.forwarded,status:r.status??null,serverCompletion:r.serverCompletion??null,evidenceComplete:r.recording?.evidenceComplete===true,usage:r.usage,hashes};
 });
 const native=fs.existsSync(out+'/native-evidence.json')?get(out+'/native-evidence.json'):null,finish=fs.existsSync(out+'/session/finished.json')?get(out+'/session/finished.json'):null;
 const result=fs.existsSync(out+'/result.json')?get(out+'/result.json'):null;
 const stop=get(out+'/stop-verification.json');
 stages[stage]={status:summary.stages[stage],requests:records.filter(r=>r.forwarded).length,requestsWithoutUsage:records.filter(r=>r.forwarded&&!r.usage).length,usage:sum(records),toolCalls:native?.tools.length??null,tools:native?Object.fromEntries([...new Set(native.tools.map(t=>t.data.tool))].map(k=>[k,native.tools.filter(t=>t.data.tool===k).length])):null,sessions:native?.sessions.length??null,nativeElapsedMs:finish?.elapsedMs??result?.elapsedMs??null,executionElapsedMs:finish?.executionElapsedMs??result?.executionElapsedMs??null,stop,nativeCompleted:result?.nativeCompleted??false};
 if(stage==='R'){
  const inv=records.filter(r=>r.forwarded).map(r=>{const b=get(out+'/'+r.recording.upstreamRequest.file);return {index:r.requestIndex,names:(b.tools??[]).map(t=>t.name).sort(),afterToolResult:(b.input??[]).some(x=>x.type==='function_call_output')};});
  for(const row of inv)if(row.names.length)assert.deepEqual(row.names,['glob','grep','read']);
  save(dev+'/review-inventory.json',{requests:inv,exactInventory:inv.filter(x=>x.names.length).every(x=>JSON.stringify(x.names)===JSON.stringify(['glob','grep','read'])),postToolResultChecked:inv.some(x=>x.afterToolResult&&x.names.length),nativeToolsOnlyAllowed:native?.tools.every(t=>['glob','grep','read'].includes(t.data.tool))??null,unchangedSnapshotCapture:stop.captureSaved});
  if(fs.existsSync(out+'/response.md'))fs.copyFileSync(out+'/response.md',dev+'/R.md',fs.constants.COPYFILE_EXCL);
 }else if(native){
  const texts=fs.existsSync(out+'/native-text.json')?get(out+'/native-text.json'):[];
  const author=native.sessions.find(s=>s.parent_id);const response=texts.filter(x=>x.session_id===author?.id).at(-1)?.data.text;
  if(response)fs.writeFileSync(dev+'/F-response.md',response,{flag:'wx'});
  for(const [from,to]of [['native-result-receipt.json','F-native-receipt.json'],['native-result-resolution.json','F-resolution.json'],['delivery-tree.json','final-files.json'],['delivery-integrity.json','F-integrity.json']])if(fs.existsSync(out+'/'+from))fs.copyFileSync(out+'/'+from,dev+'/'+to,fs.constants.COPYFILE_EXCL);
 }
}
const old=get('development/ledger-review-delivery/costs.json').real;
const usage=sum(all),combined=Object.fromEntries(usageKeys.map(k=>[k,old.usage[k]+usage[k]]));
save(dev+'/recording-receipts.json',{profile:'research-full-v1',allPresentHashesVerified:true,rawRequestsAndStreamsPrivate:true,stages:receipts});
save(dev+'/costs.json',{historicalA:{...old.A,period:'old interrupted pilot; counted once'},followup:{stages,totalRequests:all.filter(r=>r.forwarded).length,requestsWithoutUsage:all.filter(r=>r.forwarded&&!r.usage).length,usage,globalStart:summary.globalStart,globalDeadline:summary.globalDeadline,finishedAt:summary.finishedAt,elapsedMs:summary.globalStart?summary.finishedAt-summary.globalStart:null},combined:{requests:old.totalRequests+all.filter(r=>r.forwarded).length,usage:combined,continuousRun:false},preparation:{newScriptedAttempts:2,newScriptedRequests:132,historicalScriptedRequests:27,realModelRequests:0,syntheticTokensNotModelUsage:true},evaluator:{modelRequests:0,accounting:'separate command receipts'},developingAgent:{excludedFromExperimentUsage:true,usage:'not measured by provider recorder'},money:null,note:'Cached input and reasoning output are included subsets. Known usage only; missing usage remains unknown. Old A and new R/F are separate wall-clock periods.'});
const safeSummary=JSON.parse(JSON.stringify(summary,(_key,value)=>typeof value==='string'&&value.startsWith(process.cwd()+'/')?value.slice(process.cwd().length+1):value));
const delivery={freezeCommit:get(path.dirname(root)+'/freeze-commit.json').commit,summary:safeSummary,stages,finalPatch:null,deliveryApply:'unknown',Q_followup:'unknown',T_followup:summary.status==='finished',D_followup:summary.status==='finished'?'unknown':false};
if(fs.existsSync(root+'/M.patch')){
 for(const [from,to]of [['M.patch','M.patch'],['delta.patch','D0-to-final.patch']])fs.copyFileSync(root+'/'+from,dev+'/'+to,fs.constants.COPYFILE_EXCL);
 assert.deepEqual(projectManifest(root+'/portable'),get(dev+'/final-files.json'));
 delivery.finalPatch={sha256:hash(fs.readFileSync(root+'/M.patch')),deltaSha256:hash(fs.readFileSync(root+'/delta.patch')),fullTreeMatchesActual:true};delivery.deliveryApply=true;
}
else {
 const delta=root+'/F/runs/account-switch-ledger-F/model.patch';
 if(!fs.existsSync(delta)){
  fs.copyFileSync('development/ledger-review-delivery/D0.patch',dev+'/M.partial.patch',fs.constants.COPYFILE_EXCL);
  delivery.partialPatch={sha256:hash(fs.readFileSync(dev+'/M.partial.patch')),basis:'exact historical D0; no F delta captured'};
 } else {
  const target=root+'/partial-final',baseline=path.resolve('local/ledger-review-delivery/baseline');
  fs.cpSync(baseline,target,{recursive:true});init(target);apply(target,path.resolve('development/ledger-review-delivery/D0.patch'));apply(target,delta);git(target,'add','-A');
  const patch=git(target,'diff','--cached','--binary','--full-index','HEAD');fs.writeFileSync(dev+'/M.partial.patch',patch,{flag:'wx'});fs.copyFileSync(delta,dev+'/D0-to-partial.patch',fs.constants.COPYFILE_EXCL);
  const check=root+'/partial-portable';fs.cpSync(baseline,check,{recursive:true});init(check);apply(check,path.resolve(dev+'/M.partial.patch'));assert.deepEqual(projectManifest(check),projectManifest(target));
  const actual=root+'/F/runs/account-switch-ledger-F/delivery-tree.json';let actualMatches=null;if(fs.existsSync(actual)){assert.deepEqual(projectManifest(check),get(actual));actualMatches=true;}
  delivery.partialPatch={sha256:hash(patch),applies:true,fullTreeMatchesActual:actualMatches};
 }
}
save(dev+'/delivery-receipt.json',delivery);
console.log(JSON.stringify({stages:Object.fromEntries(Object.entries(stages).map(([s,v])=>[s,{status:v.status,requests:v.requests}])),usage,fullPatch:delivery.finalPatch}));
