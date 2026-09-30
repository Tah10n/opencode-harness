// Service artifact from the actual isolated tree; never comes from model text.
import fs from 'node:fs';import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {hashFile,privateJSON} from './output-files.mjs';
export const inputLimits=Object.freeze({bytes:128*1024*1024,entries:500000,milliseconds:120000});

// Self-contained producer, executed by the container's trusted Node. Stream
// JSON entries directly to the owned host file, not session.exec's stdout buffer.
function produce(binding,bounds){
 const fs=require('fs'),path=require('path'),{createHash}=require('crypto');
 const start=Date.now(),digest=createHash('sha256');let bytes=0,entries=0;
 const check=()=>{if(Date.now()-start>=bounds.milliseconds)throw Error('Input manifest time limit');};
 const write=text=>{check();const b=Buffer.from(text);bytes+=b.length;if(bytes>bounds.bytes)throw Error('Input manifest byte limit');digest.update(b);let at=0;while(at<b.length)at+=fs.writeSync(1,b,at,b.length-at);};
 fs.writeSync(2,JSON.stringify({type:'started',pid:process.pid,run:binding.run})+'\n');
 const content=file=>{const h=createHash('sha256'),fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),buffer=Buffer.alloc(65536);try{for(let n;(n=fs.readSync(fd,buffer,0,buffer.length,null));){check();h.update(buffer.subarray(0,n));}}finally{fs.closeSync(fd);}return h.digest('hex');};
 const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
 const visit=(directory,prefix='')=>{check();const d=fs.opendirSync(directory,{encoding:'buffer'});try{for(let e;(e=d.readSync());){check();const entry=decoder.decode(e.name);if(entry==='.git')continue;const file=path.join(directory,entry),name=prefix+entry,s=fs.lstatSync(file);if(s.isDirectory()){visit(file,name+'/');continue;}if(++entries>bounds.entries)throw Error('Input manifest entry limit');let value;
  if(s.isSymbolicLink()){const target=decoder.decode(fs.readlinkSync(file,{encoding:'buffer'})),resolved=path.resolve(path.dirname(file),target);if(path.isAbsolute(target)||(resolved!==binding.root&&!resolved.startsWith(binding.root+'/')))throw Error('External dependency link: '+name);value={symlink:target};}
  else if(s.isFile())value={sha256:content(file),executable:!!(s.mode&0o111)};else throw Error('Unsupported input: '+name);
  write((entries===1?'':',')+JSON.stringify(name)+':'+JSON.stringify(value));
 }}finally{d.closeSync();}};
 write('{');visit(binding.root);write('}');
 fs.writeSync(2,JSON.stringify({type:'complete',binding,bytes,entries,sha256:digest.digest('hex')})+'\n');
}

export const inputManifestScript=(binding,bounds=inputLimits)=>`(${produce.toString()})(${JSON.stringify(binding)},${JSON.stringify(bounds)})`;

