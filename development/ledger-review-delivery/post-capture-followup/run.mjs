// New explicit R/F admission. Historical scheduler state is read-only provenance.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {chain,get,hash,save,handoff} from '../chain.mjs';import {manifest} from '../../native-task-integrated/run.mjs';
const dev='development/ledger-review-delivery/post-capture-followup',local=path.resolve('local/ledger-review-delivery/post-capture-followup');
const frozen=get(dev+'/manifest.json'),commit=get(local+'/freeze-commit.json').commit;
function verify({root,baseline,task,environment,prepared}) {
 assert.equal(frozen.admitted,true);assert.deepEqual(frozen.operations,['R','F']);assert.equal(frozen.budgetMs,1800000);
 assert.equal(path.resolve(root),local+'/real');assert.equal(hash(execFileSync('git',['show',commit+':'+dev+'/manifest.json'])),hash(fs.readFileSync(dev+'/manifest.json')));
 for(const [file,sha]of Object.entries(frozen.files))assert.equal(hash(fs.readFileSync(file)),sha,file);
 assert.equal(hash(task),frozen.taskSha256);assert.equal(hash(environment),frozen.environmentSha256);assert.equal(hash(JSON.stringify(manifest(baseline))),frozen.baselineTreeSha256);
 for(const role of ['author','reviewer']){assert.equal(hash(fs.readFileSync('local/ledger-review-delivery/'+role+'-config.json')),frozen.configHashes[role]);assert.equal(hash(JSON.stringify(manifest(prepared.bundles[role].path))),frozen.bundleHashes[role]);}
 assert.equal(handoff('{{VERBATIM_REVIEW_RESPONSE}}'),fs.readFileSync('development/ledger-review-delivery/handoff-template.txt','utf8'));
 assert.equal(hash(fs.readFileSync('local/ledger-review-delivery/private-evidence.tar.gz')),frozen.archiveSha256);
 assert.equal(get(dev+'/scripted-verification.json').passed,true);
}
const root=local+'/real';
const summary=await chain({root,baseline:path.resolve('local/ledger-review-delivery/baseline'),task:fs.readFileSync('development/plain-ledger-native-high/original-task.txt','utf8'),environment:fs.readFileSync('development/plain-ledger-native-high/environment.txt','utf8'),followup:{stages:['R','F'],budgetMs:1800000,draftPatch:path.resolve('development/ledger-review-delivery/D0.patch'),verify},onStage:stage=>console.log(JSON.stringify({stage,at:new Date().toISOString()}))});
console.log(JSON.stringify({status:summary.status,stages:summary.stages,pause:summary.pause}));
