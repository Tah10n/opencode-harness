import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=path.resolve('local/investigation-followup-full-task'),dev='development/investigation-followup/full-task';
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=p=>sha(fs.readFileSync(p)),get=p=>JSON.parse(fs.readFileSync(p));
const save=(p,o)=>fs.writeFileSync(p,JSON.stringify(o,null,2)+'\n',{flag:'wx',mode:0o600});
const f=get(root+'/prepared.json');assert.ok(get(dev+'/capture-verification.json').passed&&get(dev+'/assignment-verification.json').passed);
const files=[...fs.readdirSync(dev).filter(n=>/\.(md|mjs|py)$/.test(n)||['capture-verification.json','assignment-verification.json'].includes(n)).map(n=>dev+'/'+n),
 'development/investigation-direct-ledger-pair/PLAN.md','development/investigation-direct-ledger-pair/assess.py',
 ...['run-comparison.mjs','native-run.mjs','provider-recording.mjs','extract-candidate.py'].map(n=>'development/native-task-ab/'+n),
 'development/native-task-abc/native-run.mjs','development/native-task-abc/deadline-stop.mjs','development/investigation-direct-ledger-pair/inspect-full-task/session.mjs','development/native-task-integrated/container-session.mjs','development/native-task-integrated/container-relay.mjs',
 'development/native-task-utility/container/stop-workload.mjs','development/polybench-pilot/capture.mjs','development/native-output-retention/output-files.mjs','development/ledger-review-delivery/resolve-native-result.mjs',
 ...['original-task.txt','environment.txt','account-switch-ledger.test.mjs','ledger-lifecycle.test.mjs','legacy-input.test.mjs','kimi-migration.test.mjs','migration-contract.test.mjs','cli-persistence.test.mjs','diagnose.mjs','privacy-observation.mjs'].map(n=>'development/plain-ledger-native-high/'+n),
 ...['claude-persisted-privacy.test.mjs','test-only.patch','calibration/legacy-state.json'].map(n=>'development/ledger-review-delivery/persisted-privacy-check/'+n),
 f.toolchain+'/package/bin/opencode'];
f.files=Object.fromEntries(files.map(p=>[p,hash(p)]));
f.historical=Object.fromEntries(['REPORT.md','timing.json','M.patch','child-test.patch'].map(n=>{const p='development/investigation-direct-ledger-pair/inspect-full-task/'+n;return[p,hash(p)];}));
f.storagePreflight=get(root+'/storage-preflight.json');
fs.mkdirSync(root+'/batch',{mode:0o700});save(root+'/batch/freeze.json',f);
fs.renameSync(dev+'/manifest.json',dev+'/manifest-before-freeze.json');save(dev+'/manifest.json',{version:1,stage:'frozen_before_model_requests',runtimeSha:f.runtimeSha,baseline:'2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd',freezeSha256:hash(root+'/batch/freeze.json'),model:f.model,variant:f.variant,budgetMs:f.budgetMs,image:f.image,recordingProfile:f.recordingProfile,recordingBounds:f.recordingBounds,sourceManifestSha256:sha(JSON.stringify(f.inputManifests['account-switch-ledger-I1'])),bundleManifestSha256:sha(JSON.stringify(f.runtimeManifests[f.template])),originalTaskSha256:hash('development/plain-ledger-native-high/original-task.txt'),environmentSha256:hash('development/plain-ledger-native-high/environment.txt'),promptSha256:hash(root+'/source/TASK.md'),privacyTestSha256:hash('development/ledger-review-delivery/persisted-privacy-check/claude-persisted-privacy.test.mjs'),slots:[{slot:1,arm:'I1',status:'not_started'}],preflightReceiptSha256:hash(dev+'/assignment-verification.json'),acceptance:'Unchanged parent PLAN; same suites, 23 probes, isolated calibrated CLI privacy test and contract observations',storagePreflight:f.storagePreflight});
console.log(JSON.stringify({frozen:true,files:files.length,freezeSha256:hash(root+'/batch/freeze.json')}));
