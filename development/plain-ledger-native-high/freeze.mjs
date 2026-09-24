import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const local=path.resolve('local/plain-ledger-native-high'),dev='development/plain-ledger-native-high';
const get=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const save=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const preflight=get(local+'/preflight/verification.json');assert.equal(preflight.passed,true);
const stop=get(local+'/preflight/runs/account-switch-ledger-P/stop-verification.json');
assert.ok(stop.captureSaved&&stop.terminationVerified&&stop.relayRemoved&&stop.forwardingClosed&&stop.activeProviderHandlers===0);
const f=get(local+'/prepared.json');
assert.equal(execFileSync('docker',['image','inspect',f.image,'--format','{{.Id}}'],{encoding:'utf8'}).trim(),f.image);
f.experimentKind='plain-ledger-native-high';f.controlsPassed=true;f.authorIsolationPassed=true;
const own=fs.readdirSync(dev).filter(n=>/\.(mjs|txt|json|md|patch)$/.test(n)&&!['manifest.json','result.json','REPORT.md','preflight.json'].includes(n));
const files=[...own.map(n=>dev+'/'+n),'development/polybench-pilot/run.mjs','development/native-task-ab/run-comparison.mjs',
 'development/native-task-abc/native-run.mjs','development/native-task-integrated/container-session.mjs',
 'development/native-task-integrated/container-relay.mjs','development/native-task-utility/container/stop-workload.mjs',
 'development/polybench-pilot/capture.mjs','development/native-output-retention/output-files.mjs',
 'development/native-task-ab/extract-candidate.py','development/native-task-offline/build.json',f.toolchain+'/package/bin/opencode'];
for(const file of files)f.files[path.resolve(file)]=hash(file);
// Preserve the existing campaign pause; do not resume or revalidate its runs.
for(const name of ['freeze.json','freeze-commit.json','scheduling-paused.json','outcome.json']) {
 const file=path.resolve('local/polybench-pilot/batch/'+name);f.files[file]=hash(file);
}
fs.mkdirSync(local+'/batch',{mode:0o700});save(local+'/batch/freeze.json',f);
save(dev+'/preflight.json',{...preflight,stop,scriptedRequests:8,realProviderRequests:0,
 rawResultSha256:hash(local+'/preflight/runs/account-switch-ledger-P/result.json'),
 retainedOutputSha256:hash(local+'/preflight/runs/account-switch-ledger-P/native-output/manifest.json')});
save(dev+'/manifest.json',{version:1,stage:'frozen_before_model_requests',freezeSha256:hash(local+'/batch/freeze.json'),
 baseline:'2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd',reference:'9e389a6dbc1b0c9813599fb61eceb6958d8c4de4',
 referenceRepairSha256:hash(dev+'/reference-compatibility.patch'),image:f.image,opencode:'1.18.26',node:'v24.19.0',git:'2.39.5',
 model:f.model,reasoning:f.variant,budgetSeconds:1800,slots:[{slot:1,task:'account-switch-ledger',arm:'P',status:'not_started'}],
 config:f.config,offlineConfig:get('development/native-task-offline/build.json'),input:get(local+'/input-receipt.json'),
 authorHarness:false,behavioralChecks:23,assessmentPlanSha256:hash(dev+'/PLAN.md'),preflightSha256:hash(dev+'/preflight.json'),
 files:Object.fromEntries(Object.entries(f.files).map(([p,h])=>[p.startsWith(process.cwd()+'/')?p.slice(process.cwd().length+1):p,h])),
 realProviderRequestsBeforeFreeze:0,projectVerify:'unavailable: pinned pnpm and web dependencies not cached'});
console.log('Frozen; commit manifest before dispatch.');
