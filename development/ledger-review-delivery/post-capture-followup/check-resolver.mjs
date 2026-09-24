import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {resolveNativeResult} from '../resolve-native-result.mjs';
import {nextAllowed,hash,get,save} from '../chain.mjs';
const root='local/ledger-review-delivery/post-capture-followup',out=root+'/history/real/A/runs/account-switch-ledger-A';
const native=get(out+'/native-evidence.json'),capture=get(out+'/patch-capture.json'),artifactRoot=path.resolve(out+'/task-artifacts');
const args={native,capture,artifactRoot},call=native.tools.find(t=>t.data.tool==='harness_task'),receipt=JSON.parse(call.data.state.output);
assert.throws(()=>receipt.stages.map(s=>s.role),TypeError);
const result=resolveNativeResult(args);assert.deepEqual(result.workflow.stages.map(s=>s.role),['author']);assert.equal(result.workflow.repairs,0);
assert.equal(hash(result.patch),hash(fs.readFileSync('development/ledger-review-delivery/D0.patch')));
assert.equal(hash(result.patch),hash(fs.readFileSync('development/ledger-review-delivery/M.partial.patch')));
const tmp=fs.mkdtempSync(path.resolve(root+'/resolver-controls-')),results=[];
const good={pause:null,result:{nativeCompleted:true},stop:{terminationVerified:true,captureSaved:true,relayRemoved:true,forwardingClosed:true,activeProviderHandlers:0,providerServerStateMayRemainUnknown:false},recordings:[{forwarded:true,recording:{evidenceComplete:true},serverCompletion:'completed'}],now:1,deadline:2};
assert.ok(nextAllowed(good));
try{
 for(const name of ['missing','foreign-run','corrupt-json','contradiction','cancelled','missing-repairs','wrong-snapshot','wrong-session']) {
  const copy=tmp+'/'+name;fs.cpSync(artifactRoot,copy,{recursive:true});const n=structuredClone(native),c=n.tools.find(t=>t.data.tool==='harness_task');let r=JSON.parse(c.data.state.output);const file=copy+'/'+path.basename(r.artifacts)+'/result.json';
  const originalHash=hash(fs.readFileSync(artifactRoot+'/'+path.basename(receipt.artifacts)+'/result.json'));
  if(name==='missing')fs.unlinkSync(file);
  if(name==='foreign-run')r.artifacts=r.artifacts.replace(/[a-f0-9-]{36}$/,'00000000-0000-0000-0000-000000000000');
  if(name==='corrupt-json')fs.writeFileSync(file,'{');
  if(name==='contradiction')r.repairs=1;
  if(name==='missing-repairs'){const f=get(file);delete f.repairs;fs.writeFileSync(file,JSON.stringify(f));}
  if(name==='wrong-snapshot'){const f=get(file);f.patches.at(-1).snapshotSha256='0'.repeat(64);fs.writeFileSync(file,JSON.stringify(f));}
  if(name==='wrong-session')r.sessions.author='foreign';
  c.data.state.output=JSON.stringify(r);const abort=new AbortController();if(name==='cancelled')abort.abort();
  let error;try{resolveNativeResult({native:n,capture,artifactRoot:copy,signal:abort.signal});}catch(e){error=e;}
  assert.equal(error?.kind,'evidence_incomplete',name);
  assert.equal(nextAllowed({...good,pause:{kind:error.kind},stop:{...good.stop,captureSaved:false,relayRemoved:false}}),false);
  assert.equal(hash(fs.readFileSync(artifactRoot+'/'+path.basename(receipt.artifacts)+'/result.json')),originalHash);
  results.push({name,evidenceIncomplete:true,nextDispatch:false,originalEvidencePreserved:true});
 }
 // Full structured receipt uses its stages; no missing-data repair defaults.
 const full=structuredClone(native);full.tools.find(t=>t.data.tool==='harness_task').data.state.output=JSON.stringify({...result.workflow,notice:receipt.notice});
 assert.equal(resolveNativeResult({...args,native:full}).workflow.stages.length,1);
 const records=get(out+'/provider-metadata.json');assert.equal(records.length,76);assert.ok(records.every(r=>r.forwarded&&r.serverCompletion==='completed'&&r.recording.evidenceComplete));
 const safe={historicalFailureReproduced:true,realFullArtifactResolved:true,proof:result.proof,stages:result.workflow.stages,repairs:result.workflow.repairs,controls:results,historicalCompletedResponses:records.length,fullStructuredForm:true};
 const dest='development/ledger-review-delivery/post-capture-followup/resolver-verification.json';fs.writeFileSync(dest,JSON.stringify(safe,null,2)+'\n');console.log('PASS: historical large result, full form and eight fail-closed controls');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
