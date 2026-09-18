// Frozen 2 tasks x 3 arms x 2 repeats. No availability call or retry path.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {responseObserver,knownResponseTerminal,runComparison} from '../native-task-ab/run-comparison.mjs';
import {startContainer as start} from './container-session.mjs';
const startContainer=args=>start({...args,workMemoryMb:1536,memoryMb:3072});
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from '../native-task-ab/capture-candidate.mjs';
import {runTask as runTaskImplementation} from './native-run.mjs';
const readAuth=()=>{const a=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'))).openai;if(a?.type!=='oauth'||!a.access||!a.accountId||a.expires<=Date.now())throw Error('Existing authorization unavailable or expired');return{access:a.access,accountId:a.accountId};};
export async function run(root,continuationFile=null){
if(continuationFile)return runComparison({root,continuationFile,startContainer,captureCandidate,stopWorkload,readAuth,runTaskImplementation});
const f=JSON.parse(fs.readFileSync(root+'/freeze.json'));const outputRoot=root;const fetchImpl=fetch;
function verify(){
 if(f.runtimeSha!=='797ce6f1b75af217e00224d1b38790346dee1d19'||f.budgetMs!==1800000||f.attempts.length!==12||f.model!=='openai/gpt-5.6-luna'||f.variant!=='high'||!f.preflightPassed)throw Error('Invalid frozen campaign');
 const hash=b=>createHash('sha256').update(b).digest('hex');for(const [file,digest]of Object.entries(f.files))if(hash(fs.readFileSync(file))!==digest)throw Error('Frozen preparation changed: '+file);
 for(const [directory,expected]of Object.entries(f.runtimeManifests)){const got=manifest(directory);if(JSON.stringify(got)!==JSON.stringify(expected))throw Error('Runtime/dependencies/input changed: '+directory);}
}
verify();
let pause=null;
function pauseScheduling(kind,slot,details={}){if(pause)return;pause={kind,slot,...details};fs.writeFileSync(path.join(outputRoot,'scheduling-paused.json'),JSON.stringify(pause,null,2),{flag:'wx'});}
for(const attempt of f.attempts){
 verify();if(pause)break;const out=path.join(outputRoot,'runs',attempt.task+(attempt.repetition?'-r'+attempt.repetition:'')+'-'+attempt.arm);
 if(fs.existsSync(out))throw Error('Previously created slot must never be retried: '+out);
 fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({...attempt,at:new Date().toISOString()},null,2),{flag:'wx'});
 const requests=[],active=new Set(),abort=new AbortController();let session,deadline=null,timer,result,terminationVerified=false,forwardingOpen=true,deadlineTriggered=false,captureSaved=false,relayRemoved=false;
 const deadlineReason=Object.assign(new Error('Own task deadline reached'),{name:'AbortError'});
 const settleHandlers=async()=>{let timeout;try{await Promise.race([Promise.allSettled([...active]),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Provider handlers did not settle after cancellation')),5000);})]);}finally{clearTimeout(timeout);}};
 const save=()=>fs.writeFileSync(path.join(out,'provider-metadata.json'),JSON.stringify(requests,null,2));
 try{
  session=await startContainer({source:attempt.source,toolchain:f.toolchain,template:attempt.arm==='S0'?f.baselineTemplate:attempt.arm!=='P'?f.template:f.dependencies,output:path.join(out,'session'),onRequest:(frame,rawSend,signal)=>{
   const send=message=>{if(forwardingOpen)rawSend(message);};
   const pending=(async()=>{
    const requestKind=frame.body?.tools?.length?'work':'title';
    let requestSignal;
    const record={requestIndex:requests.length+1,relayRequestId:frame.id??null,requestKind,at:new Date().toISOString(),path:frame.path,model:frame.body?.model,effort:frame.body?.reasoning?.effort??null,forwarded:false,usage:null};requests.push(record);save();
    if(true)fs.writeFileSync(path.join(out,'request-'+requests.length+'.json'),JSON.stringify(frame.body),{mode:0o600,flag:'wx'});
    const blocked=()=>{
     if(!pause&&!abort.signal.aborted&&!signal.aborted&&forwardingOpen&&deadline&&Date.now()<deadline)return false;
     record.notForwardedReason=pause?'series-paused':signal.aborted?'client-cancelled':'closed-or-deadline';record.blockedBy=pause;record.finishedAt=new Date().toISOString();save();
     send({type:'headers',status:409,contentType:'application/json'});send({type:'chunk',data:Buffer.from(JSON.stringify({error:{type:'experiment_admission_closed',message:'Experimental series admission is closed; no upstream request was sent.'}})).toString('base64')});send({type:'end'});return true;
    };
    if(blocked())return;
    if(frame.path!=='/v1/responses'||frame.body?.model!=='gpt-5.6-luna'||frame.body.stream!==true||frame.body?.reasoning?.effort!=='high'){pauseScheduling('boundary_refusal',attempt.slot);record.rejected=true;save();send({type:'headers',status:403,contentType:'text/plain'});send({type:'end'});return;}
    try{
     const a=readAuth();const body=JSON.stringify({...frame.body,store:false});record.maxDurationMs=f.streamLimit==='remaining-task-budget'?Math.max(0,deadline-Date.now()):180000;record.connectionTimeoutMs=f.connectionTimeoutMs??null;save();
     const connectionAbort=new AbortController();const connectionTimer=f.connectionTimeoutMs?setTimeout(()=>connectionAbort.abort(new Error('Connection timeout')),f.connectionTimeoutMs):null;
     requestSignal=AbortSignal.any([signal,abort.signal,...(f.streamLimit==='remaining-task-budget'?[connectionAbort.signal]:[AbortSignal.timeout(180000)])]);
     let response;try {
     // Last synchronous gate, after auth/body preparation and immediately before dispatch.
     if(blocked())return;
     record.forwarded=true;record.forwardedAt=new Date().toISOString();save();
     response=await fetchImpl('https://chatgpt.com/backend-api/codex/responses',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${a.access}`,'ChatGPT-Account-Id':a.accountId},body,signal:requestSignal});}finally{clearTimeout(connectionTimer);}
     record.status=response.status;record.upstreamRequestId=response.headers.get('x-request-id');save();
     if(response.status!==200){
      const refusal=[401,403,429].includes(response.status);
      record.serverCompletion=refusal?'known_refusal':'unknown';
      // Persist closure before any body await or retryable headers reach the client.
      pauseScheduling(refusal?'provider_refusal':'unknown_submission',attempt.slot,{requestIndex:record.requestIndex,status:response.status,reason:refusal?'Provider refused request':'Non-200 response without an established provider result'});
      save();
      const iterator=response.body?.[Symbol.asyncIterator]();let bytes=Buffer.alloc(0),bodyTimer;
      const expired=new Promise(resolve=>{bodyTimer=setTimeout(()=>resolve({boundedTimeout:true}),1000);});
      try{
       while(iterator){
        const next=await Promise.race([iterator.next(),expired]);
        if(next.boundedTimeout){record.errorBodyTimedOut=true;break;}
        if(next.done)break;
        const b=Buffer.from(next.value),remaining=8192-bytes.length;
        bytes=Buffer.concat([bytes,b.subarray(0,remaining)]);
        record.errorBody=bytes.toString('utf8');record.errorBodyBase64=bytes.toString('base64');save();
        if(b.length>=remaining){record.errorBodyTruncated=true;break;}
       }
      }catch(error){record.errorBodyInterrupted=error.name;}
      finally{clearTimeout(bodyTimer);void iterator?.return?.().catch(()=>{});}
      record.errorBody=bytes.toString('utf8');record.errorBodyBase64=bytes.toString('base64');
      if(refusal){
       let type=null,message=null;try{const value=JSON.parse(record.errorBody);type=typeof value.error?.type==='string'?value.error.type.slice(0,128):null;message=typeof value.error?.message==='string'?value.error.message.slice(0,1024):null;}catch{}
       record.refusal={status:response.status,type,message,truncated:!!record.errorBodyTruncated,bodyInterrupted:!!record.errorBodyInterrupted,bodyTimedOut:!!record.errorBodyTimedOut};
       // Refine only this first known refusal; never replace another pause or reopen admission.
       if(pause?.kind==='provider_refusal'&&pause.slot===attempt.slot&&pause.requestIndex===record.requestIndex){
        Object.assign(pause,record.refusal);if(type==='usage_limit_reached'&&!record.errorBodyTruncated&&!record.errorBodyInterrupted&&!record.errorBodyTimedOut)pause.kind='incomplete_quota';
        fs.writeFileSync(path.join(outputRoot,'scheduling-paused.json'),JSON.stringify(pause,null,2));
       }
      }
      save();
      try{send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/plain'});if(bytes.length)send({type:'chunk',data:bytes.toString('base64')});send({type:'end'});}
      finally{stopWorkload(session);abort.abort();}
      return;
     }
     send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/event-stream'});
     const observer=responseObserver(record,save,details=>pauseScheduling(details.kind,attempt.slot,{requestIndex:record.requestIndex,...details}));
     for await(const chunk of response.body){
      if(true)fs.appendFileSync(path.join(out,'response-'+record.requestIndex+'.sse'),chunk,{mode:0o600});
      // Observe/persist upstream facts before delivery can fail or be cancelled.
      observer.push(chunk);
      // The observer persists response facts AND the pause synchronously, before
      // a retryable packet can reach any client (including title/helper clients).
      send({type:'chunk',data:Buffer.from(chunk).toString('base64')});
      if(record.admissionStop){
       send({type:'end'});record.clientDelivery='stop-event-forwarded';save();
       stopWorkload(session);abort.abort();return;
      }
     }
     observer.end();record.streamEnded=true;if(record.admissionStop){send({type:'end'});stopWorkload(session);abort.abort();return;}
     if(!knownResponseTerminal(record)){record.serverCompletion='unknown';pauseScheduling('unknown_submission',attempt.slot,{reason:'Stream ended without a bound terminal provider response'});stopWorkload(session);abort.abort();return;}
     send({type:'end'});record.clientDelivery='stream-forwarded';save();
    }catch(error){
     if(record.admissionStop&&record.clientDelivery==='stop-event-forwarded'&&abort.signal.aborted){record.localStreamStop=error.name;return;}
     record.error=error.name;
     const ownDeadline=record.forwarded&&deadlineTriggered&&requestSignal?.reason===deadlineReason;
     record.transportError={name:error.name,clientOrRelayCancelled:signal.aborted,ownTaskDeadline:ownDeadline};
     record.clientDelivery='unconfirmed-after-transport-error';
     record.serverCompletion=knownResponseTerminal(record)?record.terminalResponse.status:[401,403,429].includes(record.status)?'known_refusal':'unknown';
     if(ownDeadline)record.cancelledByOwnTaskDeadline=true;
     if([401,403,429].includes(record.status)){record.refusal??={status:record.status,bodyInterrupted:true};pauseScheduling('provider_refusal',attempt.slot,record.refusal);}
     else if(!record.forwarded||!knownResponseTerminal(record))pauseScheduling(record.forwarded?'unknown_submission':'authorization_unavailable',attempt.slot,{error:error.name});
     forwardingOpen=false;if(session)stopWorkload(session);if(!abort.signal.aborted)abort.abort();throw error;}
    finally{record.finishedAt=new Date().toISOString();save();}
   })();active.add(pending);return pending.finally(()=>active.delete(pending));
  }});
  const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});"]);if(setup.status!==0)throw Error('Dependency preparation failed: '+setup.stderr);
  const inputRead=session.exec(['node','-e',`const fs=require('fs'),path=require('path'),{createHash}=require('crypto'),out={};function visit(d,p=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='.git')continue;const file=path.join(d,e.name),rel=p+e.name,st=fs.lstatSync(file);if(st.isSymbolicLink()){const target=fs.readlinkSync(file),resolved=path.resolve(path.dirname(file),target);if(!resolved.startsWith('/work/repo/'))throw Error('External dependency link');out[rel]={symlink:target};continue;}if(st.isDirectory())visit(file,rel+'/');else out[rel]={sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),executable:!!(st.mode&0o111)};}}visit('/work/repo');console.log(JSON.stringify(out));`]);
  if(inputRead.status!==0)throw Error('Actual input read failed');
  const got=JSON.parse(inputRead.stdout),expected=f.inputManifests[attempt.task+'-'+attempt.arm];
  if(Object.keys(got).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>JSON.stringify(got[k])!==JSON.stringify(v)))throw Error('Actual model container input mismatch');
  fs.writeFileSync(path.join(out,'input-verification.json'),JSON.stringify({matched:true,files:Object.keys(got).length,providerRequestsBeforeStart:requests.length}));
  const version=session.exec(['/opt/opencode','--version']);if(version.status!==0||version.stdout.trim()!=='1.18.26')throw Error('Runtime mismatch');
  deadline=Date.now()+f.budgetMs;if(f.streamLimit==='remaining-task-budget')session.setTaskBudget(f.budgetMs);timer=setTimeout(()=>{deadlineTriggered=true;forwardingOpen=false;abort.abort(deadlineReason);},f.budgetMs);
  result=await runTaskImplementation(session,{config:f.config,task:fs.readFileSync(path.join(attempt.source,'TASK.md'),'utf8'),enabled:attempt.arm!=='P',arm:attempt.arm,model:f.model,variant:f.variant,limitMs:Math.max(0,deadline-Date.now()),deadline,strategy:f.strategy,continuation:f.continuation,canContinue:()=>!pause&&!abort.signal.aborted,stopWorkload});
  if(result.timedOut&&!deadlineTriggered)pauseScheduling('unattributed_timeout',attempt.slot);
  terminationVerified=result.termination?.terminationVerified===true;if(!terminationVerified)throw Error('Termination not verified');
  clearTimeout(timer);forwardingOpen=false;abort.abort();await settleHandlers();save();
  const native=session.exec(['node','-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});console.log(JSON.stringify({sessions:db.prepare('SELECT id,parent_id,directory,agent,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write FROM session').all(),messages:db.prepare('SELECT id,session_id,data FROM message').all().map(x=>({...x,data:JSON.parse(x.data)})),tools:db.prepare('SELECT id,message_id,session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool')}));db.close();"]);if(native.status!==0)throw Error('Native accounting extraction failed');fs.writeFileSync(path.join(out,'native-evidence.json'),native.stdout);
  if(captureCandidate(session,out).status!==0)throw Error('Candidate capture failed');captureSaved=true;
  const evidence=JSON.parse(native.stdout);let workflow=null;try{workflow=JSON.parse(evidence.tools.find(t=>t.data.tool==='harness_task')?.data.state?.output);}catch{}
  const summary={...attempt,...result,requests:requests.filter(r=>r.forwarded).length,requestsWithoutUsage:requests.filter(r=>r.forwarded&&!r.usage).length,workflowStatus:workflow?.status??null,repairs:workflow?.repairs??null,toolCalls:evidence.tools.length,sessions:evidence.sessions.length,delivery:attempt.arm!=='P'?workflow?.executionDirectory??null:'/work/repo',ownTaskDeadlineTriggered:deadlineTriggered};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message},null,2));pauseScheduling('execution_or_capture_error',attempt.slot,{message:error.message});if(session&&!fs.existsSync(path.join(out,'candidate.tar'))){stopWorkload(session);captureCandidate(session,out);}}
 finally{clearTimeout(timer);forwardingOpen=false;abort.abort();try{await settleHandlers();}catch(error){pauseScheduling('provider_handlers_unsettled',attempt.slot,{message:error.message});}save();if(session){if(session.close()!==0){pauseScheduling('cleanup_unverified',attempt.slot);throw Error('Container cleanup failed');}relayRemoved=true;}}
 const stopFacts={ownTaskDeadlineTriggered:deadlineTriggered,terminationVerified,captureSaved,forwardingClosed:!forwardingOpen,relayRemoved,activeProviderHandlers:active.size,providerServerStateMayRemainUnknown:requests.some(r=>r.forwarded&&!knownResponseTerminal(r)&&r.serverCompletion!=='known_refusal')};
 fs.writeFileSync(path.join(out,'stop-verification.json'),JSON.stringify(stopFacts,null,2));
 if(!terminationVerified||!captureSaved||!relayRemoved||forwardingOpen||active.size)pauseScheduling('local_execution_unverified',attempt.slot,stopFacts);
 if(terminationVerified)fs.writeFileSync(path.join(out,'completed.json'),JSON.stringify({...attempt,terminationVerified,at:new Date().toISOString()},null,2),{flag:'wx'});
}
fs.writeFileSync(path.join(outputRoot,'outcome.json'),JSON.stringify({status:pause?'paused':'finished',pause},null,2));console.log(JSON.stringify({status:pause?'paused':'finished',pause}));

return {status:pause?'paused':'finished',pause};
}

export function manifest(root){const out={};function walk(d,p=''){for(const n of fs.readdirSync(d).sort()){if(n==='.git')continue;const file=path.join(d,n),name=p+n,s=fs.lstatSync(file);if(s.isDirectory())walk(file,name+'/');else if(s.isSymbolicLink()){const target=fs.readlinkSync(file);if(path.isAbsolute(target)||!path.resolve(path.dirname(file),target).startsWith(root+path.sep))throw Error('External symlink: '+name);out[name]={symlink:target};}else if(s.isFile())out[name]={sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),executable:!!(s.mode&0o111)};else throw Error('Unsupported input');}}walk(root);return out;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await run(path.resolve(process.argv[2]),process.argv[3]?path.resolve(process.argv[3]):null);
