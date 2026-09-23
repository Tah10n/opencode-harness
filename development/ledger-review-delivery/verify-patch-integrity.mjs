import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {verifyPatches} from './patch-integrity.mjs';
const out=path.resolve('local/ledger-review-delivery/preflight-corrected/A/runs/account-switch-ledger-A');
const ids=fs.readdirSync(out+'/task-artifacts');assert.equal(ids.length,1);
const terminal=fs.readFileSync(out+'/task-artifacts/'+ids[0]+'/terminal.patch'),external=fs.readFileSync(out+'/model.patch');
assert.notEqual(terminal.toString(),external.toString());
const root=fs.mkdtempSync(path.resolve('local/ledger-review-delivery/patch-check-'));
const result=verifyPatches({baseline:path.resolve('local/ledger-review-delivery/neutral-baseline-corrected'),patches:[terminal,external],evidenceDir:root+'/same'});
for(const i of [0,1]){const dir=root+'/same/apply-'+i;assert.equal(fs.readFileSync(dir+'/draft.txt','utf8'),'DRAFT_SENTINEL\n');assert.ok(fs.statSync(dir+'/helper.sh').mode&0o111);const test=spawnSync(process.execPath,['--test'],{cwd:dir,encoding:'utf8'});assert.equal(test.status,1);assert.ok(test.stdout.includes('16')&&test.stdout.includes('12'));}
const changed=Buffer.from(external.toString().replace('DRAFT_SENTINEL','WRONG_SENTINEL'));
assert.throws(()=>verifyPatches({baseline:path.resolve('local/ledger-review-delivery/neutral-baseline-corrected'),patches:[terminal,changed],evidenceDir:root+'/changed-bytes'}),/different file bytes or modes/);
const changedMode=Buffer.from(external.toString().replace('new file mode 100755','new file mode 100644'));
assert.throws(()=>verifyPatches({baseline:path.resolve('local/ledger-review-delivery/neutral-baseline-corrected'),patches:[terminal,changedMode],evidenceDir:root+'/changed-mode'}),/different file bytes or modes/);
const receipt={passed:true,scope:'saved corrected-preflight patches only; no native rerun',differentPatchBytes:true,...result,untrackedFilesPreserved:true,executableModePreserved:true,changedContentRejected:true,changedModeRejected:true,deliberateDraftTestFailurePreserved:true,realProviderRequests:0,nativeLaunches:0};
fs.writeFileSync('development/ledger-review-delivery/patch-integrity-verification.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));

const get=p=>JSON.parse(fs.readFileSync(p));
const recorded=get('development/ledger-review-delivery/preflight-corrected.json');
const stoppedRoot=path.resolve('local/ledger-review-delivery/preflight-corrected');
for(const [relative,sha]of Object.entries(recorded.privateEvidenceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(stoppedRoot,relative))).digest('hex'),sha);
assert.equal(recorded.scriptedRequests,7);assert.equal(recorded.realProviderRequests,0);
assert.equal(recorded.nativeParentSessions,1);assert.equal(recorded.nativeAuthorSessions,1);
assert.equal(recorded.scriptedNativeCompletion.exitCode,0);assert.equal(recorded.scriptedNativeCompletion.timedOut,false);
assert.equal(recorded.admissionStop.kind,'execution_or_capture_error');
assert.ok(!fs.existsSync(stoppedRoot+'/R'));assert.ok(!fs.existsSync(stoppedRoot+'/F'));
assert.equal(get('development/ledger-review-delivery/result.json').scriptedProviderRequestsTotal,9);
console.log('PASS: saved corrected-attempt custody, arithmetic and closed admission');
