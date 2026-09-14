// Local evaluator only; neither this file nor reports are mounted for authors.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
import {startContainer} from '../../native-task-ab/container-session.mjs';
import {stopWorkload} from '../../native-task-utility/container/stop-workload.mjs';
const [rootArg,id,task,patchArg,production,check]=process.argv.slice(2),root=path.resolve(rootArg),source=root+'/inputs/'+id,out=root+'/admission/'+id,seed=fs.readFileSync(patchArg,'utf8');
fs.mkdirSync(path.dirname(source),{recursive:true});fs.mkdirSync(out,{recursive:true});fs.cpSync('local/native-task-h00-transfer/inputs/'+task,source,{recursive:true,verbatimSymlinks:true});
const toolchain=JSON.parse(fs.readFileSync(root+'/preparation.json')).toolchain;let session;
try{
 session=await startContainer({source,toolchain,template:root+'/bundle',output:out+'/session',onRequest(){throw Error('No provider in admission');}});
 let r=session.exec(['node','-e',`const r=require('child_process').spawnSync('git',['apply','-'],{input:${JSON.stringify(seed)},encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);`]);if(r.status!==0)throw Error(r.stderr);
 const script=`import fs from 'node:fs';import {sensitivityPlan} from '/template/native-sensitivity.mjs';import {runSensitivity} from '/template/native-sensitivity-runner.mjs';const rules=[{permission:'*',pattern:'*',action:'allow'}],args=${JSON.stringify({path:production,check})};const plan=sensitivityPlan({directory:'/work/repo',rules,args});const report=await runSensitivity({args,rules,base:'HEAD',snapshot:plan.snapshot,budgetMs:180000},{directory:'/work/repo'});fs.writeFileSync('/work/report.json',JSON.stringify(report));`;
 r=session.exec(['node','-e',`require('fs').writeFileSync('/work/admit.mjs',${JSON.stringify(script)})`]);if(r.status!==0)throw Error(r.stderr);
 const child=spawn('docker',['exec','--workdir','/work/repo',session.name,'node','/work/admit.mjs'],{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);const timer=setTimeout(()=>{stopWorkload(session);child.kill('SIGTERM');},200000);const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});clearTimeout(timer);fs.writeFileSync(out+'/output.txt',output);if(exit!==0)throw Error(output);
 r=session.exec(['cat','/work/report.json']);if(r.status!==0)throw Error(r.stderr);fs.writeFileSync(out+'/report.json',r.stdout);const report=JSON.parse(r.stdout);
 r=session.exec(['git','diff','--binary','HEAD']);if(r.status!==0||r.stdout!==seed)throw Error('Seed changed');fs.writeFileSync(out+'/input.patch',seed);
 fs.writeFileSync(out+'/termination.json',JSON.stringify(stopWorkload(session)));console.log(JSON.stringify({id,baseline:report.baseline,status:report.status,variants:report.variants.map(m=>({diff:m.diff,status:m.status})),cost:report.cost},null,2));
}finally{if(session&&session.close()!==0)throw Error('Cleanup failed');}
