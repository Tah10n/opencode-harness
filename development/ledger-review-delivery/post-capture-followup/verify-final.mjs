// Scoped final checks; no native sessions, provider requests or controller matrix.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {get,hash,save} from '../chain.mjs';
const dev='development/ledger-review-delivery/post-capture-followup';
const frozen=get(dev+'/manifest.json');
for(const [file,sha]of Object.entries(frozen.files))assert.equal(hash(fs.readFileSync(file)),sha,file);
const files=execFileSync('git',['diff','51f10ba2','--name-only'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.ok(files.every(f=>f.startsWith('development/ledger-review-delivery/')));
for(const file of ['REPORT.md','manifest.json','D0.patch','M.partial.patch','assessment.json','delivery-receipt.json','costs.json','raw-probes.json'])assert.equal(hash(fs.readFileSync('development/ledger-review-delivery/'+file)),hash(execFileSync('git',['show','51f10ba2:development/ledger-review-delivery/'+file])));
assert.equal(execFileSync('git',['diff','f98a9612','--','lib','prompts','development/polybench-pilot/capture.mjs','development/native-task-ab/provider-recording.mjs','development/native-task-ab/run-comparison.mjs'],{encoding:'utf8'}),'');
const cost=get(dev+'/costs.json'),receipts=get(dev+'/recording-receipts.json');
const inputs=get(dev+'/model-input-verification.json');assert.equal(inputs.actualRecordedRequestsVerified,true);assert.equal(inputs.reviewSha256,hash(fs.readFileSync(dev+'/R.md')));for(const r of inputs.requests)if(['reviewer','author'].includes(r.role)){assert.ok(r.fullOriginalTask&&r.fullEnvironment);if(r.role==='author')assert.equal(r.verbatimReview,true);}
assert.equal(Object.values(cost.followup.requestRoles).reduce((n,r)=>n+r.requests,0),cost.followup.totalRequests);
const cleanup=get(dev+'/cleanup.json');assert.equal(cleanup.completed,true);assert.equal(hash(fs.readFileSync(cleanup.archive.path)),cleanup.archive.sha256);for(const p of cleanup.removed)assert.ok(!fs.existsSync(p));
for(const stage of ['R','F']){
 const rows=receipts.stages[stage]??[],s=cost.followup.stages[stage];assert.equal(rows.filter(r=>r.forwarded).length,s.requests);
 if(s.status==='not_started')continue;
 for(const key of ['input_tokens','output_tokens','cached_tokens','reasoning_tokens'])assert.equal(rows.reduce((n,r)=>n+(r.usage?.[key]??0),0),s.usage[key]);
 assert.equal(rows.filter(r=>r.forwarded&&!r.usage).length,s.requestsWithoutUsage);
 assert.ok(s.usage.cached_tokens<=s.usage.input_tokens);assert.ok(s.usage.reasoning_tokens<=s.usage.output_tokens);
}
assert.equal(cost.combined.requests,76+cost.followup.totalRequests);
for(const k of ['input_tokens','output_tokens','cached_tokens','reasoning_tokens'])assert.equal(cost.combined.usage[k],cost.historicalA.usage[k]+cost.followup.usage[k]);
const d=get(dev+'/delivery-receipt.json'),a=get(dev+'/assessment.json');assert.equal(d.T_followup,d.summary.status==='finished');assert.ok([true,false,'unknown'].includes(a.Q_followup));assert.equal(a.T_followup,d.T_followup);assert.equal(a.D_followup,a.Q_followup===false||a.T_followup===false?false:a.Q_followup==='unknown'?'unknown':true);
if(d.T_followup){assert.deepEqual(d.summary.results.map(r=>r.stage),['R','F']);assert.equal(d.summary.globalDeadline-d.summary.globalStart,1800000);assert.ok(d.summary.finishedAt<d.summary.globalDeadline);for(const stage of ['R','F']){assert.equal(d.stages[stage].nativeCompleted,true);assert.ok(receipts.stages[stage].every(r=>!r.forwarded||(r.serverCompletion==='completed'&&r.evidenceComplete)));assert.equal(d.stages[stage].stop.captureSaved,true);assert.equal(d.stages[stage].stop.relayRemoved,true);}}
if(d.finalPatch){assert.equal(hash(fs.readFileSync(dev+'/M.patch')),d.finalPatch.sha256);assert.equal(hash(fs.readFileSync(dev+'/D0-to-final.patch')),d.finalPatch.deltaSha256);assert.equal(d.finalPatch.fullTreeMatchesActual,true);}
if(fs.existsSync(dev+'/raw-probes.json')){const raw=get(dev+'/raw-probes.json');assert.equal(raw.summary.tests,23);assert.equal(raw.summary.pass+raw.summary.fail+raw.summary.skipped,23);}
for(const file of ['development/ledger-review-delivery/chain.mjs','development/ledger-review-delivery/operation.mjs','development/ledger-review-delivery/resolve-native-result.mjs',...fs.readdirSync(dev).filter(n=>n.endsWith('.mjs')).map(n=>dev+'/'+n)])execFileSync(process.execPath,['--check',file]);
// Exact patch artifacts contain mandatory space-prefixed blank context lines.
for(const name of ['M.patch','D0-to-final.patch'])for(const line of fs.readFileSync(dev+'/'+name,'utf8').split('\n'))if(line.startsWith('+')&&!line.startsWith('+++'))assert.ok(!/[ \t]+$/.test(line.slice(1)),name+': added source whitespace');
execFileSync('git',['diff','--check','51f10ba2','--','development/ledger-review-delivery',':(exclude)'+dev+'/M.patch',':(exclude)'+dev+'/D0-to-final.patch']);
fs.writeFileSync(dev+'/final-verification.json',JSON.stringify({passed:true,frozenFiles:Object.keys(frozen.files).length,historicalEvidenceUnchanged:true,productRuntimeUnchanged:true,usageArithmetic:true,actualModelInputs:true,cleanupArchiveAndRemovals:true,patchHashes:!!d.finalPatch,syntax:true,scopedWhitespace:true,exactPatchContextPreserved:true,addedPatchSourceWhitespaceChecked:true,controllerSuite:'not repeated; runtime unchanged',modelQuality:'only independent acceptance establishes Q'},null,2)+'\n');console.log('PASS scoped frozen-input, arithmetic, syntax, patch hash and whitespace verification');
