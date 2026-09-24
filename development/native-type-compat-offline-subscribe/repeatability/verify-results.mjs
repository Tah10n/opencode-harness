import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const dev=path.resolve('development/native-type-compat-offline-subscribe/repeatability'),root=path.resolve('local/native-type-compat-offline-subscribe/repeatability'),read=p=>JSON.parse(fs.readFileSync(p)),hash=b=>createHash('sha256').update(b).digest('hex'),r=read(dev+'/RESULTS.json'),f=read(dev+'/frozen-inputs.json'),freeze=read(root+'/freeze.json'),prior=read(dev+'/../frozen-inputs.json');
assert.equal(r.candidate,f.runtimeSha);assert.equal(hash(fs.readFileSync(root+'/freeze.json')),f.freezeSha256);
assert.deepEqual(r.rows.map(x=>[x.slot,x.repetition,x.arm]),[[1,1,'ON'],[2,1,'OFF'],[3,2,'OFF'],[4,2,'ON']]);
assert.equal(f.actualPromptSha256,prior.actualPromptSha256);assert.equal(hash(fs.readFileSync(root+'/inputs/A/TASK.md')),f.actualPromptSha256);
assert.equal(f.model,'openai/gpt-5.6-luna');assert.equal(f.effort,'high');assert.equal(f.budgetMs,1800000);assert.ok(f.preflight.passed&&f.audit.passed);
for(const [p,h] of Object.entries(freeze.files))assert.equal(hash(fs.readFileSync(p)),h,p);
for(const row of r.rows){if(row.status==='not_started'){assert.equal(row.D,null);continue;}
 assert.equal(row.D,row.Q&&row.T);assert.equal(hash(fs.readFileSync(dev+'/'+row.patch.path)),row.patch.sha256);assert.equal(row.requests,row.workRequests+row.titleRequests);
 const totals={input_tokens:0,output_tokens:0,total_tokens:0,cached_tokens:0,reasoning_tokens:0},d=root+'/runs/A-r'+row.repetition+'-'+row.arm;
 for(const q of row.requestsEvidence){assert.equal(q.model,'gpt-5.6-luna');assert.equal(q.effort,'high');if(q.usage)for(const key of Object.keys(totals))totals[key]+=q.usage[key]??0;if(q.requestSha256)assert.equal(hash(fs.readFileSync(d+'/request-'+q.index+'.json')),q.requestSha256);if(q.responseSha256)assert.equal(hash(fs.readFileSync(d+'/response-'+q.index+'.sse')),q.responseSha256);}
 assert.deepEqual(totals,row.knownUsage);assert.equal(totals.total_tokens,totals.input_tokens+totals.output_tokens);assert.ok(totals.cached_tokens<=totals.input_tokens&&totals.reasoning_tokens<=totals.output_tokens);
 for(const i of row.inventories){assert.ok(!i.tools.includes('webfetch'));for(const n of ['read','apply_patch','bash','glob','grep'])assert.ok(i.tools.includes(n));}
 if(row.T){assert.ok(row.nativeCompleted&&row.stop.terminationVerified&&row.stop.captureSaved&&row.stop.forwardingClosed&&row.stop.relayRemoved);assert.equal(row.stop.activeProviderHandlers,0);assert.equal(row.patch.kind,'terminal');}
 if(row.arm==='OFF')assert.equal(row.compiler,null);else assert.ok((row.compiler?.runs.length??0)<=2);
 assert.equal(row.patchChecks.applyCheck.status,0);assert.equal(row.patchChecks.apply.status,0);assert.deepEqual(row.patchChecks.forbiddenPaths,[]);assert.deepEqual(row.patchChecks.serviceContentHits,[]);
 if(row.Q)assert.ok(row.grading.checksPassed&&row.authorTypes.status===0);
}
const counts={ON:r.rows.filter(x=>x.arm==='ON'&&x.D).length,OFF:r.rows.filter(x=>x.arm==='OFF'&&x.D).length};assert.deepEqual(counts,r.decision.fullDeliveries);
const m=read(dev+'/compiler-evidence.json');assert.equal(r.decision.mechanismRepeated,m.rows.some(x=>x.usefulRepairChain));assert.equal(r.decision.positiveReadiness,r.decision.complete&&r.rows.filter(x=>x.arm==='ON').every(x=>x.D)&&r.decision.deliveryAdvantageRepeated&&r.decision.mechanismRepeated);
for(const n of fs.readdirSync(dev).filter(n=>n.endsWith('.json')))assert.ok(!/reasoningEncryptedContent|Bearer\s+[A-Za-z0-9]|"authorization"\s*:/i.test(fs.readFileSync(dev+'/'+n,'utf8')),n);
console.log(JSON.stringify({passed:true,assignedSlots:4,executed:r.rows.filter(x=>x.status==='executed').length,providerRequests:r.rows.reduce((s,x)=>s+x.requests,0),knownTokens:r.rows.reduce((s,x)=>s+(x.knownUsage?.total_tokens??0),0),decision:r.decision}));
