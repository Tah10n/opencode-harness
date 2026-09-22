// Pilot-local single-operation wiring. Shared scheduler and request policy unchanged.
// Request/capture/cleanup lifecycle copied verbatim from run-comparison.mjs at f98a9612;
// verify-code.mjs enforces identity of the transport handler, not merely its outcome.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {responseObserver,knownResponseTerminal} from '../native-task-ab/run-comparison.mjs';
import {prepareRecording,recordingProfile} from '../native-task-ab/provider-recording.mjs';
import {privateJSON} from '../native-output-retention/output-files.mjs';
export async function runOperation({root,f,operation,startContainer,captureCandidate,stopWorkload,readAuth,fetchImpl,runTaskImplementation,beforeNative,verify}) {
 const outputRoot=root;
 assert.ok(['A','R','F'].includes(operation.arm));
 assert.equal(f.model,'openai/gpt-5.6-luna');assert.equal(f.variant,'high');
 assert.equal(f.streamLimit,'remaining-task-budget');assert.equal(f.connectionTimeoutMs,30000);
 assert.ok(!fs.existsSync(path.join(root,'scheduling-paused.json')),'No continuation after admission closure');
let pause=null;
function pauseScheduling(kind,slot,details={}){if(pause)return;pause={kind,slot,...details};try{fs.writeFileSync(path.join(outputRoot,'scheduling-paused.json'),JSON.stringify(pause,null,2),{flag:'wx',mode:0o600});}catch(error){pause.persistenceError=error.message;}}
for(const attempt of [operation]){
 verify();if(pause)break;const out=path.join(outputRoot,'runs',attempt.task+(attempt.repetition?'-r'+attempt.repetition:'')+'-'+attempt.arm);
 if(fs.existsSync(out))throw Error('Previously created slot must never be retried: '+out);
 fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({...attempt,at:new Date().toISOString()},null,2),{flag:'wx'});
 const requests=[],active=new Set(),abort=new AbortController();let session,deadline=null,timer,result,terminationVerified=false,forwardingOpen=true,deadlineTriggered=false,captureSaved=false,relayRemoved=false,captureAttempted=false,recording,recordingPersistenceError=null;
 const deadlineReason=Object.assign(new Error('Own task deadline reached'),{name:'AbortError'});
 const settleHandlers=async()=>{let timeout;try{await Promise.race([Promise.allSettled([...active]),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Provider handlers did not settle after cancellation')),5000);})]);}finally{clearTimeout(timeout);}};
 const save=()=>{try{privateJSON(path.join(out,'provider-metadata.json'),requests);return true;}catch(error){recordingPersistenceError=error.message;forwardingOpen=false;pauseScheduling('evidence_incomplete',attempt.slot,{reason:'Provider metadata persistence: '+error.message});return false;}};
 try{
  // One full profile for this research-only entry point, fixed before native requests.
  // Admission above remains independent; ordinary native sessions never call here.
  try{recording=prepareRecording(out,{run:path.basename(path.resolve(root)),slot:attempt.slot,profile:recordingProfile.name});}
  catch(error){pauseScheduling('evidence_incomplete',attempt.slot,{phase:'recording_preparation',message:error.message});throw error;}
  session=await startContainer({source:attempt.source,toolchain:f.toolchain,template:f.template,output:path.join(out,'session'),onRequest:(frame,rawSend,signal)=>{
   const send=message=>{if(forwardingOpen)rawSend(message);};
   const pending=(async()=>{
    const requestKind=frame.body?.tools?.length?'work':'title';
    let requestSignal;
    const record={requestIndex:requests.length+1,relayRequestId:frame.id??null,requestKind,at:new Date().toISOString(),path:frame.path,model:frame.body?.model,effort:frame.body?.reasoning?.effort??null,forwarded:false,usage:null,recording:{profile:recordingProfile.name,status:'not_started',evidenceComplete:false}};requests.push(record);save();
    let recorder,recordingEnd='not_started';
    const recordingFailed=()=>{record.evidenceIncomplete=true;pauseScheduling('evidence_incomplete',attempt.slot,{requestIndex:record.requestIndex,reason:record.recording?.error??recordingPersistenceError??'Partial provider evidence'});};
    const blocked=()=>{
     if(!pause&&!abort.signal.aborted&&!signal.aborted&&forwardingOpen&&deadline&&Date.now()<deadline)return false;
     record.notForwardedReason=pause?'series-paused':signal.aborted?'client-cancelled':'closed-or-deadline';record.blockedBy=pause;record.finishedAt=new Date().toISOString();save();
     send({type:'headers',status:409,contentType:'application/json'});send({type:'chunk',data:Buffer.from(JSON.stringify({error:{type:'experiment_admission_closed',message:'Experimental series admission is closed; no upstream request was sent.'}})).toString('base64')});send({type:'end'});return true;
    };
    if(blocked())return;
    if(frame.path!=='/v1/responses'||frame.body?.model!=='gpt-5.6-luna'||frame.body.stream!==true||frame.body?.reasoning?.effort!=='high'){pauseScheduling('boundary_refusal',attempt.slot);record.rejected=true;save();send({type:'headers',status:403,contentType:'text/plain'});send({type:'end'});return;}
    try{
     const body=JSON.stringify({...frame.body,store:false});
     try{recorder=recording.begin(record,JSON.stringify(frame.body),body);if(!save())throw Error(recordingPersistenceError);}
     catch(error){record.notForwardedReason='recording-preparation-failed';record.recordingPreparationError=error.message;recordingFailed();throw Object.assign(error,{recordingPreparation:true});}
     const a=readAuth();record.maxDurationMs=f.streamLimit==='remaining-task-budget'?Math.max(0,deadline-Date.now()):180000;record.connectionTimeoutMs=f.connectionTimeoutMs??null;save();
     const connectionAbort=new AbortController();const connectionTimer=f.connectionTimeoutMs?setTimeout(()=>connectionAbort.abort(new Error('Connection timeout')),f.connectionTimeoutMs):null;
     requestSignal=AbortSignal.any([signal,abort.signal,...(f.streamLimit==='remaining-task-budget'?[connectionAbort.signal]:[AbortSignal.timeout(180000)])]);
     let response;try {
     // Last synchronous gate, after auth/body preparation and immediately before dispatch.
     if(blocked())return;
     record.forwarded=true;record.forwardedAt=new Date().toISOString();if(!save()){record.forwarded=false;delete record.forwardedAt;record.notForwardedReason='recording-preparation-failed';recordingFailed();return;}
     response=await fetchImpl('https://chatgpt.com/backend-api/codex/responses',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${a.access}`,'ChatGPT-Account-Id':a.accountId},body,signal:requestSignal});}finally{clearTimeout(connectionTimer);}
     record.status=response.status;record.upstreamRequestId=response.headers.get('x-request-id');record.contentType=response.headers.get('content-type');recordingEnd='interrupted';save();
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
        if(next.done){recordingEnd='eof';break;}
        const b=Buffer.from(next.value),remaining=8192-bytes.length;
        if(!recorder.append(b))recordingFailed();
        bytes=Buffer.concat([bytes,b.subarray(0,remaining)]);
        record.errorBody=bytes.toString('utf8');record.errorBodyBase64=bytes.toString('base64');save();
        if(b.length>=remaining){record.errorBodyTruncated=true;break;}
       }
      }catch(error){record.errorBodyInterrupted=error.name;recordingEnd=signal.aborted||abort.signal.aborted?'interrupted':'read_error';}
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
      try{send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/plain'});if(bytes.length){send({type:'chunk',data:bytes.toString('base64')});if(forwardingOpen)recorder.forwarded(bytes);}send({type:'end'});}
      finally{stopWorkload(session);abort.abort();}
      return;
     }
     send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/event-stream'});
     const observer=responseObserver(record,save,details=>pauseScheduling(details.kind,attempt.slot,{requestIndex:record.requestIndex,...details}));
     for await(const chunk of response.body){
      const recorded=recorder.append(chunk);
      if(!recorded)recordingFailed();
      // Observe/persist upstream facts before delivery can fail or be cancelled.
      observer.push(chunk);
      // Disk failure must not hide terminal facts in the chunk already received.
      if(!recorded||recordingPersistenceError){recordingFailed();stopWorkload(session);abort.abort();return;}
      // The observer persists response facts AND the pause synchronously, before
      // a retryable packet can reach any client (including title/helper clients).
      send({type:'chunk',data:Buffer.from(chunk).toString('base64')});if(forwardingOpen)recorder.forwarded(chunk);
      if(record.admissionStop){
       send({type:'end'});record.clientDelivery='stop-event-forwarded';save();
       stopWorkload(session);abort.abort();return;
      }
     }
     recordingEnd='eof';observer.end();record.streamEnded=true;if(record.admissionStop){send({type:'end'});stopWorkload(session);abort.abort();return;}
     if(!knownResponseTerminal(record)){record.serverCompletion='unknown';pauseScheduling('unknown_submission',attempt.slot,{reason:'Stream ended without a bound terminal provider response'});stopWorkload(session);abort.abort();return;}
     send({type:'end'});record.clientDelivery='stream-forwarded';save();
    }catch(error){
     if(recorder&&record.status!==undefined&&recordingEnd!=='eof')recordingEnd=signal.aborted||abort.signal.aborted?'interrupted':'read_error';
     if(error.recordingPreparation){forwardingOpen=false;if(session)stopWorkload(session);abort.abort();throw error;}
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
    finally{if(recorder&&!recorder.finish(recordingEnd)&&['write_error','integrity_error','limit'].includes(recorder.state.status))recordingFailed();record.finishedAt=new Date().toISOString();save();}
   })();active.add(pending);return pending.finally(()=>active.delete(pending));
  }});
  const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});"]);if(setup.status!==0)throw Error('Dependency preparation failed: '+setup.stderr);
  const inputRead=session.exec(['node','-e',`const fs=require('fs'),path=require('path'),{createHash}=require('crypto'),out={};function visit(d,p=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='.git')continue;const file=path.join(d,e.name),rel=p+e.name,st=fs.lstatSync(file);if(st.isSymbolicLink()){const target=fs.readlinkSync(file),resolved=path.resolve(path.dirname(file),target);if(!resolved.startsWith('/work/repo/'))throw Error('External dependency link');out[rel]={symlink:target};continue;}if(st.isDirectory())visit(file,rel+'/');else out[rel]={sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),executable:!!(st.mode&0o111)};}}visit('/work/repo');console.log(JSON.stringify(out));`]);
  if(inputRead.status!==0)throw Error('Actual input read failed');
  const got=JSON.parse(inputRead.stdout),expected=f.inputManifests[attempt.task+'-'+attempt.arm];
  if(Object.keys(got).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>JSON.stringify(got[k])!==JSON.stringify(v)))throw Error('Actual model container input mismatch');
  fs.writeFileSync(path.join(out,'input-verification.json'),JSON.stringify({matched:true,files:Object.keys(got).length,providerRequestsBeforeStart:requests.length}));
  const version=session.exec(['/opt/opencode','--version']);if(version.status!==0||version.stdout.trim()!=='1.18.26')throw Error('Runtime mismatch');
  deadline=beforeNative();const remaining=deadline-Date.now();if(remaining<=0)throw Error('Shared deadline exhausted');session.setTaskBudget(remaining);timer=setTimeout(()=>{deadlineTriggered=true;forwardingOpen=false;abort.abort(deadlineReason);},remaining);
  if(captureCandidate.requiresOutputRetention){session.evidenceRequired=true;session.evidenceBaseline=session.baseline;}
  result=await runTaskImplementation(session,{config:f.config,task:fs.readFileSync(path.join(attempt.source,'TASK.md'),'utf8'),enabled:attempt.arm!=='P',arm:attempt.arm,model:f.model,variant:f.variant,limitMs:Math.max(0,deadline-Date.now()),deadline,strategy:f.strategy,continuation:f.continuation,canContinue:()=>!pause&&!abort.signal.aborted,stopWorkload});
  if(result.timedOut&&!deadlineTriggered)pauseScheduling('unattributed_timeout',attempt.slot);
  terminationVerified=result.termination?.terminationVerified===true;if(!terminationVerified)throw Error('Termination not verified');
  clearTimeout(timer);forwardingOpen=false;abort.abort();await settleHandlers();save();
  const native=session.exec(['node','-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});console.log(JSON.stringify({sessions:db.prepare('SELECT id,parent_id,directory,agent,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write FROM session').all(),messages:db.prepare('SELECT id,session_id,data FROM message').all().map(x=>({...x,data:JSON.parse(x.data)})),tools:db.prepare('SELECT id,message_id,session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool')}));db.close();"]);let nativeError=null;
  try{if(native.status!==0)throw Error('Native accounting extraction failed');fs.writeFileSync(path.join(out,'native-evidence.json'),native.stdout);}catch(error){nativeError=error;}
  captureAttempted=true;let captured;
  try{captured=captureCandidate(session,out);captureSaved=captured.status===0;}catch(error){if(nativeError){nativeError.message+='; capture also failed: '+error.message;throw nativeError;}throw error;}
  if(nativeError)throw nativeError;
  if(!captureSaved)throw Error('evidence_incomplete: '+(captured.errors?.join('; ')??'Candidate capture failed'));
  const evidence=JSON.parse(native.stdout);let workflow=null;try{workflow=JSON.parse(evidence.tools.find(t=>t.data.tool==='harness_task')?.data.state?.output);}catch{}
  const summary={...attempt,...result,requests:requests.filter(r=>r.forwarded).length,requestsWithoutUsage:requests.filter(r=>r.forwarded&&!r.usage).length,workflowStatus:workflow?.status??null,repairs:workflow?.repairs??null,toolCalls:evidence.tools.length,sessions:evidence.sessions.length,delivery:attempt.arm!=='P'?workflow?.executionDirectory??null:'/work/repo',ownTaskDeadlineTriggered:deadlineTriggered};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message},null,2));pauseScheduling('execution_or_capture_error',attempt.slot,{message:error.message});if(session&&!captureAttempted){try{terminationVerified=stopWorkload(session).terminationVerified===true;if(!terminationVerified)throw Error('Termination not verified');captureAttempted=true;captureSaved=captureCandidate(session,out).status===0;}catch(captureError){fs.writeFileSync(path.join(out,'capture-error.json'),JSON.stringify({kind:'evidence_incomplete',message:captureError.message,primaryError:error.message},null,2));}}}
 finally{
  clearTimeout(timer);forwardingOpen=false;abort.abort();
  try{
   try{await settleHandlers();}catch(error){pauseScheduling('provider_handlers_unsettled',attempt.slot,{message:error.message});}
   save();
  }finally{
   if(session){
    if(recordingPersistenceError){session.evidenceRequired=true;session.evidenceComplete=false;}
    const cleanup=session.close();relayRemoved=cleanup===0;
    if(cleanup!==0){pauseScheduling(cleanup===2?'evidence_incomplete':'cleanup_unverified',attempt.slot,{resource:session.retainedResource??null});if(cleanup!==2)throw Error('Container cleanup failed');}
   }
  }
 }
 const stopFacts={ownTaskDeadlineTriggered:deadlineTriggered,terminationVerified,captureSaved,forwardingClosed:!forwardingOpen,relayRemoved,activeProviderHandlers:active.size,providerServerStateMayRemainUnknown:requests.some(r=>r.forwarded&&!knownResponseTerminal(r)&&r.serverCompletion!=='known_refusal')};
 fs.writeFileSync(path.join(out,'stop-verification.json'),JSON.stringify(stopFacts,null,2));
 if(!terminationVerified||!captureSaved||!relayRemoved||forwardingOpen||active.size)pauseScheduling('local_execution_unverified',attempt.slot,stopFacts);
 if(terminationVerified)fs.writeFileSync(path.join(out,'completed.json'),JSON.stringify({...attempt,terminationVerified,at:new Date().toISOString()},null,2),{flag:'wx'});
}
fs.writeFileSync(path.join(outputRoot,'outcome.json'),JSON.stringify({status:pause?'paused':'finished',pause},null,2));console.log(JSON.stringify({status:pause?'paused':'finished',pause}));

return {status:pause?'paused':'finished',pause};
}
