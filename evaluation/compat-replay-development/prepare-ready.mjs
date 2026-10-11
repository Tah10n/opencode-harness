// Sequential, model-free preparation. Success is published only by this launcher.
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {command} from '../feedback-development/suite.mjs';
import {privateJSON,hashFile} from '../support/output-files.mjs';
import {repository} from './suite.mjs';
import {sourceManifest,snapshot,verifySourceCommit,verifyReadiness,verifyCI,requiredSteps,preparationCommands} from './readiness.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// POSIX preparation groups only. Z/X cannot execute or keep writing the log.
// Do not use kill(-pgid, 0) as proof: it also sees zombies and hides permission errors.
function processTable() {
  const r=spawnSync('/bin/ps',['-axo','pid=,pgid=,stat=,lstart='],{
    encoding:'utf8',env:{...process.env,LC_ALL:'C'},timeout:2000,maxBuffer:8*1024*1024,
  });
  if(r.error||r.status!==0)throw r.error??Error('Cannot inspect preparation group: '+r.stderr.trim());
  return r.stdout.trim().split('\n').map(line=>{
    const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if(!m||!Number.isFinite(Date.parse(m[4])))throw Error('Unknown preparation process state');
    return {pid:+m[1],pgid:+m[2],state:m[3],identity:m[1]+':'+m[4]};
  });
}
const running=p=>! /^[ZX]/.test(p.state);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function executeStep({name,argv,output,env=process.env,timeoutMs=3600000}) {
  const log=path.join(output,name+'.log'),fd=fs.openSync(log,'wx',0o600),startedAt=new Date().toISOString();
  let result;
  try {
    const cleanup={revision:1,pgid:null,verified:false,status:'unverified',signals:[],error:null};
    let child,closed=false,exitCode=null,signal=null,error=null,stopAt=null,closedAt=null,timer;
    let retired=false,observed=false;
    const identities=new Map();
    // Every trigger feeds this one procedure. Repeated cancellation cannot reset
    // the grace period, overwrite the first cause, or install another kill timer.
    const stop=reason=>{error??=reason;stopAt??=performance.now();};
    const interrupt=received=>stop('launcher interrupted: '+received);
    const sigint=()=>interrupt('SIGINT'),sigterm=()=>interrupt('SIGTERM');
    process.on('SIGINT',sigint);process.on('SIGTERM',sigterm);
    const inspect=()=>{
      const pgid=cleanup.pgid;
      if(retired||!Number.isSafeInteger(pgid)||pgid<=1||pgid!==child.pid||pgid===process.pid)throw Error('Invalid or retired preparation group');
      const table=processTable(),own=table.find(p=>p.pid===process.pid);
      if(!own||own.pgid===pgid)throw Error('Preparation group overlaps launcher');
      // Pin observed PID/start identities, including the leader. If an ID is
      // reused, fail closed instead of signalling its new occupant. Once empty,
      // ownership is retired permanently; there is no deferred unconditional kill.
      const leader=table.find(p=>p.pid===pgid);
      if(leader&&leader.pgid!==pgid)throw Error('Preparation leader changed group');
      for(const p of table)if(identities.has(p.pid)&&identities.get(p.pid)!==p.identity)throw Error('Preparation process identity changed');
      const members=table.filter(p=>p.pgid===pgid);
      if(!observed&&leader&&leader.pgid===pgid)observed=true;
      if(members.length&&!observed)throw Error('Preparation group ownership unverified');
      for(const p of members)identities.set(p.pid,p.identity);
      const live=members.filter(running);
      if(!live.length)retired=true;
      return live;
    };
    const send=kind=>{
      // Re-inspect immediately before each signal, including escalation.
      if(!inspect().length)return;
      try { process.kill(-cleanup.pgid,kind);cleanup.signals.push(kind); }
      catch(e) { if(e.code!=='ESRCH')throw e; }
    };
    try {
      if(!['linux','darwin'].includes(process.platform))throw Error('POSIX preparation groups required');
      child=spawn(argv[0],argv.slice(1),{cwd:repository,env,stdio:['ignore',fd,fd],detached:true});
      const spawned=new Promise(resolve=>{
        child.once('spawn',()=>{cleanup.pgid=child.pid;resolve();});
        child.once('error',e=>{stop(e.message);resolve();});
      });
      child.once('close',(code,received)=>{
        exitCode=code;signal=received;closed=true;closedAt=performance.now();
        // Preserve the real command facts, and don't cancel cleanup on close.
        if(code!==0||received!==null)stop('command terminated: '+(received??code));
      });
      timer=setTimeout(()=>stop('timeout'),timeoutMs);
      await spawned;
      if(cleanup.pgid===null) {
        // A failed spawn has no group: never turn an undefined PID into a signal.
        await new Promise(resolve=>closed?resolve():child.once('close',resolve));
        cleanup.verified=true;cleanup.status='not-started';
      } else {
        // Establish ownership while the new detached leader is still present.
        let live=inspect(),termSent=false,killSent=false,termAt=null,emptyAt=null;
        for(;;) {
          if(!live.length) {
            emptyAt??=performance.now();
            if(closed) { cleanup.verified=true;cleanup.status=termSent?'stopped':'empty';break; }
            if(performance.now()-emptyAt>=1000)throw Error('Preparation parent close unverified');
          } else {
            // Allow a short natural drain after exit 0, never the full kill grace.
            if(closed&&stopAt===null&&performance.now()-closedAt>=100)stop('parent left running descendants');
            if(stopAt!==null) {
              if(!termSent) { send('SIGTERM');termSent=true;termAt=performance.now(); }
              if(!retired&&performance.now()-termAt>=5000&&!killSent) { send('SIGKILL');killSent=true; }
              if(performance.now()-termAt>=6000)throw Error('Preparation group termination unverified');
            }
          }
          await pause(25);
          live=retired?[]:inspect();
        }
      }
    } catch(e) {
      error??=e.message;cleanup.error=e.message;
      // No verified observation means no safe group signal and no final log hash.
    } finally {
      clearTimeout(timer);
      process.removeListener('SIGINT',sigint);process.removeListener('SIGTERM',sigterm);
    }
    result={exitCode,signal,error,cleanup};
  } finally { fs.closeSync(fd); }
  const stable=result.cleanup.verified;
  const step={name,command:argv,startedAt,finishedAt:new Date().toISOString(),status:'completed',...result,log:{path:log,sha256:stable?hashFile(log).sha256:null,stable}};
  privateJSON(path.join(output,name+'.json'),step);
  if(step.exitCode!==0||step.signal!==null||step.error!==null||!step.cleanup.verified)throw Error('Preparation failed at '+name+'; see '+log);
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
    const job=jobs.jobs.find(j=>j.name===name),log=command('gh',['api','--allow-escape-sequences','repos/Tah10n/opencode-harness/actions/jobs/'+job.id+'/logs'],repository,{timeout:60000,maxBuffer:32*1024*1024});
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
  privateJSON(path.join(output,'ci-metadata.json'),ci);
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
  const r={output,linuxOpenCode,revision:1,runId:'compat-replay-development-v2',status:'ready',sourceCommit,executionImage,hostOpenCode,bundle,toolchain,steps,inputs,ci:JSON.parse(fs.readFileSync(path.join(output,'ci-metadata.json'))),completedAt:new Date().toISOString(),realProviderCalls:0};
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
