// Bounded ON-only form replay. No project reconstruction, hidden tests or model calls.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {advisoryCommand,mochaReport} from '../../../lib/native-preservation-nudge.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),local=root+'/local/preservation-nudge-model-pair/batch/runs/sveltejs__svelte-1190-ON';
const dirs=fs.readdirSync(local+'/task-artifacts');assert.equal(dirs.length,1);
const artifacts=local+'/task-artifacts/'+dirs[0],raw=fs.readFileSync(artifacts+'/tool-events.json'),events=JSON.parse(raw);
const trajectory=JSON.parse(fs.readFileSync(root+'/development/preservation-nudge/model-pair/trajectory.json')).arms.find(a=>a.arm==='ON');
assert.equal(createHash('sha256').update(raw).digest('hex'),trajectory.rawToolEventsSha256);
// Read revision 1 from its immutable Git history; never install it alongside v2.
const old=execFileSync('git',['show','3f5605d9c2ba58a3f631706a32178911973fcd60:lib/native-preservation-nudge.mjs'],{cwd:root,encoding:'utf8'}).replace("'./native-task-observations.mjs'",JSON.stringify(pathToFileURL(root+'/lib/native-task-observations.mjs').href));
const revision1=await import('data:text/javascript;base64,'+Buffer.from(old).toString('base64'));
const snapshots=new Map();
for(const name of ['initial','implementation-original','D0','final','terminal']){
 const file=artifacts+'/'+name+'.json';if(!fs.existsSync(file))continue;const s=JSON.parse(fs.readFileSync(file));if(s.snapshotSha256)snapshots.set(s.snapshotSha256,name);
}
const rows=[];
for(const [index,event] of events.entries()){
 if(event.tool!=='bash')continue;
 const timing=trajectory.commands.find(c=>c.event===index+1);assert.ok(timing);
 const command=advisoryCommand(event.args.command),v1=revision1.advisoryCommand(event.args.command);
 let output=event.output??'';
 if(command?.nvm)output=output.replace(/^Now using node v[\d.]+ \(npm v[\d.]+\)\n/,'');
 const cases=command?.runner==='mocha'&&command.route==='direct'?mochaReport(output):null;
 const completed=event.executionAdmitted===true&&event.state==='completed'&&event.exit===0&&!event.signal&&!event.timeout&&!event.scopeViolation&&event.before===event.after&&JSON.stringify(event.args)===JSON.stringify(event.admittedArgs);
 const formPass=completed&&!!cases?.length&&timing.remainingSecondsAfter>=120;
 rows.push({event:index+1,callID:event.callID,command:event.args.command,revision1:v1?'recognized_command_further_checks_required':'unsupported_command_before_origin_analysis',revision2:{recognized:!!command,observedCount:cases?.length??null,observedCases:cases?.slice(0,5)??null,completedStable:completed,remainingSeconds:timing.remainingSecondsAfter,formPass,fullEligibility:formPass?'unknown':'not_eligible_on_available_inputs',reason:!command?'unsupported_command':!completed?'unconfirmed_or_changed_execution':!cases?'unsupported_or_incomplete_report':'intermediate_snapshot_and_configuration_unavailable'},savedSnapshot:snapshots.get(event.after)??null,receiptSha256:timing.firstModelReceipt?.receiptSha256??null});
}
const historicalState=JSON.parse(fs.readFileSync(artifacts+'/preservation-nudge.json'));
const report={revision1Actual:{considered:historicalState.considered,reasons:historicalState.reasons,attachedBlocks:historicalState.attachedBlocks},kind:'offline ON-only form replay, not historical delivery',revision:2,events:rows.length,formPasses:rows.filter(r=>r.revision2.formPass).length,firstFormPass:rows.find(r=>r.revision2.formPass)?.event??null,firstFullyEligibleEvent:null,fullEligibility:'unknown: no preserved intermediate full snapshot/configuration for first form pass; no invented replacement',historicalAdvisoryAttached:0,realProviderCalls:0,rows};
fs.writeFileSync(import.meta.dirname+'/replay.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({events:report.events,formPasses:report.formPasses,firstFormPass:report.firstFormPass,firstFullyEligibleEvent:null}));
