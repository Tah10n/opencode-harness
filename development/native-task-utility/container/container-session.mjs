import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

export const image='sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6';
export async function startContainer({source,toolchain,template,output,onRequest}) {
  for(const p of [source,toolchain,output,...(template?[template]:[])])if(!path.isAbsolute(p))throw Error('absolute paths required');
  fs.mkdirSync(output,{mode:0o700});
  const name=`template-dev-${randomUUID()}`;
  const relay=fileURLToPath(new URL('./container-relay.mjs',import.meta.url));
  // Reap orphaned test/CLI descendants; the relay itself is not an init process.
  const argv=['run','--init','-i','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--pids-limit','512','--memory','2g','--cpus','2','--user','node',
    '--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--tmpfs','/work:rw,exec,nosuid,uid=1000,gid=1000,mode=0700,size=512m',
    '--mount',`type=bind,source=${source},target=/input,readonly`,
    '--mount',`type=bind,source=${path.join(toolchain,'package/bin/opencode')},target=/opt/opencode,readonly`,
    '--mount',`type=bind,source=${relay},target=/relay.mjs,readonly`,
    ...(template?['--mount',`type=bind,source=${template},target=/template,readonly`]:[]),
    ...Object.entries({HOME:'/work/home',TMPDIR:'/work/tmp',XDG_CONFIG_HOME:'/work/config',XDG_DATA_HOME:'/work/data',
      XDG_CACHE_HOME:'/work/cache',XDG_STATE_HOME:'/work/state',OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true'}).flatMap(([k,v])=>['--env',`${k}=${v}`]),
    image,'node','/relay.mjs'];
  fs.writeFileSync(path.join(output,'container.json'),JSON.stringify({name,image,argv},null,2));
  const child=spawn('docker',argv,{stdio:['pipe','pipe','pipe']});
  let stderr='';child.stderr.on('data',x=>stderr+=x);
  const requests=new Map();let readyResolve,readyReject,relayPid;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const send=frame=>{if(child.stdin.writable)child.stdin.write(JSON.stringify(frame)+'\n');};
  const lines=readline.createInterface({input:child.stdout});
  lines.on('line',line=>{
    let frame;try{frame=JSON.parse(line);}catch{readyReject(Error('invalid relay frame'));return;}
    if(frame.type==='ready'){if(!Number.isSafeInteger(frame.pid)||frame.pid<=1){readyReject(Error('Invalid init-managed relay PID'));return;}relayPid=frame.pid;readyResolve();return;}
    if(frame.type==='cancel'){requests.get(frame.id)?.abort();return;}
    if(frame.type!=='request')return;
    const controller=new AbortController();requests.set(frame.id,controller);
    Promise.resolve().then(()=>onRequest(frame,f=>send({...f,id:frame.id}),controller.signal))
      .catch(()=>send({type:'error',id:frame.id})).finally(()=>requests.delete(frame.id));
  });
  child.once('error',readyReject);
  child.once('close',()=>{readyReject(Error(`container exited: ${stderr}`));for(const c of requests.values())c.abort();});
  const timer=setTimeout(()=>readyReject(Error('container readiness timed out')),30000);
  const close=()=>{
    for(const c of requests.values())c.abort();
    const result=spawnSync('docker',['rm','--force',name],{encoding:'utf8',timeout:15000});
    fs.writeFileSync(path.join(output,'cleanup.json'),JSON.stringify({status:result.status,stderr:result.stderr,containerStderr:stderr},null,2));
    return result.status;
  };
  try{await ready;}catch(error){close();throw error;}finally{clearTimeout(timer);}
  const exec=argv=>spawnSync('docker',['exec','--workdir','/work/repo',name,...argv],{encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});
  return {name,relayPid,exec,close,output};
}
