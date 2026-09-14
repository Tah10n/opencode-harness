// Two deliberately selected existing development inputs; no provider access.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
import {startContainer} from '../../native-task-ab/container-session.mjs';
import {stopWorkload} from '../../native-task-utility/container/stop-workload.mjs';
const root=path.resolve(process.argv[2]),historical=path.resolve('local/native-task-h00-transfer');
const toolchain=JSON.parse(fs.readFileSync(historical+'/freeze.json')).toolchain;
const sha=b=>createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync('development/native-task-h00-transfer/tasks/denque-remove-where/TASK.md','utf8');
const patches=['27-denque-remove-where-r2-P.patch','28-denque-remove-where-r2-H00.patch'];
const attempts=[];
for(const [i,patchName] of patches.entries()){
 const task='case-'+(i+1),source=path.join(root,'inputs',task),out=path.join(root,'admission',task);
 if(fs.existsSync(source)||fs.existsSync(out))throw Error('Do not replace retained preparation');
 fs.mkdirSync(path.dirname(source),{recursive:true});fs.mkdirSync(out,{recursive:true});
 fs.cpSync(historical+'/inputs/denque-remove-where',source,{recursive:true,verbatimSymlinks:true});
 fs.writeFileSync(source+'/TASK.md','An unfinished public patch is already present in this working tree. Verify it against the complete original request below and finish the delivery if necessary. Preserve correct existing work.\n\n'+original);
 const seedPatch=path.resolve('development/native-task-h00-transfer/continuation-20260914/patches',patchName);
 const row={slot:i+1,task,originalTask:'denque-remove-where',project:'denque',arm:'H1',source,seedPatch,seedSha256:sha(fs.readFileSync(seedPatch))};attempts.push(row);
 let session;
 try{
  session=await startContainer({source,toolchain,template:root+'/bundle',output:out+'/session',onRequest(){throw Error('No model calls in input admission');}});
  const seed=fs.readFileSync(seedPatch,'utf8');
  let r=session.exec(['node','-e',`const r=require('child_process').spawnSync('git',['apply','-'],{input:${JSON.stringify(seed)},encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);`]);if(r.status!==0)throw Error(r.stderr);
  const script=`import fs from 'node:fs';import {sensitivityPlan} from '/template/native-sensitivity.mjs';import {runSensitivity} from '/template/native-sensitivity-runner.mjs';const rules=[{permission:'*',pattern:'*',action:'allow'}];const args={path:'index.js',check:'npm test'};const plan=sensitivityPlan({directory:'/work/repo',rules,args});const report=await runSensitivity({args,rules,base:'HEAD',snapshot:plan.snapshot,budgetMs:180000},{directory:'/work/repo'});fs.writeFileSync('/work/report.json',JSON.stringify(report));console.log(JSON.stringify({status:report.status,baseline:report.baseline?.status,engineExecuted:report.engineExecuted,variants:report.variants.map(m=>({diff:m.diff,status:m.status})),cost:report.cost}));`;
  r=session.exec(['node','-e',`require('fs').writeFileSync('/work/admission.mjs',${JSON.stringify(script)})`]);if(r.status!==0)throw Error(r.stderr);
  const child=spawn('docker',['exec','--workdir','/work/repo',session.name,'node','/work/admission.mjs'],{stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
  const timer=setTimeout(()=>{stopWorkload(session);child.kill('SIGTERM');},200000);
  const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});clearTimeout(timer);fs.writeFileSync(out+'/output.txt',output);if(exit!==0)throw Error(output);
  r=session.exec(['cat','/work/report.json']);if(r.status!==0)throw Error(r.stderr);const report=JSON.parse(r.stdout);fs.writeFileSync(out+'/report.json',r.stdout);
  if(report.baseline?.status!=='passed'||!report.engineExecuted||!report.variants.length||!report.terminationVerified)throw Error('Current instrument cannot check input '+task);
  // Computed standard BooleanLiteral observation, not an imported evaluator patch.
  const empty=report.variants.find(m=>m.mutatorName==='BooleanLiteral'&&m.diff.endsWith('-false\n+true'));
  if(i===0&&empty?.status!=='passed')throw Error('Selected A gap not exposed by current engine');
  if(i===1&&!report.variants.some(m=>m.diff.endsWith('-size === 0\n+true')&&m.status==='command-rejected'))throw Error('Control must reject unconditional early return');
  r=session.exec(['git','diff','--binary','HEAD']);if(r.status!==0||r.stdout!==seed)throw Error('Input patch was committed or changed during admission');
  fs.writeFileSync(out+'/input.patch',r.stdout);fs.writeFileSync(out+'/termination.json',JSON.stringify(stopWorkload(session)));
  console.log(JSON.stringify({case:task,baseline:report.baseline.status,engine:report.engine,variants:report.variants.length,emptyVariant:empty?.status??null,cost:report.cost,realProviderRequests:0}));
 }finally{if(session&&session.close()!==0)throw Error('Admission container cleanup failed');}
}
fs.writeFileSync(root+'/attempt-inputs.json',JSON.stringify(attempts,null,2),{flag:'wx'});
