// New series deadline only; original containment and relay policy retained.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {outputRoot,privateJSON} from '../native-output-retention/output-files.mjs';

export const image='sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6';
export async function startContainer({source,toolchain,template,output,onRequest,workMemoryMb=512,memoryMb=2048,preparedEnvironment=null}) {
  for(const p of [source,toolchain,output,...(template?[template]:[])])if(!path.isAbsolute(p))throw Error('absolute paths required');
  fs.mkdirSync(output,{mode:0o700});
  if (preparedEnvironment && (!/^sha256:[a-f0-9]{64}$/.test(preparedEnvironment.image) || preparedEnvironment.node !== '/diagnostic/node' || typeof preparedEnvironment.projectPath !== 'string' || preparedEnvironment.projectPath.includes('\n'))) throw Error('Invalid prepared benchmark environment');
  const selectedImage=preparedEnvironment?.image??image;
  const selectedNode=preparedEnvironment?.node??'node';
  const maxWork=preparedEnvironment?8192:1536,maxMemory=preparedEnvironment?12288:3072;
  if (!Number.isSafeInteger(workMemoryMb) || workMemoryMb < 512 || workMemoryMb > maxWork || !Number.isSafeInteger(memoryMb) || memoryMb < 2048 || memoryMb > maxMemory) throw Error('Unsupported development container memory bound');
  const name=`template-dev-${randomUUID()}`;
  const relay=fileURLToPath(new URL('./container-relay.mjs',import.meta.url));
  // Reap orphaned test/CLI descendants; the relay itself is not an init process.
  const argv=['run',...(preparedEnvironment?['--platform','linux/amd64','--workdir','/']:[]),'--init','-i','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--pids-limit','512','--memory',`${memoryMb}m`,'--cpus','2','--user',preparedEnvironment?'1000:1000':'node',
    '--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--tmpfs',`/work:rw,exec,nosuid,uid=1000,gid=1000,mode=0700,size=${workMemoryMb}m`,
    '--mount',`type=bind,source=${source},target=/input,readonly`,
    '--mount',`type=bind,source=${path.join(toolchain,'package/bin/opencode')},target=/opt/opencode,readonly`,
    '--mount',`type=bind,source=${relay},target=/relay.mjs,readonly`,
    ...(template?['--mount',`type=bind,source=${template},target=/template,readonly`]:[]),
    ...Object.entries({HOME:'/work/home',TMPDIR:'/work/tmp',XDG_CONFIG_HOME:'/work/config',XDG_DATA_HOME:'/work/data',
      XDG_CACHE_HOME:'/work/cache',XDG_STATE_HOME:'/work/state',OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true'}).flatMap(([k,v])=>['--env',`${k}=${v}`]),
    selectedImage,selectedNode,'/relay.mjs'];
  fs.writeFileSync(path.join(output,'container.json'),JSON.stringify({name,image:selectedImage,argv},null,2));
  const child=spawn('docker',argv,{stdio:['pipe','pipe','pipe']});
  let stderr='';child.stderr.on('data',x=>stderr+=x);
  let forwardingClosed=false,session;
  const requests=new Map();let readyResolve,readyReject,relayPid;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const send=frame=>{if(child.stdin.writable)child.stdin.write(JSON.stringify(frame)+'\n');};
  const lines=readline.createInterface({input:child.stdout});
  lines.on('line',line=>{
    let frame;try{frame=JSON.parse(line);}catch{readyReject(Error('invalid relay frame'));return;}
    if(frame.type==='ready'){if(!Number.isSafeInteger(frame.pid)||frame.pid<=1){readyReject(Error('Invalid init-managed relay PID'));return;}relayPid=frame.pid;readyResolve();return;}
    if(frame.type==='cancel'){requests.get(frame.id)?.abort();return;}
    if(frame.type!=='request')return;
    if(forwardingClosed){send({type:'error',id:frame.id});return;}
    const controller=new AbortController();requests.set(frame.id,controller);
    Promise.resolve().then(()=>onRequest(frame,f=>send({...f,id:frame.id}),controller.signal))
      .catch(()=>send({type:'error',id:frame.id})).finally(()=>requests.delete(frame.id));
  });
  child.once('error',readyReject);
  child.once('close',()=>{readyReject(Error(`container exited: ${stderr}`));for(const c of requests.values())c.abort();});
  // Prepared public projects can exceed a gigabyte; allow bounded input-copy
  // preparation before the unchanged provider/task deadline starts.
  const timer=setTimeout(()=>readyReject(Error('container readiness timed out')),preparedEnvironment?120000:30000);
  const close=()=>{
    forwardingClosed=true;
    for(const c of requests.values())c.abort();
    if(session?.evidenceRequired&&!session.evidenceComplete){
      try{
        const termination=stopWorkload(session);
        const stopped=session.exec(['node','-e',`process.kill(${relayPid},'SIGSTOP');const fs=require('fs');for(let i=0;i<100;i++){const stat=fs.readFileSync('/proc/${relayPid}/stat','utf8');if(stat.slice(stat.lastIndexOf(') ')+2)[0]==='T')process.exit(0);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}throw Error('Relay not stopped');`]);
        if(stopped.status!==0)throw Error('Relay suspension unverified');
        const retained={name,containerID:session.evidenceIdentity.id,relayPid,baseline:session.evidenceBaseline??session.baseline,arm:session.arm??null,state:'running-container; relay SIGSTOP; workload terminated',forwardingClosed:true,termination,reason:'evidence_incomplete',recovery:'Use development/native-output-retention/recover.mjs with this result directory; copy existing data only, then remove this container.'};
        session.retainedResource=retained;
        try{privateJSON(path.join(output,'retained-resource.json'),retained);}catch(error){console.error(JSON.stringify({...retained,recordWriteError:error.message}));}
        // The suspended relay cannot observe EOF or execute workload. Detach the
        // local client so a retained tmpfs does not keep the launcher alive.
        lines.close();child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();child.unref();
        return 2;
      }catch(error){try{privateJSON(path.join(output,'retention-failed.json'),{error:error.message,possibleDataLoss:true});}catch{console.error(JSON.stringify({name,error:error.message,possibleDataLoss:true}));}}
    }
    const result=spawnSync('docker',['rm','--force',name],{encoding:'utf8',timeout:15000});
    fs.writeFileSync(path.join(output,'cleanup.json'),JSON.stringify({status:result.status,stderr:result.stderr,containerStderr:stderr},null,2));
    return result.status;
  };
  try{await ready;}catch(error){close();throw error;}finally{clearTimeout(timer);}
  const exec=argv=>spawnSync('docker',['exec','--workdir','/work/repo',name,...(argv[0]==='node'?[selectedNode,...argv.slice(1)]:argv)],{encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});
  const inspected=spawnSync('docker',['inspect',name],{encoding:'utf8',timeout:5000});
  if(inspected.status!==0){close();throw Error('Container identity unavailable');}
  const identity=JSON.parse(inspected.stdout)[0];
  session={name,relayPid,exec,close,output,preparedEnvironment,evidenceIdentity:Object.freeze({id:identity.Id,name,root:outputRoot,node:selectedNode}),setTaskBudget(milliseconds){if(!Number.isFinite(milliseconds)||milliseconds<=0||milliseconds>3600000)throw Error('Invalid relay task budget');send({type:'task-budget',milliseconds});}};
  return session;
}
