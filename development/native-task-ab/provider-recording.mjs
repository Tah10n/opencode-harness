// Development research evidence. Called only by the admitted comparison runner.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {privateJSON,hashFile} from '../native-output-retention/output-files.mjs';
export const recordingProfile=Object.freeze({name:'research-full-v1',requestBytes:16*1024*1024,responseBytes:64*1024*1024,totalBytes:256*1024*1024,requests:1024,storageMs:30000});
const sha=b=>createHash('sha256').update(b).digest('hex');
export function prepareRecording(directory,identity,{bounds=recordingProfile}={}) {
 for(const key of ['requestBytes','responseBytes','totalBytes','requests','storageMs'])if(!Number.isSafeInteger(bounds[key])||bounds[key]<=0||bounds[key]>recordingProfile[key])throw Error('Invalid recording bound');
 const stat=fs.lstatSync(directory),target=fs.realpathSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('Unsafe private recording directory');
 // Canonicalize the trusted host directory (including platform temp aliases).
 privateJSON(path.join(target,'recording-config.json'),{...identity,profile:recordingProfile.name,bounds,clientBody:'JSON serialization of native relay object; original HTTP bytes unavailable',upstreamBody:'exact UTF-8 fetch body; transport adds store:false',responseBody:'bytes read from fetch response.body, not network packets',forwardedBody:'size/hash of chunks accepted by relay send; not client acknowledgement'});
 let total=0,count=0,storageMs=0;
 const timed=fn=>{const start=performance.now();try{if(storageMs>=bounds.storageMs)throw Error('Recording storage time limit');return fn();}finally{storageMs+=performance.now()-start;}};
 return {begin(record,clientBody,upstreamBody){
  const index=record.requestIndex;
  if(!Number.isSafeInteger(index)||index<1||++count>bounds.requests)throw Error('Recording request limit');
  const state={profile:recordingProfile.name,...identity,requestIndex:index,relayRequestId:record.relayRequestId,requestKind:record.requestKind,status:'not_started',evidenceComplete:false,response:{file:`response-${index}.sse`,size:0,sha256:sha(Buffer.alloc(0)),eof:false,status:'not_started'},forwarded:{size:0,sha256:null}};
  record.recording=state;
  const statusFile=path.join(target,`recording-${index}.json`),responseFile=path.join(target,state.response.file);
  let fd,closed=false,hash=createHash('sha256'),forwardHash=createHash('sha256');
  const fail=(error,status='write_error')=>{
   state.evidenceComplete=false;
   if(state.error){(state.additionalErrors??=[]).push(error.message);return false;}
   state.status=status;state.error=error.message;state.response.status=status;return false;
  };
  const persist=()=>{try{privateJSON(statusFile,{...state,responseId:record.responseId??null,upstreamRequestId:record.upstreamRequestId??null,httpStatus:record.status??null,contentType:record.contentType??null,terminalResponse:record.terminalResponse??null,serverCompletion:record.serverCompletion??null,storageMs});return true;}catch(e){return fail(e);}};
  const writeRequest=(name,body)=>{
   const bytes=Buffer.from(body);if(bytes.length>bounds.requestBytes||total+bytes.length>bounds.totalBytes)throw Error('Recording request byte limit');
   timed(()=>fs.writeFileSync(path.join(target,name),bytes,{flag:'wx',mode:0o600}));total+=bytes.length;
   return {file:name,size:bytes.length,sha256:sha(bytes)};
  };
  const recorder={state,
   append(chunk){
    if(closed||state.status!=='recording')return false;
    const bytes=Buffer.from(chunk),started=performance.now();
    // A limit leaves an explicit partial prefix; never silently truncates as complete.
    const exceeded=[
     {scope:'response',boundBytes:bounds.responseBytes,usedBytes:state.response.size,operationBytes:bytes.length},
     {scope:'slot',boundBytes:bounds.totalBytes,usedBytes:total,operationBytes:bytes.length},
    ].filter(limit=>limit.usedBytes+limit.operationBytes>limit.boundBytes);
    if(exceeded.length){
     state.limit={requestIndex:index,exceeded};
     return fail(Error('Recording response byte limit: '+exceeded.map(limit=>limit.scope).join('+')),'limit');
    }
    try{timed(()=>{let at=0;while(at<bytes.length){const n=fs.writeSync(fd,bytes,at,Math.min(65536,bytes.length-at));if(n<=0)throw Error('Recording write made no progress');hash.update(bytes.subarray(at,at+n));at+=n;state.response.size+=n;total+=n;if(storageMs+performance.now()-started>=bounds.storageMs)throw Error('Recording storage time limit');}});state.response.status='partial';return true;}catch(e){return fail(e);}
   },
   forwarded(chunk){const b=Buffer.from(chunk);state.forwarded.size+=b.length;forwardHash.update(b);},
   finish(reason){
    if(closed)return state.evidenceComplete;closed=true;
    state.response.eof=reason==='eof';
    if(state.status==='recording'){state.status=reason==='eof'?'complete':reason;state.response.status=reason;}
    try{if(fd!==undefined){timed(()=>fs.fsyncSync(fd));fs.closeSync(fd);fd=undefined;}}catch(e){fail(e);if(fd!==undefined){try{fs.closeSync(fd);}catch{}fd=undefined;}}
    state.response.sha256=hash.digest('hex');state.forwarded.sha256=forwardHash.digest('hex');
    try{timed(()=>{const s=fs.lstatSync(responseFile);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||(s.mode&0o077)||s.size!==state.response.size)throw Error('Unsafe or changed response archive');for(const request of [state.clientRequest,state.upstreamRequest]){const file=path.join(target,request.file),rs=fs.lstatSync(file);if(!rs.isFile()||rs.isSymbolicLink()||rs.nlink!==1||rs.size!==request.size||(rs.mode&0o077))throw Error('Unsafe request archive');const rh=hashFile(file);if(rh.sha256!==request.sha256)throw Error('Request archive integrity mismatch');}const got=hashFile(responseFile);if(got.size!==state.response.size||got.sha256!==state.response.sha256)throw Error('Response archive integrity mismatch');});}catch(e){fail(e,'integrity_error');}
    if(storageMs>=bounds.storageMs)fail(Error('Recording storage time limit'),'limit');
    state.evidenceComplete=state.status==='complete'&&state.response.eof;
    if(!persist())state.evidenceComplete=false;
    return state.evidenceComplete;
   },
  };
  try{
   state.clientRequest=writeRequest(`request-${index}.json`,clientBody);
   state.upstreamRequest=writeRequest(`upstream-request-${index}.json`,upstreamBody);
   fd=timed(()=>fs.openSync(responseFile,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600));
   if(storageMs>=bounds.storageMs)throw Error('Recording storage time limit');
   state.status='recording';if(!persist())throw Error(state.error);
  }catch(e){fail(e,'preparation_error');if(fd!==undefined){fs.closeSync(fd);fd=undefined;}persist();throw Object.assign(Error('Recording preparation: '+e.message),{recordingPreparation:true});}
  return recorder;
 }};
}
