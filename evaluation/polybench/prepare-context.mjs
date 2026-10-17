import {verifyPreparedInput} from './input-preflight.mjs';
// Bind the two task inputs after ordinary PolyBench author/environment preparation.
// Metadata is administrative and must already have been independently reviewed.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {manifest} from '../support/manifest.mjs';
import {contextAssignments,digest} from './public-context-campaign.mjs';
const {config,selection}=contextAssignments(),local=path.resolve(config.local_directory);
const get=file=>JSON.parse(fs.readFileSync(file));
const environments=get(local+'/environments.json'),preparation=get(local+'/preparation.json');
assert.ok(selection.selected.every(r=>preparation[r.instance_id]?.status==='ready'),'All four fixed inputs must be ready before context preparation');
const variants={};
for(const row of selection.selected){
 const id=row.instance_id;assert.equal(preparation[id]?.status,'ready','Every fixed task must be ready; no replacement');
 const source=path.join(local,'author-inputs',id,'source'),task=path.join(source,'TASK.md');
 const evidence=get(path.join(local,id,'source-evidence.json'));
 const decision=selection.decisions.find(d=>d.instance_id===id&&d.disposition==='selected');
 assert.equal(digest(fs.readFileSync(path.join(local,id,'source-evidence.json'))),decision.source_evidence_sha256);
 assert.equal(evidence.issue_url,decision.issue_url);
 assert.equal(evidence.instance_id,id);assert.equal(evidence.repository,row.repo);assert.equal(evidence.is_issue,true);
 const metadata={repository:row.repo,issue:evidence.issue,task_sha256:digest(fs.readFileSync(task)),cutoff:{at:evidence.cutoff,first_solution_commit_at:evidence.cutoff,verified:true,basis:'Reviewed PR commit list and independent git commit metadata; evidence sha256 '+digest(fs.readFileSync(path.join(local,id,'source-evidence.json')))}};
 const metadataPath=path.join(local,id,'metadata.json');fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
 const online=path.join(local,id,'prepared-context'),offline=path.join(local,id,'offline-replay');
 execFileSync(process.execPath,['evaluation/public-context/prepare.mjs','--task',task,'--metadata',metadataPath,'--fetch-public','--out',online],{stdio:'inherit'});
 const receipt=get(online+'/receipt.json');assert.equal(receipt.status,'complete');
 // Pin the successful receipt hash before replay, not a recomputed incoming hash.
 const snapshotHash=receipt.snapshot_sha256;assert.match(snapshotHash,/^[a-f0-9]{64}$/);
 execFileSync(process.execPath,['evaluation/public-context/prepare.mjs','--task',task,'--metadata',metadataPath,'--snapshot',online+'/snapshot.json','--snapshot-sha256',snapshotHash,'--out',offline],{stdio:'inherit'});
 for(const name of ['TASK.md','context.json'])assert.ok(fs.readFileSync(online+'/'+name).equals(fs.readFileSync(offline+'/'+name)));
 const original=fs.readFileSync(task),augmented=fs.readFileSync(online+'/TASK.md');assert.ok(augmented.subarray(0,original.length).equals(original));assert.ok(augmented.length<=131071);
 const augmentedSource=path.join(local,'author-inputs',id,'source-context');assert.ok(!fs.existsSync(augmentedSource));
 fs.cpSync(source,augmentedSource,{recursive:true,verbatimSymlinks:true,mode:fs.constants.COPYFILE_FICLONE});fs.copyFileSync(online+'/TASK.md',augmentedSource+'/TASK.md');
 const a=manifest(source),b=manifest(augmentedSource);delete a['TASK.md'];delete b['TASK.md'];assert.deepEqual(a,b);
 environments[augmentedSource]=environments[source];
 fs.mkdirSync(local+'/input-preflight-context-'+id,{mode:0o700});
 await verifyPreparedInput({source:augmentedSource,toolchain:local+'/toolchain',template:local+'/bundle',output:local+'/input-preflight-context-'+id,preparedEnvironment:environments[source]});
 variants[id]={original:{source,taskSha256:digest(original)},'public-context-v2':{source:augmentedSource,taskSha256:digest(augmented)},snapshotSha256:snapshotHash,receiptSha256:digest(fs.readFileSync(online+'/receipt.json')),replayReceiptSha256:digest(fs.readFileSync(offline+'/receipt.json')),metadataSha256:digest(fs.readFileSync(metadataPath)),sourceEvidenceSha256:digest(fs.readFileSync(path.join(local,id,'source-evidence.json')))};
}
fs.writeFileSync(local+'/input-variants.json',JSON.stringify(variants,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(local+'/environments.json',JSON.stringify(environments,null,2)+'\n');
console.log('Four original/context pairs prepared and replayed; model requests: 0');
