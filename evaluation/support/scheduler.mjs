import {manifest} from './manifest.mjs';
import {captureInputManifest,compareInputManifest} from './input-manifest.mjs';
import {performance} from 'node:perf_hooks';
// Frozen primary or conditional transfer comparison using the same managed-deadline scheduler.
// A/B do not add a phase or an intermediate model deadline.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {prepareRecording,recordingProfile,inspectFullTaskRecordingProfile,selectRecordingProfile} from './provider-recording.mjs';
import {privateJSON} from './output-files.mjs';
import {execFileSync} from 'node:child_process';
// Per-request observer for the response lifecycle forms actually emitted by
// the configured upstream. Transport/native completion remain separate facts.
export function responseObserver(record, persist=()=>{}, closeAdmission=()=>{}, observeEvent=()=>{}) {
 const decoder=new TextDecoder('utf-8',{fatal:true});let buffer='';
 const terminalTypes={'response.completed':'completed','response.failed':'failed','response.incomplete':'incomplete'};
 const stop=(kind,details={})=>{record.admissionStop??={kind,...details};persist();closeAdmission(record.admissionStop);};
 const conflict=reason=>{record.responseBindingError??=reason;record.serverCompletion='unknown';stop('provider_protocol_error',{reason});};
 const usageOf=u=>{if(!u||typeof u!=='object')return null;const out={};for(const key of ['input_tokens','output_tokens','total_tokens'])if(Number.isFinite(u[key])&&u[key]>=0)out[key]=u[key];if(Number.isFinite(u.input_tokens_details?.cached_tokens))out.cached_tokens=u.input_tokens_details.cached_tokens;if(Number.isFinite(u.output_tokens_details?.reasoning_tokens))out.reasoning_tokens=u.output_tokens_details.reasoning_tokens;return Object.keys(out).length?out:null;};
 const packet=text=>{
  const lines=text.split(/\r?\n/),data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');if(!data||data==='[DONE]')return;
  let event;try{event=JSON.parse(data);}catch{conflict('Malformed upstream SSE JSON');return;}
  observeEvent(event,lines.find(l=>l.startsWith('event:'))?.slice(6).trim());
  if(event?.type==='error'||event?.type==='response.error'){
   record.protocolError=event.error??{code:event.code??null,message:event.message??null};
   record.serverCompletion=knownResponseTerminal(record)?record.terminalResponse.status:'unknown';
   stop('provider_protocol_error',{error:record.protocolError});return;
  }
  const lifecycle=['response.created','response.in_progress',...Object.keys(terminalTypes)].includes(event?.type);if(!lifecycle)return;
  const declared=lines.find(l=>l.startsWith('event:'))?.slice(6).trim();if(declared&&declared!==event.type){conflict('SSE event/type mismatch');return;}
  const r=event.response,status=terminalTypes[event.type]??'in_progress';
  if(!r||typeof r.id!=='string'||!r.id||r.status!==status){conflict('Unbound or inconsistent response lifecycle');return;}
  if(record.responseId&&record.responseId!==r.id){conflict('Different response IDs in one request');return;}
  if(!record.responseId){if(!['response.created','response.in_progress'].includes(event.type)){conflict('Terminal response without request-local lifecycle binding');return;}record.responseId=r.id;}
  if(!terminalTypes[event.type]){if(record.terminalResponse)conflict('Nonterminal lifecycle after terminal response');else record.responseStatus=r.status;return;}
  const usage=usageOf(r.usage),previous=record.terminalResponse;
  if(previous&&(previous.id!==r.id||previous.status!==r.status||JSON.stringify(previous.usage)!==JSON.stringify(usage))){conflict('Conflicting terminal response events');return;}
  if(!previous){record.terminalResponse={id:r.id,status:r.status,eventType:event.type,usage,...(r.error?{error:r.error}:{}),...(r.incomplete_details?{incompleteDetails:r.incomplete_details}:{})};record.responseStatus=r.status;record.usage=usage;record.terminalEvents=1;}
  else record.duplicateTerminalEvents=(record.duplicateTerminalEvents??0)+1;
  record.serverCompletion=record.responseBindingError?'unknown':r.status;persist();
  // This development-series admission rule does not alter provider knowledge or
  // the user's native OpenCode retry policy. Both statuses forbid another send.
  if(r.status==='failed'||r.status==='incomplete')stop('provider_'+r.status,{error:r.error??null,incompleteDetails:r.incomplete_details??null});
 };
 const consume=text=>{buffer+=text;let match;while((match=/\r?\n\r?\n/.exec(buffer))){packet(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);}};
 return {push(bytes){try{consume(decoder.decode(bytes,{stream:true}));}catch(error){conflict('Invalid upstream UTF-8');throw error;}},end(){try{consume(decoder.decode());if(buffer.trim())conflict('Unterminated upstream SSE event at EOF');}catch(error){conflict('Invalid upstream UTF-8 at EOF');throw error;}}};
}
export function knownResponseTerminal(record){return !!record.terminalResponse&&!record.responseBindingError;}

