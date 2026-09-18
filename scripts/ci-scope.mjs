import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const reports = new Set(['RESULTS.md','PAIRS.md','paired-results.json','execution-summary.json','independent-review.json'].map(x=>'development/native-task-comparison/'+x));
const engineering = new Set(['scripts/ci-scope.mjs','scripts/verify-ci-scope.mjs','scripts/verify-native-launcher.mjs','development/native-task-launcher/run-pilot.mjs','development/native-task-launcher/README.md']);
export function planChanges(files, mode='fast') {
 if(!['fast','full','targeted'].includes(mode))throw Error('Unknown CI mode');
 const plan={full:mode==='full',native:false,linux:false,windows:false,macos:false,diagnostic:mode==='targeted'};
 for(const file of files){
  if(reports.has(file)||engineering.has(file))continue;
  if(file==='scripts/build-macos-containment.mjs'){plan.macos=true;continue;}
  if(file==='scripts/build-linux-cgroup-attach-helper.mjs'){plan.linux=true;continue;}
  if(/^lib\/native-(?:task|review)[^/]*\.mjs$|^scripts\/verify-native-[^/]*\.mjs$/.test(file)){plan.native=true;continue;}
  // Shared containment changes and unknown paths require the complete checkpoint.
  plan.full=true;
 }
 if(!files.length)plan.full=true;
 if(plan.full)for(const k of ['native','linux','windows','macos'])plan[k]=true;
 // Explicit diagnostic validates the router itself; it is never merge evidence.
 if(plan.diagnostic)for(const k of ['full','native','linux','windows','macos'])plan[k]=false;
 return plan;
}
export function assessJobs(plan, results){
 const required=['scope',...(plan.full?['verify','milestone-2-status']:[]),...(plan.native?['native-review']:[]),...['linux','windows','macos'].filter(k=>plan[k]).map(k=>k+'-containment')];
 const missing=required.filter(k=>results[k]!=='success');
 return {passed:missing.length===0&&!plan.diagnostic,required,missing,heavy:plan.full?'full-required':['linux','windows','macos'].some(k=>plan[k])?'selected-platform-required':'not-required',diagnostic:plan.diagnostic};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]==='gate'){
  const needs=JSON.parse(process.env.NEEDS);const plan=JSON.parse(needs.scope.outputs.plan);const result=assessJobs(plan,Object.fromEntries(Object.entries(needs).map(([k,v])=>[k,v.result])));
  console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
 }else{
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH));
  const base=event.pull_request?.base.sha??event.before;
  const head=event.pull_request?.head.sha??process.env.GITHUB_SHA;
  const files=base&& !/^0+$/.test(base)?execFileSync('git',['diff','--name-only',base,head],{encoding:'utf8'}).trim().split('\n').filter(Boolean):['unknown'];
  const plan=planChanges(files,process.env.CI_MODE||'fast');console.log(JSON.stringify({files,plan}));
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'plan='+JSON.stringify(plan)+'\n'+Object.entries(plan).map(([k,v])=>k+'='+v+'\n').join(''));
 }
}
