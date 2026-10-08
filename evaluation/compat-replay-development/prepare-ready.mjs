// Sequential, model-free preparation. Success is published only by this launcher.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {command} from '../feedback-development/suite.mjs';
import {privateJSON,hashFile} from '../support/output-files.mjs';
import {repository} from './suite.mjs';
import {sourceManifest,snapshot,verifySourceCommit,verifyReadiness,verifyCI,requiredSteps,preparationCommands} from './readiness.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function executeStep({name,argv,output,env=process.env,timeoutMs=3600000}) {
  const log=path.join(output,name+'.log'),fd=fs.openSync(log,'wx',0o600),startedAt=new Date().toISOString();
  let result;
  try{result=await new Promise(resolve=>{
    let error=null,expired=false,killTimer;
    const child=spawn(argv[0],argv.slice(1),{cwd:repository,env,stdio:['ignore',fd,fd],detached:true});
    const stop=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer??=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000);};
    const interrupt=()=>{error='launcher interrupted';stop();};
    process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
    const timer=setTimeout(()=>{expired=true;stop();},timeoutMs);
    child.on('error',e=>{error=e.message;});
    child.on('close',(exitCode,signal)=>{clearTimeout(timer);clearTimeout(killTimer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);resolve({exitCode,signal,error:expired?'timeout':error});});
  });}finally{fs.closeSync(fd);}
  const step={name,command:argv,startedAt,finishedAt:new Date().toISOString(),status:'completed',...result,log:{path:log,sha256:hashFile(log).sha256}};
  privateJSON(path.join(output,name+'.json'),step);
  if(step.exitCode!==0||step.signal!==null||step.error!==null)throw Error('Preparation failed at '+name+'; see '+log);
  return step;
}
export async function collectCI(sourceCommit,output) {
  const api=route=>JSON.parse(command('gh',['api','repos/Tah10n/opencode-harness/'+route],repository,{timeout:60000,maxBuffer:16*1024*1024}));
  let run;
  for(let i=0;i<90;i++){
    const runs=api('actions/runs?event=pull_request&head_sha='+sourceCommit+'&per_page=100').workflow_runs;
    run=runs.find(r=>r.name==='Verify'&&r.head_branch==='experiment/compat-replay');
    if(run?.status==='completed')break;
    await new Promise(resolve=>setTimeout(resolve,20000));
  }
  if(!run)throw Error('No current CI run');
  run=api('actions/runs/'+run.id);const jobs=api('actions/runs/'+run.id+'/jobs?per_page=100');
  const ci={run,jobs};verifyCI(ci,sourceCommit);
  // Preserve GitHub output, including the checkout commit actually used by each substantive job.
  ci.checkouts=[];
  for(const name of ['Native product and model-free evaluation','Evaluation container boundary']){
    const job=jobs.jobs.find(j=>j.name===name),log=command('gh',['run','view',String(run.id),'--job',String(job.id),'--log'],repository,{timeout:60000,maxBuffer:32*1024*1024});
    const lines=log.split('\n'),at=lines.findIndex(l=>l.includes('git log -1 --format=%H'));
    const commit=at<0?null:lines[at+1]?.match(/\b[a-f0-9]{40}\b/)?.[0];
    if(!commit)throw Error('Cannot establish actual CI checkout');
    command('git',['fetch','--no-tags','origin',commit],repository,{timeout:120000});
    const expected=sourceManifest();
    for(const [file,entry] of Object.entries(expected)){
      const {createHash}=await import('node:crypto');
      if(createHash('sha256').update(command('git',['show',commit+':'+file],repository,{encoding:null})).digest('hex')!==entry.sha256)throw Error('CI checkout inputs differ: '+file);
    }
    const file=path.join(output,'ci-job-'+job.id+'.log');fs.writeFileSync(file,log,{mode:0o600});
    ci.checkouts.push({jobId:job.id,name,commit,sourceManifest:expected,log:{path:file,sha256:hashFile(file).sha256}});
  }
  privateJSON(path.join(output,'ci.json'),ci);
}
export async function prepareReady({output,hostOpenCode,linuxOpenCode,executionImage}) {
  if(![output,hostOpenCode,linuxOpenCode].every(p=>p&&path.isAbsolute(p))||fs.existsSync(output))throw Error('Fresh absolute preparation directory and runtimes required');
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  const sourceCommit=command('git',['rev-parse','HEAD'],repository).trim(),source=sourceManifest();verifySourceCommit(sourceCommit,source);
  const bundle=path.join(output,'assets/bundle'),toolchain=path.join(output,'assets/toolchain');
  const env={...process.env,EVALUATION_IMAGE:executionImage,OPENCODE_BIN:hostOpenCode,OPENCODE_LINUX_BIN:linuxOpenCode,npm_config_cache:path.join(output,'npm-cache')};
  // Optional native flags must not drift from the frozen defaults.
  for(const key of Object.keys(env))if(key.startsWith('HARNESS_'))delete env[key];
  const commands=preparationCommands(output,sourceCommit,linuxOpenCode);
  const steps=[];let inputs;
  for(let i=0;i<commands.length;i++){
    if(!same(sourceManifest(),source))throw Error('Sources changed during preparation');
    if(inputs&&!same(inputs,snapshot({bundle,toolchain,hostOpenCode,executionImage})))throw Error('Runtime changed during preparation');
    console.log('START '+requiredSteps[i]);
    steps.push(await executeStep({name:requiredSteps[i],argv:commands[i],output,env}));
    console.log('PASS '+requiredSteps[i]);
    if(i===2)inputs=snapshot({bundle,toolchain,hostOpenCode,executionImage});
    if(!same(sourceManifest(),source))throw Error('Sources changed during preparation');
  }
  if(!same(inputs,snapshot({bundle,toolchain,hostOpenCode,executionImage})))throw Error('Runtime changed during preparation');
  const r={output,linuxOpenCode,revision:1,runId:'compat-replay-development-v2',status:'ready',sourceCommit,executionImage,hostOpenCode,bundle,toolchain,steps,inputs,ci:JSON.parse(fs.readFileSync(path.join(output,'ci.json'))),completedAt:new Date().toISOString(),realProviderCalls:0};
  const pending=path.join(output,'readiness.pending.json'),dest=path.join(output,'readiness.json');privateJSON(pending,r);
  verifyReadiness(pending,{bundle,toolchain,hostOpenCode,executionImage});fs.renameSync(pending,dest);
  console.log('READY '+dest);return r;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [mode,...args]=process.argv.slice(2);
  if(mode==='assets'){
    const {assets}=await import('../feedback-development/assets.mjs'),{attachProbe,validateExperimentBundle}=await import('./assets.mjs');
    const result=assets({output:args[0],linuxBin:args[1],executionImage:process.env.EVALUATION_IMAGE});attachProbe(result.bundle,process.env.EVALUATION_IMAGE);await validateExperimentBundle(result.bundle);
  }else if(mode==='ci')await collectCI(args[0],args[1]);
  else if(mode==='prepare')await prepareReady({output:args[0],hostOpenCode:args[1],linuxOpenCode:args[2],executionImage:process.env.EVALUATION_IMAGE});
  else throw Error('Usage: prepare-ready.mjs prepare ABS_FRESH_OUTPUT ABS_HOST_OPENCODE ABS_LINUX_OPENCODE');
}
