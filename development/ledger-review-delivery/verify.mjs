// Verify saved preparation facts; never repeat the container check or dispatch.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {manifest} from '../native-task-integrated/run.mjs';
const dev='development/ledger-review-delivery',local='local/ledger-review-delivery';
const get=p=>JSON.parse(fs.readFileSync(p));
const hash=b=>createHash('sha256').update(b).digest('hex');
const p=get(dev+'/preparation.json'),privatePrep=get(local+'/prepared.json'),b=get(dev+'/budget-boundary.json'),r=get(dev+'/result.json');
assert.deepEqual(b,get(local+'/budget-boundary/result.json'));
assert.equal(b.result,'confirmed_budget_boundary');assert.equal(b.error.message,'Invalid relay task budget');
assert.equal(b.example.totalMs-b.example.elapsedMs,b.example.remainingFMs);
assert.ok(b.example.remainingFMs>1800000&&b.example.remainingFMs<3600000);
assert.equal(b.cleanupStatus,0);assert.equal(b.containerAbsent,true);
for(const x of [b,r])for(const key of ['realProviderRequests','scriptedProviderRequests','nativeSessions'])assert.equal(x[key],0);
assert.equal(b.observedRelayRequests,0);assert.equal(r.deadlineStarted,false);assert.equal(r.dispatchAdmitted,false);
assert.deepEqual(r.stages,{A:'not_started',R:'not_started',F:'not_started'});
for(const k of ['Q','T','D','delivery_apply','assessment_integrity','contract_results'])assert.equal(r[k],null);
for(const [file,sha]of Object.entries(b.sourceFiles))assert.equal(hash(fs.readFileSync(file)),sha);
for(const role of ['author','reviewer']){
 const bundle=privatePrep.bundles[role].path;
 assert.equal(hash(JSON.stringify(manifest(bundle))),p.bundles[role].sha256);
 assert.equal(fs.readFileSync(bundle+'/.gitignore','utf8'),'node_modules\npackage.json\npackage-lock.json\n');
 assert.equal(hash(fs.readFileSync(local+'/'+role+'-config.json')),p.configHashes[role]);
}
const permissions={'*':'deny',read:'allow',glob:'allow',grep:'allow',skill:'deny'};
assert.deepEqual(get(local+'/reviewer-config.json').permission,permissions);
assert.deepEqual(get(local+'/reviewer-config.json').agent['harness-reviewer'].permission,permissions);
assert.equal(p.exactReviewerInventory,'NOT RUN');
assert.equal(hash(fs.readFileSync('development/plain-ledger-native-high/original-task.txt')),p.taskSha256);
assert.equal(hash(fs.readFileSync('development/plain-ledger-native-high/environment.txt')),p.environmentSha256);
assert.equal(hash(fs.readFileSync('local/plain-ledger-native-high/baseline.tar')),p.baselineArchiveSha256);
assert.equal(hash(JSON.stringify(manifest(path.resolve(local+'/baseline')))),p.baselineTreeSha256);
assert.ok(!fs.existsSync(local+'/batch'));assert.ok(!fs.existsSync(local+'/runs'));
const changed=execFileSync('git',['diff','--name-only','f98a96121e5c4d340f3c674920c57e1cb80258e5'],{encoding:'utf8'}).trim();
assert.ok(!changed||changed.split('\n').every(n=>n.startsWith(dev+'/')),'Unrelated tracked mutation');
const safe={passed:true,scope:'saved preparation only',budgetArithmetic:true,sourceHashes:true,bundleConfigHashes:true,
 taskAndBaselineCustody:true,savedCleanupVerified:true,realAndScriptedRequests:0,stageStarts:0,
 stateTransfer:'NOT RUN',patchApplication:'NOT RUN',actualReviewerInventory:'NOT RUN',fullChainPreflight:'NOT RUN',assessment:'NOT RUN'};
fs.writeFileSync(dev+'/verification.json',JSON.stringify(safe,null,2)+'\n');
console.log(JSON.stringify(safe));