export function verifyFrozenSchedule(f,runTaskImplementation,fetchImpl=fetch){
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 if(!['polybench','polybench-preflight','fixture'].includes(f.experimentKind))throw Error('Unsupported evaluation schedule; historical campaigns cannot resume');
 if(f.experimentKind==='fixture'&&fetchImpl===fetch)throw Error('Fixtures cannot access provider');
 if(typeof runTaskImplementation!=='function'||typeof f.model!=='string'||!/^openai\/[^/\s]+$/.test(f.model)||typeof f.variant!=='string'||!f.variant||!Number.isSafeInteger(f.budgetMs)||f.budgetMs<=0||f.budgetMs>3600000||!f.preflightPassed)throw Error('Invalid frozen configuration');
 for(const [file,digest] of Object.entries(f.files))if(sha(fs.readFileSync(file))!==digest)throw Error('Frozen file changed: '+file);
 for(const [directory,expected]of Object.entries(f.runtimeManifests??{}))if(JSON.stringify(manifest(directory))!==JSON.stringify(expected))throw Error('Runtime/dependencies/input changed: '+directory);
 if(new Set(f.attempts.map(a=>a.slot)).size!==f.attempts.length||f.attempts.some((a,i)=>a.slot!==i+1)||!f.attempts.length)throw Error('Invalid slot identity');
 if(f.experimentKind!=='fixture'){
  const consolidated=f.campaign==='consolidated-v1';
  const count=f.experimentKind==='polybench'?(consolidated?20:10):1;
  if(f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||f.attempts.length!==count*3)throw Error('Invalid PolyBench frozen schedule');
  const groups=new Map();for(const a of f.attempts){if(!groups.has(a.task))groups.set(a.task,[]);groups.get(a.task).push(a.arm);}
  if(groups.size!==count)throw Error('Invalid PolyBench allocation');
  let index=0;for(const arms of groups.values())if(arms.join(',')!==(consolidated?['P,C,T','C,T,P','T,P,C']:['P,H0,H1','H0,H1,P','H1,P,H0'])[index++%3])throw Error('Invalid PolyBench cyclic order');
  if(consolidated&&(!f.templates||Object.keys(f.templates).sort().join(',')!=='C,P,T'))throw Error('Missing consolidated arm bundles');
  if(consolidated&&f.experimentKind==='polybench'){
   if(f.attempts.some(a=>!['ready','preparation_error'].includes(a.preparationStatus)))throw Error('Missing preparation disposition');
   for(const task of groups.keys())if(new Set(f.attempts.filter(a=>a.task===task).map(a=>a.preparationStatus)).size!==1)throw Error('Preparation must apply equally to every arm');
  }
 }
}

