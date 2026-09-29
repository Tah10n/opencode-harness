// Development evidence only. Never feeds captured bytes back to an author.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
export const limits=Object.freeze({fileBytes:64*1024*1024,totalBytes:256*1024*1024,files:128,exportMs:30000});
export const outputRoot='/work/data/opencode/tool-output';
const digest=b=>createHash('sha256').update(b).digest('hex');
export function hashFile(file){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),h=createHash('sha256'),buf=Buffer.alloc(65536);let size=0;try{for(let n;(n=fs.readSync(fd,buf,0,buf.length,null));){h.update(buf.subarray(0,n));size+=n;}}finally{fs.closeSync(fd);}return {size,sha256:h.digest('hex')};}
export function privateJSON(file,value){const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});fs.renameSync(tmp,file);}
// Executed only after workload quiescence. Directory components and opened inode
// are checked independently; no shell, tar dereference, or receipt-derived command.
function sourceProgram(root,selected,maxBytes){
 const fs=require('fs'),crypto=require('crypto');
 let current='';for(const component of root.split('/').filter(Boolean)){current+='/'+component;try{const s=fs.lstatSync(current);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Unsafe output root component');}catch(e){if(e.code==='ENOENT'&&current===root){console.log(JSON.stringify({files:[]}));process.exit(0);}throw e;}}
 if(selected===null){const files=[];const dir=fs.opendirSync(root);try{for(let e;(e=dir.readSync());){if(files.length>=129)throw Error('Output file count limit');const s=fs.lstatSync(root+'/'+e.name);files.push({name:e.name,size:s.size,dev:s.dev,ino:s.ino,mtimeMs:s.mtimeMs,safe:s.isFile()&&!s.isSymbolicLink()&&s.nlink===1});}}finally{dir.closeSync();}console.log(JSON.stringify({files}));return;}
 if(!/^tool_[A-Za-z0-9_-]+$/.test(selected.name))throw Error('Unsafe native output name');
 const fd=fs.openSync(root+'/'+selected.name,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{const before=fs.fstatSync(fd);if(!before.isFile()||before.nlink!==1||before.dev!==selected.dev||before.ino!==selected.ino||before.size!==selected.size||before.size>maxBytes)throw Error('Unsafe or changed output inode');
 const hash=crypto.createHash('sha256'),buf=Buffer.alloc(65536);let size=0;
 for(let n;(n=fs.readSync(fd,buf,0,buf.length,null));){size+=n;if(size>maxBytes)throw Error('Output file limit');hash.update(buf.subarray(0,n));let at=0;while(at<n)at+=fs.writeSync(1,buf,at,n-at);}
 const after=fs.fstatSync(fd);if(size!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.nlink!==1)throw Error('Source changed during export');
 fs.writeSync(2,JSON.stringify({size,sha256:hash.digest('hex')}));
 }finally{fs.closeSync(fd);}
}
const script=(selected,max)=>`(${sourceProgram.toString()})(${JSON.stringify(outputRoot)},${JSON.stringify(selected)},${max})`;
export function captureOutputs(session,directory,{bounds=limits,copy=spawnSync}={}){
 for(const key of Object.keys(limits))if(!Number.isSafeInteger(bounds[key])||bounds[key]<=0||bounds[key]>limits[key])throw Error('Invalid output export bound');
 const started=Date.now(),manifest={version:1,runID:session.name,containerID:session.evidenceIdentity?.id??null,sourceRoot:outputRoot,sourceKind:'native combined tool output',limits:bounds,files:[],errors:[],evidenceComplete:false};
 const fail=e=>manifest.errors.push(e.message??String(e));
 const target=path.join(directory,'native-output');
 try{
  fs.mkdirSync(target,{mode:0o700});
 }catch(e){if(e.code!=='EEXIST')throw e;const s=fs.lstatSync(target);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('Unsafe private output destination');}
 try{
  const identity=session.evidenceIdentity;
  if(!identity||identity.root!==outputRoot||identity.name!==session.name)throw Error('Fresh isolated output root identity unavailable');
  const inspection=spawnSync('docker',['inspect',session.name],{encoding:'utf8',timeout:5000,maxBuffer:1024*1024});if(inspection.status!==0)throw Error('Container ownership inspection failed');
  const state=JSON.parse(inspection.stdout)[0];if(state.Id!==identity.id||!state.State.Running||state.HostConfig.NetworkMode!=='none'||!state.HostConfig.Tmpfs?.['/work']||!state.Config.Env.includes('XDG_DATA_HOME=/work/data'))throw Error('Container output root identity changed');
  const listing=spawnSync('docker',['exec',session.name,identity.node,'-e',script(null,bounds.fileBytes)],{encoding:'utf8',timeout:Math.max(1,bounds.exportMs-(Date.now()-started)),maxBuffer:256*1024});if(listing.status!==0)throw Error('Output inventory failed: '+listing.stderr);
  const inventory=JSON.parse(listing.stdout).files;if(inventory.length>bounds.files)throw Error('Output file count limit');
  let tools=[];try{const value=JSON.parse(fs.readFileSync(path.join(directory,'native-evidence.json'),'utf8')).tools;if(!Array.isArray(value))throw Error('Invalid native tool records');tools=value;}catch(e){fail(Error('Native linkage unavailable: '+e.message));}
  const links=new Map();
  for(const tool of tools??[]){const p=tool?.data?.state?.metadata?.outputPath;if(typeof p!=='string')continue;
   if(!p.startsWith(outputRoot+'/')||!/^tool_[A-Za-z0-9_-]+$/.test(p.slice(outputRoot.length+1))){fail(Error('Rejected metadata output reference'));continue;}
   const refs=links.get(p)??[];refs.push({sessionID:tool.session_id??tool.data.sessionID??null,callID:tool.data.callID??null,partID:tool.id??null,status:tool.data.state.status,exit:tool.data.state.metadata.exit??null});links.set(p,refs);
  }
  let total=0;
  for(const source of inventory){
   const reference=outputRoot+'/'+source.name,refs=links.get(reference)??[];links.delete(reference);
   const item={sourceReference:reference,links:refs,destination:'native-output/'+digest(reference)+'.bin',status:'error',archiveComplete:false,sourceCompleteness:'unknown',sourceCompletenessReason:'Native file bytes verified separately; command completion alone does not exclude internal output limits',linkStatus:refs.some(r=>r.sessionID&&r.callID)?'linked':'unlinked',...(!refs.some(r=>r.sessionID&&r.callID)?{reason:'No confirmed sessionID/callID linkage'}:{})};manifest.files.push(item);
   let tmp,fd;
   try{
    if(!source.safe||!/^tool_[A-Za-z0-9_-]+$/.test(source.name))throw Error('Unsafe output file');
    total+=source.size;if(source.size>bounds.fileBytes||total>bounds.totalBytes)throw Error('Output byte limit');
    const remaining=bounds.exportMs-(Date.now()-started);if(remaining<=0)throw Error('Output export time limit');
    const dest=path.join(directory,item.destination);tmp=dest+'.'+randomUUID()+'.tmp';fd=fs.openSync(tmp,'wx',0o600);
    const run=copy('docker',['exec',session.name,session.evidenceIdentity.node,'-e',script(source,bounds.fileBytes)],{stdio:['ignore',fd,'pipe'],timeout:remaining,maxBuffer:8192});fs.closeSync(fd);fd=undefined;
    if(run.status!==0)throw Error('Output copy failed: '+(run.error?.message??run.stderr?.toString()??run.status));
    const expected=JSON.parse(run.stderr.toString()),actual=hashFile(tmp);if(actual.size!==source.size||actual.size!==expected.size||actual.sha256!==expected.sha256)throw Error('Output size/hash mismatch');
    if(fs.existsSync(dest)){const old=hashFile(dest);if(old.size!==actual.size||old.sha256!==actual.sha256)throw Error('Existing verified bytes differ');fs.unlinkSync(tmp);}else fs.renameSync(tmp,dest);tmp=null;
    Object.assign(item,actual,{status:'copied',archiveComplete:true,savedAt:new Date().toISOString()});
   }catch(e){item.reason=e.message;fail(e);}finally{if(fd!==undefined)fs.closeSync(fd);if(tmp&&fs.existsSync(tmp))fs.unlinkSync(tmp);}
  }
  for(const [reference,refs]of links){manifest.files.push({sourceReference:reference,links:refs,status:'missing',archiveComplete:false,sourceCompleteness:'unknown',reason:'Referenced native file absent'});fail(Error('Referenced native file absent'));}
 }catch(e){fail(e);}
 manifest.elapsedMs=Date.now()-started;if(manifest.elapsedMs>bounds.exportMs)fail(Error('Output export time limit'));manifest.bytes=manifest.files.reduce((n,f)=>n+(f.archiveComplete?f.size:0),0);manifest.evidenceComplete=manifest.errors.length===0;
 privateJSON(path.join(target,'attempt-'+randomUUID()+'.json'),manifest);
 privateJSON(path.join(target,'manifest.json'),manifest);
 return {status:manifest.evidenceComplete?0:1,kind:manifest.evidenceComplete?'evidence_complete':'evidence_incomplete',manifest};
}
