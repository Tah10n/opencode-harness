import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planChanges,assessJobs} from './ci-scope.mjs';
const report=planChanges(['development/native-task-comparison/RESULTS.md']);assert.equal(report.full,false);
for(const p of ['AGENTS.md','core.md','agents/core.md','development/unknown-runner.mjs','unknown.txt','lib/feedback/process-containment.mjs','.github/workflows/verify.yml'])assert.equal(planChanges([p]).full,true,p);
assert.equal(planChanges(['lib/native-task-workflow.mjs']).native,true);
assert.equal(planChanges(['lib/native-task-workflow.mjs']).full,false);
assert.deepEqual(planChanges(['scripts/build-macos-containment.mjs']),{full:false,native:false,linux:false,windows:false,macos:true,diagnostic:false});
const full=planChanges(['lib/feedback/process-containment.mjs']);assert(full.macos&&full.windows&&full.linux);
assert.equal(assessJobs(report,{scope:'success'}).passed,true);
assert.equal(assessJobs(report,{scope:'failure'}).passed,false);
const results=Object.fromEntries(['scope','verify','milestone-2-status','native-review','linux-containment','windows-containment','macos-containment'].map(k=>[k,'success']));
assert.equal(assessJobs(full,results).passed,true);
for(const status of ['failure','skipped','cancelled',undefined])assert.equal(assessJobs(full,{...results,'macos-containment':status}).passed,false);
assert.equal(assessJobs(planChanges(['unknown'],'targeted'),results).passed,false);
const yaml=fs.readFileSync(new URL('../.github/workflows/verify.yml',import.meta.url),'utf8');
assert(yaml.includes("|| 'Harness verification'"));assert(yaml.includes("needs.scope.outputs.full == 'true'"));assert(!yaml.includes('continue-on-error:'));
console.log('CI routing and fail-closed gate: passed; real provider calls = 0');

// Check the real workflow steps, not only the router's job flags. Keep this
// deliberately bounded to the existing single-line direct regression steps.
const nativeJob=yaml.split('\n  native-review:\n')[1];
assert(nativeJob);assert(nativeJob.includes("    if: needs.scope.outputs.native == 'true'\n"));
assert(nativeJob.includes('    runs-on: ubuntu-latest\n'));
const direct=['template','task','review'].map(x=>`node scripts/verify-native-${x}.mjs`);
const steps=nativeJob.split(/\n      - /).slice(1);
const commands=direct.map(command=>{
 const step=steps.find(s=>s.includes(`        run: ${command}\n`));
 assert(step,`Native job must execute ${command}`);
 assert.match(step,/^name: [^\n]+\n        run: node scripts\/verify-native-(?:template|task|review)\.mjs\s*$/);
 assert.equal(yaml.split(`run: ${command}\n`).length-1,1,`No duplicate ${command}`);
 return step.match(/        run: (.+)/)[1];
});
const nativePaths=['lib/native-task-workflow.mjs','lib/native-review-context.mjs','scripts/verify-native-task.mjs','scripts/verify-native-review.mjs','scripts/verify-native-template.mjs'];
const {spawnSync}=await import('node:child_process');
const {default:os}=await import('node:os');
const {default:path}=await import('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-ci-route-'));
try {
 fs.mkdirSync(path.join(temp,'scripts'));
 for(const file of nativePaths){
  const plan=planChanges([file]);assert.equal(plan.native,true,file);assert.equal(plan.full,false,file);
  assert.equal(assessJobs(plan,{scope:'success','native-review':'success'}).passed,true);
  for(const status of ['failure','cancelled','skipped',undefined])assert.equal(assessJobs(plan,{scope:'success','native-review':status}).passed,false);
  // Execute the extracted workflow commands with one intentionally failing
  // temporary script at a time. No fixture is placed in the checkout or Actions.
  for(const failing of [-1,0,1,2]){
   for(const [index,command]of commands.entries())fs.writeFileSync(path.join(temp,command.slice(5)),`process.exit(${index===failing?23:0});\n`);
   const executed=spawnSync('bash',['--noprofile','--norc','-e','-o','pipefail','-c',commands.join('\n')],{cwd:temp,encoding:'utf8'});
   assert.equal(executed.status,failing===-1?0:23);
   const needs={scope:{result:'success',outputs:{plan:JSON.stringify(plan)}},'native-review':{result:executed.status===0?'success':'failure'}};
   const gate=spawnSync(process.execPath,[new URL('./ci-scope.mjs',import.meta.url).pathname,'gate'],{env:{...process.env,NEEDS:JSON.stringify(needs)},encoding:'utf8'});
   assert.equal(gate.status,failing===-1?0:1,`${file}: regression ${failing}: ${gate.stderr}`);
  }
 }
 assert.equal(planChanges(['lib/native-task-workflow.mjs'],'full').native,true);
 assert.equal(assessJobs(full,{...results,'native-review':'failure'}).passed,false);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('Real native job commands and failure-to-gate propagation: passed (5 paths, 3 failures each); temporary stubs removed');
