import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='local/investigation-followup',out=root+'/installed/release-check-H';
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const installed=read(root+'/installed/release-check-result.json');assert.ok(installed.passed);assert.ok(installed.results[0].nativeCompleted);
const resolution=read(out+'/resolver-verification.json');assert.ok(resolution.passed);
const deadlines=read(root+'/timeouts-release-check/receipts.json');assert.equal(deadlines.length,4);assert.ok(deadlines.every(r=>r.passed&&r.partialRetained&&r.noWorkloadProcesses));
const sources=['lib/native-task-plugin.mjs','lib/native-task-investigation.mjs','development/native-task-abc/native-run.mjs','development/native-task-abc/deadline-stop.mjs','development/native-task-ab/run-comparison.mjs','development/native-task-integrated/container-session.mjs','development/native-task-integrated/container-relay.mjs','development/ledger-review-delivery/resolve-native-result.mjs'];
for(const file of sources.filter(f=>f.startsWith('lib/')))assert.equal(sha(file),sha(root+'/installed/bundle/'+path.basename(file)),'Installed runtime exact bytes');
const lines=fs.readFileSync(root+'/transport-release-check.txt','utf8').trim().split('\n').map(l=>JSON.parse(l));
const transport=lines.filter(r=>r.mode);assert.equal(transport.length,7);assert.ok(transport.every(r=>r.passed));
const receipt={version:1,realProviderCalls:0,modelTaskRuns:0,sourceSha256:Object.fromEntries(sources.map(p=>[p,sha(p)])),
 historical:{reportUnchanged:true,timingUnchanged:true,Q:false,T:false,D:false,elapsedSeconds:4087.196,cause:'unknown; see HISTORY.md'},
 baselines:{inspect:'invalid-cursor',resolver:'evidence_incomplete: Foreign native session',stopClose:'stopWorkload delayed until inherited stdout closed',blockedLoop:JSON.parse(fs.readFileSync(root+'/blocked-loop-red.txt','utf8'))},
 installed:{opencode:installed.opencode,scriptedRequests:installed.results[0].requests.length,investigatorSessions:1,nativeCompleted:true,delivery:installed.results[0].delivery,userState:read(out+'/user-state-preserved.json'),resolution,patchAppliedAndProjectTestsPassed:true},
 declined:{nativeCompleted:read(root+'/installed/declined-result.json').results[0].nativeCompleted,scriptedRequests:read(root+'/installed/declined-result.json').results[0].requests.length,disposition:read(root+'/installed/declined-investigation.json').result.disposition},
 deadlines:deadlines.map(r=>({mode:r.mode,budgetMs:r.budgetMs,cancelToleranceMs:r.cancelToleranceMs,stopGraceMs:r.stopGraceMs,cancelLatencyMs:r.cancelLatencyMs,stopLatencyMs:r.stopLatencyMs,independent:r.independent,requests:r.requests,providerTerminal:r.providerTerminal,partialRetained:r.partialRetained,noWorkloadProcesses:r.noWorkloadProcesses})),
 nearDeadlineCompletion:read(root+'/near-complete-release-check/receipts.json')[0],
 transport:transport.map(({mode,passed,upstreamRequests,unknownUsageRequests,localTerminationVerified,partialOutputPreserved})=>({mode,passed,upstreamRequests,unknownUsageRequests,localTerminationVerified,partialOutputPreserved})),
 fixtureIncidents:['Initial lifecycle attempt blocked by sandbox localhost EPERM; rerun with existing execution permission succeeded.','First resolver fixture incorrectly equated patch file ordering; corrected to apply both full patches and compare Git trees plus executed tests.','Initial materialization refresh used a relative path and failed; its following local run is not final evidence.','Initial investigator fixture hit native bash 120s timeout before the 130s task deadline; later fixture sets only that command timeout to 300s and keeps task/investigator thresholds unchanged.'],
 limitations:['Historical 487s cause remains unestablished.','Local cancellation does not prove remote provider computation stopped.','No new model quality result, paid task, platform matrix, full pnpm verify, manual Actions, merge or release.']};
fs.writeFileSync('development/investigation-followup/receipts.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({passed:true,installedRequests:receipt.installed.scriptedRequests,deadlineCases:deadlines.length,transportCases:transport.length,realProviderCalls:0}));