export async function captureInputManifest(session,directory,{bounds=inputLimits,signal,spawnProcess=spawn}={}){
 for(const k of Object.keys(inputLimits))if(!Number.isSafeInteger(bounds[k])||bounds[k]<=0||bounds[k]>inputLimits[k])throw Error('Invalid input manifest bound');
 signal?.throwIfAborted();
 const identity=session.evidenceIdentity;
 if(!identity||identity.name!==session.name||!/^\w{64}$/.test(identity.id)||!identity.node)throw Error('Input container identity unavailable');
 const inspection=spawnSync('docker',['inspect',identity.id],{encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
 if(inspection.error||inspection.signal||inspection.status!==0)throw Error('Input container inspection failed');
 const state=JSON.parse(inspection.stdout)[0];
 if(state.Id!==identity.id||!state.State.Running||state.HostConfig.NetworkMode!=='none'||!state.HostConfig.Tmpfs?.['/work'])throw Error('Input container identity changed');
 const binding={containerID:identity.id,session:session.name,run:randomUUID(),root:'/work/repo'};
 const destination=path.join(directory,'actual-input-manifest.json'),tmp=destination+'.'+binding.run+'.tmp';
 const fd=fs.openSync(tmp,'wx',0o600);let closed=false;
 const started=Date.now();
 try{
  const completion=await new Promise((resolve,reject)=>{
   const child=spawnProcess('docker',['exec',identity.id,identity.node,'-e',inputManifestScript(binding,bounds)],{stdio:['ignore',fd,'pipe']});
   let stderr='',failure=null,pid=null,killed=false;
   const stop=error=>{
    failure??=error;
    // Only the producer advertised by this invocation may be killed. Verify its
    // unique run token before using the PID; the producer has no descendants.
    if(pid&&!killed){killed=true;const r=spawnSync('docker',['exec',identity.id,identity.node,'-e',`const fs=require('fs');try{const c=fs.readFileSync('/proc/${pid}/cmdline','utf8');if(!c.includes(${JSON.stringify(binding.run)}))throw Error('Producer identity changed');process.kill(${pid},'SIGKILL');}catch(e){if(e.code!=='ENOENT'&&e.code!=='ESRCH')throw e;}`],{encoding:'utf8',timeout:5000,maxBuffer:8192});if(r.error||r.signal||r.status!==0)failure=Error('Input producer termination unverified');}
    if(pid)child.kill('SIGKILL');
   };
   child.stderr.on('data',b=>{
    stderr+=b.toString();if(Buffer.byteLength(stderr)>8192){stop(Error('Input manifest control limit'));child.kill('SIGKILL');return;}
    if(!pid&&stderr.includes('\n')){try{const ready=JSON.parse(stderr.split('\n')[0]);if(ready.type!=='started'||ready.run!==binding.run||!Number.isSafeInteger(ready.pid)||ready.pid<=1)throw Error('Invalid input producer identity');pid=ready.pid;if(failure)stop(failure);}catch(e){stop(e);child.kill('SIGKILL');}}
   });
   const abort=()=>stop(signal.reason??Error('Input manifest cancelled'));
   const timer=setTimeout(()=>{stop(Error('Input manifest time limit'));child.kill('SIGKILL');},bounds.milliseconds);
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   child.once('error',e=>{failure??=e;});
   child.once('close',(code,endedSignal)=>{
    clearTimeout(timer);signal?.removeEventListener('abort',abort);
    if(failure||endedSignal||code!==0)return reject(failure??Error('Input manifest producer failed: '+stderr));
    try{const lines=stderr.trim().split('\n');if(lines.length!==2)throw Error('Incomplete input manifest control');const done=JSON.parse(lines[1]);if(done.type!=='complete'||JSON.stringify(done.binding)!==JSON.stringify(binding))throw Error('Input manifest binding mismatch');resolve(done);}catch(e){reject(e);}
   });
  });
  fs.closeSync(fd);closed=true;signal?.throwIfAborted();
  if(fs.statSync(tmp).size>bounds.bytes)throw Error('Input manifest byte limit');
  const actual=hashFile(tmp);
  if(actual.size>bounds.bytes||actual.size!==completion.bytes||actual.sha256!==completion.sha256)throw Error('Input manifest integrity mismatch');
  // Fatal decoding avoids silently replacing an unrepresentable path.
  const got=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(fs.readFileSync(tmp)));
  const count=Object.keys(got).length;
  if(count>bounds.entries||count!==completion.entries)throw Error('Input manifest entry count mismatch');
  if(Date.now()-started>=bounds.milliseconds)throw Error('Input manifest time limit');
  if(fs.existsSync(destination))throw Error('Input manifest destination already exists');
  fs.renameSync(tmp,destination);
  const receipt={...completion,elapsedMs:Date.now()-started,limits:bounds};privateJSON(path.join(directory,'actual-input-receipt.json'),receipt);
  return {manifest:got,receipt};
 }finally{if(!closed)fs.closeSync(fd);if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}

export function compareInputManifest(got,expected){
 if(!expected||Object.keys(got).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>!Object.hasOwn(got,k)||JSON.stringify(got[k])!==JSON.stringify(v)))throw Error('Actual model container input mismatch');
}