export async function runComparison({root,startContainer,captureCandidate,stopWorkload,readAuth,fetchImpl=fetch,runTaskImplementation,readInput=captureInputManifest}) {
const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
const selectedRecording=selectRecordingProfile(f.recordingProfile??recordingProfile.name);
const outputRoot=root;
const verify=()=>verifyFrozenSchedule(f,runTaskImplementation,fetchImpl);
verify();
if(fs.existsSync(path.join(root,'scheduling-paused.json')))throw Error('Admission paused; no automatic resume');
let pause=null;
function pauseScheduling(kind,slot,details={}){if(pause)return;pause={kind,slot,...details};try{fs.writeFileSync(path.join(outputRoot,'scheduling-paused.json'),JSON.stringify(pause,null,2),{flag:'wx',mode:0o600});}catch(error){pause.persistenceError=error.message;}}
for(const attempt of f.attempts){
 verify();if(pause)break;const out=path.join(outputRoot,'runs',attempt.task+(attempt.repetition?'-r'+attempt.repetition:'')+'-'+attempt.arm);
 if(f.campaign==='consolidated-v1'&&attempt.preparationStatus==='preparation_error')continue;
 if(fs.existsSync(out))throw Error('Previously created slot must never be retried: '+out);
 fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({...attempt,at:new Date().toISOString()},null,2),{flag:'wx'});
 const requests=[],active=new Set(),abort=new AbortController();let session,deadline=null,deadlineMono=null,timer,result,terminationVerified=false,forwardingOpen=true,deadlineTriggered=false,captureSaved=false,relayRemoved=false,captureAttempted=false,recording,recordingPersistenceError=null;
 const timing={};const mark=name=>{timing[name]??={at:new Date().toISOString(),monotonicMs:performance.now()};};
 const remaining=()=>deadline===null?0:Math.min(deadline-Date.now(),deadlineMono-performance.now());
 const stopOwned=()=>session.stopOwnedWorkload?.()??stopWorkload(session);
 const deadlineReason=Object.assign(new Error('Own task deadline reached'),{name:'AbortError'});
 const settleHandlers=async()=>{let timeout;try{await Promise.race([Promise.allSettled([...active]),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Provider handlers did not settle after cancellation')),5000);})]);}finally{clearTimeout(timeout);}};
 const save=()=>{try{privateJSON(path.join(out,'provider-metadata.json'),requests);return true;}catch(error){recordingPersistenceError=error.message;forwardingOpen=false;pauseScheduling('evidence_incomplete',attempt.slot,{reason:'Provider metadata persistence: '+error.message});return false;}};
 try{
  // One full profile for this research-only entry point, fixed before native requests.
  // Admission above remains independent; ordinary native sessions never call here.
  try{recording=prepareRecording(out,{run:path.basename(path.resolve(root)),slot:attempt.slot},{profile:selectedRecording.name});}
  catch(error){pauseScheduling('evidence_incomplete',attempt.slot,{phase:'recording_preparation',message:error.message});throw error;}
  session=await startContainer({source:attempt.source,toolchain:f.toolchain,template:f.campaign==='consolidated-v1'?f.templates[attempt.arm]:attempt.arm!=='P'?f.template:f.dependencies,output:path.join(out,'session'),onRequest:(frame,rawSend,signal)=>{
   const send=message=>{if(forwardingOpen&&remaining()>0){rawSend(message);return true;}return false;};
   const pending=(async()=>{
    const requestKind=frame.body?.tools?.length?'work':'title';
    let requestSignal;
    const record={requestIndex:requests.length+1,relayRequestId:frame.id??null,requestKind,at:new Date().toISOString(),path:frame.path,model:frame.body?.model,effort:frame.body?.reasoning?.effort??null,forwarded:false,usage:null,recording:{profile:selectedRecording.name,status:'not_started',evidenceComplete:false}};requests.push(record);save();
    let recorder,recordingEnd='not_started';
    const recordingFailed=()=>{record.evidenceIncomplete=true;pauseScheduling('evidence_incomplete',attempt.slot,{requestIndex:record.requestIndex,reason:record.recording?.error??recordingPersistenceError??'Partial provider evidence'});};
    const blocked=()=>{
     if(!pause&&!abort.signal.aborted&&!signal.aborted&&forwardingOpen&&deadline&&remaining()>0)return false;
     record.notForwardedReason=pause?'series-paused':signal.aborted?'client-cancelled':'closed-or-deadline';record.blockedBy=pause;record.finishedAt=new Date().toISOString();save();
     send({type:'headers',status:409,contentType:'application/json'});send({type:'chunk',data:Buffer.from(JSON.stringify({error:{type:'experiment_admission_closed',message:'Experimental series admission is closed; no upstream request was sent.'}})).toString('base64')});send({type:'end'});return true;
    };
    if(blocked())return;
    if(frame.path!=='/v1/responses'||frame.body?.model!==f.model.slice('openai/'.length)||frame.body.stream!==true||frame.body?.reasoning?.effort!==f.variant){pauseScheduling('boundary_refusal',attempt.slot);record.rejected=true;save();send({type:'headers',status:403,contentType:'text/plain'});send({type:'end'});return;}
    try{
     const body=JSON.stringify({...frame.body,store:false});
     try{recorder=recording.begin(record,JSON.stringify(frame.body),body);if(!save())throw Error(recordingPersistenceError);}
     catch(error){record.notForwardedReason='recording-preparation-failed';record.recordingPreparationError=error.message;recordingFailed();throw Object.assign(error,{recordingPreparation:true});}
     const a=readAuth();record.maxDurationMs=f.streamLimit==='remaining-task-budget'?Math.max(0,remaining()):180000;record.connectionTimeoutMs=f.connectionTimeoutMs??null;save();
     const connectionAbort=new AbortController();const connectionTimer=f.connectionTimeoutMs?setTimeout(()=>connectionAbort.abort(new Error('Connection timeout')),f.connectionTimeoutMs):null;
     requestSignal=AbortSignal.any([signal,abort.signal,...(f.streamLimit==='remaining-task-budget'?[connectionAbort.signal]:[AbortSignal.timeout(180000)])]);
     let response;try {
     // Last synchronous gate, after auth/body preparation and immediately before dispatch.
     if(blocked())return;
     record.forwarded=true;record.forwardedAt=new Date().toISOString();if(!save()){record.forwarded=false;delete record.forwardedAt;record.notForwardedReason='recording-preparation-failed';recordingFailed();return;}
     if(blocked()){record.forwarded=false;delete record.forwardedAt;return;}
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
      try{send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/plain'});if(bytes.length){if(send({type:'chunk',data:bytes.toString('base64')}))recorder.forwarded(bytes);}send({type:'end'});}
      finally{await stopOwned();abort.abort();}
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
      if(!recorded||recordingPersistenceError){recordingFailed();await stopOwned();abort.abort();return;}
      // The observer persists response facts AND the pause synchronously, before
      // a retryable packet can reach any client (including title/helper clients).
      if(send({type:'chunk',data:Buffer.from(chunk).toString('base64')}))recorder.forwarded(chunk);
      if(record.admissionStop){
       send({type:'end'});record.clientDelivery='stop-event-forwarded';save();
       await stopOwned();abort.abort();return;
      }
     }
     recordingEnd='eof';observer.end();record.streamEnded=true;if(record.admissionStop){send({type:'end'});await stopOwned();abort.abort();return;}
     if(!knownResponseTerminal(record)){record.serverCompletion='unknown';pauseScheduling('unknown_submission',attempt.slot,{reason:'Stream ended without a bound terminal provider response'});await stopOwned();abort.abort();return;}
     send({type:'end'});record.clientDelivery='stream-forwarded';save();
    }catch(error){
     if(recorder&&record.status!==undefined&&recordingEnd!=='eof')recordingEnd=signal.aborted||abort.signal.aborted?'interrupted':'read_error';
     if(error.recordingPreparation){forwardingOpen=false;if(session)await stopOwned();abort.abort();throw error;}
     if(record.admissionStop&&record.clientDelivery==='stop-event-forwarded'&&abort.signal.aborted){record.localStreamStop=error.name;return;}
     record.error=error.name;
     const ownDeadline=record.forwarded&&deadlineTriggered&&requestSignal?.reason===deadlineReason;
     record.transportError={name:error.name,clientOrRelayCancelled:signal.aborted,ownTaskDeadline:ownDeadline};
     record.clientDelivery='unconfirmed-after-transport-error';
     record.serverCompletion=knownResponseTerminal(record)?record.terminalResponse.status:[401,403,429].includes(record.status)?'known_refusal':'unknown';
     if(ownDeadline)record.cancelledByOwnTaskDeadline=true;
     if([401,403,429].includes(record.status)){record.refusal??={status:record.status,bodyInterrupted:true};pauseScheduling('provider_refusal',attempt.slot,record.refusal);}
     else if(!record.forwarded||!knownResponseTerminal(record))pauseScheduling(record.forwarded?'unknown_submission':'authorization_unavailable',attempt.slot,{error:error.name});
     forwardingOpen=false;if(session)await stopOwned();if(!abort.signal.aborted)abort.abort();throw error;}
    finally{if(recorder&&!recorder.finish(recordingEnd)&&['write_error','integrity_error','limit'].includes(recorder.state.status))recordingFailed();record.finishedAt=new Date().toISOString();save();}
   })();active.add(pending);return pending.finally(()=>active.delete(pending));
  }});
  const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});"]);if(setup.status!==0)throw Error('Dependency preparation failed: '+setup.stderr);
  const {manifest:got,receipt}=await readInput(session,out,{signal:abort.signal});
  const expected=f.inputManifests[attempt.task+'-'+attempt.arm]??(f.campaign==='consolidated-v1'?f.runtimeManifests?.[attempt.source]:undefined);
  compareInputManifest(got,expected);
  privateJSON(path.join(out,'input-verification.json'),{matched:true,files:Object.keys(got).length,providerRequestsBeforeStart:requests.length,artifact:receipt});
  const version=session.exec(['/opt/opencode','--version']);if(version.status!==0||version.stdout.trim()!=='1.18.26')throw Error('Runtime mismatch');
  deadline=Date.now()+f.budgetMs;deadlineMono=performance.now()+f.budgetMs;if(f.streamLimit==='remaining-task-budget')session.setTaskBudget(f.budgetMs,deadline);mark('taskStarted');timing.deadlineAt=new Date(deadline).toISOString();timer=setTimeout(()=>{mark('deadlineTimerFired');deadlineTriggered=true;forwardingOpen=false;mark('forwardingClosed');mark('abortRequested');abort.abort(deadlineReason);},f.budgetMs);
  if(captureCandidate.requiresOutputRetention){session.evidenceRequired=true;session.evidenceBaseline=session.baseline;}
  result=await runTaskImplementation(session,{config:f.config,task:fs.readFileSync(path.join(attempt.source,'TASK.md'),'utf8'),enabled:attempt.arm!=='P',arm:attempt.arm,model:f.model,variant:f.variant,limitMs:Math.max(0,remaining()),deadline,deadlineMono,signal:abort.signal,strategy:f.strategy,continuation:f.continuation,canContinue:()=>!pause&&!abort.signal.aborted,stopWorkload});
  if(result.timedOut&&!deadlineTriggered)pauseScheduling('unattributed_timeout',attempt.slot);
  terminationVerified=result.termination?.terminationVerified===true;if(!terminationVerified)throw Error('Termination not verified');
  clearTimeout(timer);forwardingOpen=false;mark('forwardingClosed');abort.abort();await settleHandlers();mark('handlersSettled');save();
  const native=session.exec(['node','-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});console.log(JSON.stringify({sessions:db.prepare('SELECT id,parent_id,directory,agent,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write FROM session').all(),messages:db.prepare('SELECT id,session_id,data FROM message').all().map(x=>({...x,data:JSON.parse(x.data)})),tools:db.prepare('SELECT id,message_id,session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool')}));db.close();"]);let nativeError=null;
  try{if(native.status!==0)throw Error('Native accounting extraction failed');fs.writeFileSync(path.join(out,'native-evidence.json'),native.stdout);}catch(error){nativeError=error;}
  captureAttempted=true;mark('captureStarted');let captured;
  try{captured=captureCandidate(session,out);captureSaved=captured.status===0;mark('captureFinished');}catch(error){if(nativeError){nativeError.message+='; capture also failed: '+error.message;throw nativeError;}throw error;}
  if(nativeError)throw nativeError;
  if(!captureSaved)throw Error('evidence_incomplete: '+(captured.errors?.join('; ')??'Candidate capture failed'));
  const evidence=JSON.parse(native.stdout);let workflow=null;try{workflow=JSON.parse(evidence.tools.find(t=>t.data.tool==='harness_task')?.data.state?.output);}catch{}
  const summary={...attempt,...result,requests:requests.filter(r=>r.forwarded).length,requestsWithoutUsage:requests.filter(r=>r.forwarded&&!r.usage).length,workflowStatus:workflow?.status??null,repairs:workflow?.repairs??null,toolCalls:evidence.tools.length,sessions:evidence.sessions.length,delivery:!['P','C'].includes(attempt.arm)?workflow?.executionDirectory??null:'/work/repo',ownTaskDeadlineTriggered:deadlineTriggered};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message},null,2));pauseScheduling('execution_or_capture_error',attempt.slot,{message:error.message});if(session&&!captureAttempted){try{terminationVerified=(await stopOwned()).terminationVerified===true;if(!terminationVerified)throw Error('Termination not verified');captureAttempted=true;captureSaved=captureCandidate(session,out).status===0;}catch(captureError){fs.writeFileSync(path.join(out,'capture-error.json'),JSON.stringify({kind:'evidence_incomplete',message:captureError.message,primaryError:error.message},null,2));}}}
 finally{
  clearTimeout(timer);forwardingOpen=false;abort.abort();
  try{
   try{await settleHandlers();}catch(error){pauseScheduling('provider_handlers_unsettled',attempt.slot,{message:error.message});}
   save();
  }finally{
   if(session){
    if(recordingPersistenceError){session.evidenceRequired=true;session.evidenceComplete=false;}
    mark('cleanupStarted');const cleanup=session.close();relayRemoved=cleanup===0;mark('cleanupFinished');
    if(cleanup!==0){pauseScheduling(cleanup===2?'evidence_incomplete':'cleanup_unverified',attempt.slot,{resource:session.retainedResource??null});if(cleanup!==2)throw Error('Container cleanup failed');}
   }
  }
 }
 const stopFacts={timing,ownTaskDeadlineTriggered:deadlineTriggered,terminationVerified,captureSaved,forwardingClosed:!forwardingOpen,relayRemoved,activeProviderHandlers:active.size,providerServerStateMayRemainUnknown:requests.some(r=>r.forwarded&&!knownResponseTerminal(r)&&r.serverCompletion!=='known_refusal')};
 fs.writeFileSync(path.join(out,'stop-verification.json'),JSON.stringify(stopFacts,null,2));
 if(!terminationVerified||!captureSaved||!relayRemoved||forwardingOpen||active.size)pauseScheduling('local_execution_unverified',attempt.slot,stopFacts);
 if(terminationVerified)fs.writeFileSync(path.join(out,'completed.json'),JSON.stringify({...attempt,terminationVerified,at:new Date().toISOString()},null,2),{flag:'wx'});
}
fs.writeFileSync(path.join(outputRoot,'outcome.json'),JSON.stringify({status:pause?'paused':'finished',pause},null,2));console.log(JSON.stringify({status:pause?'paused':'finished',pause}));

return {status:pause?'paused':'finished',pause};
}
