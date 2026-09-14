// Post-stop verification only. No evaluator or offline result is sent to authors.
import fs from 'node:fs';import path from 'node:path';import {spawn,execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {projectCheck} from '../../native-task-ab/project-check.mjs';
import {startContainer} from '../../native-task-ab/container-session.mjs';
import {stopWorkload} from '../../native-task-utility/container/stop-workload.mjs';
import {script} from '../../native-task-h00-transfer/evaluation-cases.mjs';
const root=path.resolve(process.argv[2]),f=JSON.parse(fs.readFileSync(root+'/freeze.json')),read=p=>JSON.parse(fs.readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
if(!['finished','paused'].includes(read(root+'/outcome.json').status))throw Error('Runs must stop before verification');
const ignored=new Set(['.git','node_modules','coverage','.nyc_output','dist','.pnpm-store']);
function files(dir){const out={};const walk=(d,p='')=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){if(ignored.has(e.name))continue;const n=p+e.name,filename=path.join(d,e.name);if(e.isDirectory())walk(filename,n+'/');else if(e.isFile()){out[n]=fs.readFileSync(filename);out[n].executable=!!(fs.statSync(filename).mode&0o111);}else throw Error('Unsupported delivered file: '+n);}};walk(dir);return out;}
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024});
for(const a of f.attempts){
 const run=root+'/runs/'+a.task+'-'+a.arm,out=root+'/checks/'+a.task+'-'+a.arm;
 if(!fs.existsSync(run))continue;
 const stop=read(run+'/stop-verification.json');if(!stop.terminationVerified||!stop.relayRemoved||stop.activeProviderHandlers)throw Error('Unverified model stop');
 if(fs.existsSync(out))throw Error('Do not overwrite verification');fs.mkdirSync(out,{recursive:true});
 if(!fs.existsSync(run+'/candidate'))execFileSync('python3',['development/native-task-ab/extract-candidate.py',run+'/candidate.tar',run+'/candidate']);
 const taskRoot=run+'/candidate/.git/harness-task',ids=fs.readdirSync(taskRoot).filter(n=>fs.existsSync(taskRoot+'/'+n+'/worktree'));
 if(ids.length!==1)throw Error('No unique delivery worktree');const artifacts=taskRoot+'/'+ids[0],delivery=artifacts+'/worktree';
 const before=files(a.source),after=files(delivery),omitted=[];
 if(before['package-lock.json']&&!after['package-lock.json']){const upstream=path.resolve('local/native-task-h00-transfer/sources/denque');if(git(upstream,['ls-files','package-lock.json']).trim()||git(upstream,['check-ignore','package-lock.json']).trim()!=='package-lock.json')throw Error('Unproven prepared lock omission');delete before['package-lock.json'];omitted.push('prepared ignored package-lock.json');}
 const copy=out+'/ordinary-git-copy';fs.mkdirSync(copy);
 for(const[n,b]of Object.entries(before)){fs.mkdirSync(path.dirname(copy+'/'+n),{recursive:true});fs.writeFileSync(copy+'/'+n,b);fs.chmodSync(copy+'/'+n,b.executable?0o755:0o644);}
 git(copy,['init','-q']);git(copy,['add','--all','--force']);git(copy,['-c','user.name=Patch verification','-c','user.email=patch@localhost','-c','commit.gpgsign=false','commit','-qm','Prepared public baseline']);
 const terminal=artifacts+'/terminal.patch',terminalApplicable=fs.existsSync(terminal);let patch;
 if(terminalApplicable){patch=fs.readFileSync(terminal,'utf8');git(copy,['apply','--check',terminal]);git(copy,['apply',terminal]);}
 else{for(const n of Object.keys(before))if(!after[n])fs.unlinkSync(copy+'/'+n);for(const[n,b]of Object.entries(after)){fs.mkdirSync(path.dirname(copy+'/'+n),{recursive:true});fs.writeFileSync(copy+'/'+n,b);fs.chmodSync(copy+'/'+n,b.executable?0o755:0o644);}git(copy,['add','--all','--force']);patch=git(copy,['diff','--cached','--binary']);git(copy,['reset','--hard','HEAD']);fs.writeFileSync(out+'/captured.patch',patch);git(copy,['apply','--check',out+'/captured.patch']);git(copy,['apply',out+'/captured.patch']);}
 const got=files(copy);if(Object.keys(got).length!==Object.keys(after).length||Object.entries(after).some(([n,b])=>!got[n]?.equals(b)||got[n].executable!==b.executable))throw Error('Terminal patch does not reproduce delivered source bytes/modes');
 if(/harness-sense-|native-sensitivity|\/work\/|\/template\/|stryker/i.test(patch))throw Error('Internal diagnostic content in delivery');
 fs.writeFileSync(out+'/verified.patch',patch);
 const overlay={'.delivery.patch':Buffer.from(patch).toString('base64')},apply='git apply --check .delivery.patch && git apply .delivery.patch && rm .delivery.patch';
 const ordinary=await projectCheck({source:a.source,output:out+'/ordinary',toolchain:f.toolchain,overlay,command:['sh','-c',apply+' && npm test']});
 const independent=await projectCheck({source:a.source,output:out+'/independent',toolchain:f.toolchain,overlay:{...overlay,'.independent.cjs':Buffer.from(script(a.originalTask,a.project)).toString('base64')},command:['sh','-c',apply+' && timeout 10s node .independent.cjs']});
 let session,offline;
 try{
  session=await startContainer({source:a.source,toolchain:f.toolchain,template:f.template,output:out+'/offline-session',onRequest(){throw Error('Offline checks cannot request a model');}});
  let r=session.exec(['node','-e',`const r=require('child_process').spawnSync('git',['apply','-'],{input:${JSON.stringify(patch)},encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);`]);if(r.status!==0)throw Error(r.stderr);
  const code=`import fs from 'node:fs';import {sensitivityPlan} from '/template/native-sensitivity.mjs';import {runSensitivity} from '/template/native-sensitivity-runner.mjs';const rules=[{permission:'*',pattern:'*',action:'allow'}],args={path:'index.js',check:'npm test'};const p=sensitivityPlan({directory:'/work/repo',rules,args});const r=await runSensitivity({args,rules,base:'HEAD',snapshot:p.snapshot,budgetMs:180000},{directory:'/work/repo'});fs.writeFileSync('/work/offline.json',JSON.stringify(r));`;
  r=session.exec(['node','-e',`require('fs').writeFileSync('/work/offline.mjs',${JSON.stringify(code)})`]);if(r.status!==0)throw Error(r.stderr);
  const child=spawn('docker',['exec','--workdir','/work/repo',session.name,'node','/work/offline.mjs'],{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  const timer=setTimeout(()=>{stopWorkload(session);child.kill('SIGTERM');},200000);const exit=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});clearTimeout(timer);if(exit!==0)throw Error(output);
  r=session.exec(['cat','/work/offline.json']);if(r.status!==0)throw Error(r.stderr);offline=JSON.parse(r.stdout);fs.writeFileSync(out+'/offline-sensitivity.json',r.stdout);
  fs.writeFileSync(out+'/offline-stop.json',JSON.stringify(stopWorkload(session)));
 }finally{if(session&&session.close()!==0)throw Error('Offline cleanup failed');}
 const changedFromSeed=[];for(const[n,b]of Object.entries(after)){const expected=f.inputManifests[a.task+'-'+a.arm][n];if(!expected||expected.sha256!==sha(b)||expected.executable!==b.executable)changedFromSeed.push(n);}
 const row={case:a.task,arm:a.arm,terminalApplicable,patchKind:terminalApplicable?'native-terminal':'captured-interrupted-worktree',authorBytesAndModesMatched:true,internalPathsAbsent:true,patchSha256:sha(patch),omitted,changedFromSeed,ordinary,independent,offline:{status:offline.status,baseline:offline.baseline?.status,engineExecuted:offline.engineExecuted,variants:offline.variants.map(m=>({operator:m.mutatorName,diff:m.diff,status:m.status,output:m.output})),cost:offline.cost,terminationVerified:offline.terminationVerified},assessment:'Manual full-patch and relevant assertion review required; offline observations are not author tool calls.'};
 fs.writeFileSync(out+'/verification.json',JSON.stringify(row,null,2));console.log(JSON.stringify({case:a.task,arm:a.arm,ordinary:ordinary.exit,independent:independent.exit,terminalApplicable,patchKind:terminalApplicable?'native-terminal':'captured-interrupted-worktree',changedFromSeed,offline:row.offline.status}));
}
