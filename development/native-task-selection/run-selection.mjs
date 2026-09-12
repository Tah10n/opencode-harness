// Six frozen pair selections. Provider relay/deadline/stop rules retained from utility/run-comparison.mjs.
// One preplanned tool-free decision stage in the same session; no author or repair.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {runSelector} from './phases.mjs';
import {prepareSelector,inputManifest} from './container-setup.mjs';
export async function runSelection({root,startContainer,stopWorkload,readAuth,fetchImpl=fetch}) {
const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function verify(){
 if(f.attempts.length!==6||f.model!=='openai/gpt-5.6-luna'||f.variant!=='high'||f.budgetMs!==300000||f.researchMs!==240000||!f.preflightPassed)throw Error('Invalid development configuration');
 for(const [file,digest] of Object.entries(f.files))if(sha(fs.readFileSync(file))!==digest)throw Error('Frozen file changed: '+file);
 if(new Set(f.attempts.map(a=>a.task)).size!==6||f.attempts.some((a,i)=>a.slot!==i+1))throw Error('Invalid six-task schedule');
}

verify();if(fs.existsSync(path.join(root,'scheduling-paused.json')))throw Error('Continuation paused; no automatic resume');

let pause=null;
function pauseScheduling(kind,slot,details={}){if(pause)return;pause={kind,slot,...details};fs.writeFileSync(path.join(root,'scheduling-paused.json'),JSON.stringify(pause,null,2),{flag:'wx'});}
for(const attempt of f.attempts){
 verify();if(pause)break;const out=path.join(root,'runs','c'+String(attempt.slot).padStart(2,'0'));
 if(fs.existsSync(out))throw Error('Previously created slot must never be retried: '+out);
 fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({...attempt,at:new Date().toISOString()},null,2),{flag:'wx'});
 const requests=[],active=new Set(),abort=new AbortController();let session,deadline=null,timer,result,terminationVerified=false,forwardingOpen=true,deadlineTriggered=false,inputsVerified=false,relayRemoved=false;
 let researchClosing=false;
 const deadlineReason=Object.assign(new Error('Own task deadline reached'),{name:'AbortError'});
 const save=()=>fs.writeFileSync(path.join(out,'provider-metadata.json'),JSON.stringify(requests,null,2));
 try{
  session=await startContainer({source:attempt.source,toolchain:f.toolchain,template:f.dependencies,output:path.join(out,'session'),onRequest:(frame,rawSend,signal)=>{
   const send=message=>{if(forwardingOpen)rawSend(message);};
   const pending=(async()=>{
    const requestKind=frame.body?.tools?.length?'work':'title';
    let requestSignal;
    const record={requestKind,at:new Date().toISOString(),path:frame.path,model:frame.body?.model,effort:frame.body?.reasoning?.effort??null,forwarded:false,usage:null};requests.push(record);save();
    if(pause||researchClosing||abort.signal.aborted||!deadline||Date.now()>=deadline){record.notForwardedReason='paused-or-deadline';save();send({type:'headers',status:408,contentType:'text/plain'});send({type:'end'});return;}
    if(frame.path!=='/v1/responses'||frame.body?.model!=='gpt-5.6-luna'||frame.body.stream!==true||frame.body?.reasoning?.effort!=='high'){pauseScheduling('boundary_refusal',attempt.slot);record.rejected=true;save();send({type:'headers',status:403,contentType:'text/plain'});send({type:'end'});return;}
    try{
     const a=readAuth();record.forwarded=true;record.forwardedAt=new Date().toISOString();save();
     requestSignal=AbortSignal.any([signal,abort.signal,AbortSignal.timeout(Math.max(1,Math.min(180000,deadline-Date.now())))]);
     const response=await fetchImpl('https://chatgpt.com/backend-api/codex/responses',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${a.access}`,'ChatGPT-Account-Id':a.accountId},body:JSON.stringify({...frame.body,store:false}),signal:requestSignal});record.status=response.status;save();
     if([401,403,429].includes(response.status)){
      
      let bytes=Buffer.alloc(0),truncated=false;for await(const chunk of response.body){const b=Buffer.from(chunk);if(bytes.length+b.length>8192){bytes=Buffer.concat([bytes,b.subarray(0,8192-bytes.length)]);truncated=true;break;}bytes=Buffer.concat([bytes,b]);}
      let type=null,message=null;try{const value=JSON.parse(bytes.toString());type=typeof value.error?.type==='string'?value.error.type.slice(0,128):null;message=typeof value.error?.message==='string'?value.error.message.slice(0,1024):null;}catch{}
      record.refusal={status:response.status,type,message,truncated};pauseScheduling(type==='usage_limit_reached'&&!truncated?'incomplete_quota':'provider_refusal',attempt.slot,record.refusal);save();stopWorkload(session);abort.abort();return;
     }
     send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/event-stream'});
     const decoder=new TextDecoder();let buffer='';
     for await(const chunk of response.body){send({type:'chunk',data:Buffer.from(chunk).toString('base64')});buffer+=decoder.decode(chunk,{stream:true});let split;while((split=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,split);buffer=buffer.slice(split+2);for(const line of packet.split('\n'))if(line.startsWith('data: ')){try{const event=JSON.parse(line.slice(6));if(event.response?.usage){const u=event.response.usage;record.usage=Object.fromEntries(['input_tokens','output_tokens','total_tokens'].filter(k=>Number.isFinite(u[k])).map(k=>[k,u[k]]));if(Number.isFinite(u.input_tokens_details?.cached_tokens))record.usage.cached_tokens=u.input_tokens_details.cached_tokens;if(Number.isFinite(u.output_tokens_details?.reasoning_tokens))record.usage.reasoning_tokens=u.output_tokens_details.reasoning_tokens;}if(event.response?.status){record.responseStatus=event.response.status;record.responseId=event.response.id;}}catch{}}}}
     record.streamEnded=true;if(response.status===200&&!['completed','failed','cancelled','incomplete'].includes(record.responseStatus)){pauseScheduling('unknown_submission',attempt.slot,{reason:'Stream ended without a terminal provider response'});stopWorkload(session);abort.abort();return;}send({type:'end'});
    }catch(error){record.error=error.name;
     const ownDeadline=record.forwarded&&deadlineTriggered&&requestSignal?.reason===deadlineReason;
     if(ownDeadline){record.cancelledByOwnTaskDeadline=true;record.serverCompletion='unknown';}
     else pauseScheduling(record.forwarded?'unknown_submission':'authorization_unavailable',attempt.slot,{error:error.name});
     forwardingOpen=false;if(session)stopWorkload(session);if(!abort.signal.aborted)abort.abort();throw error;}
    finally{record.finishedAt=new Date().toISOString();save();}
   })();active.add(pending);return pending.finally(()=>active.delete(pending));
  }});
  const preparation=prepareSelector(session,f.inputManifests[attempt.task]);
  fs.writeFileSync(path.join(out,'input-verification.json'),JSON.stringify({...preparation,providerRequestsBeforeStart:requests.length},null,2));
  deadline=Date.now()+f.budgetMs;timer=setTimeout(()=>{deadlineTriggered=true;forwardingOpen=false;abort.abort(deadlineReason);},f.budgetMs);
  result=await runSelector(session,{researchMs:f.researchMs,researchStopped:async()=>{researchClosing=true;await Promise.allSettled([...active]);},beforeFinal:async()=>{await Promise.allSettled([...active]);researchClosing=false;},canFinalize:()=>!pause&&!abort.signal.aborted,setClock:clock=>{const r=session.exec(['node','-e',"require('fs').writeFileSync('/work/selection-clock.json',process.argv[1])",JSON.stringify(clock)]);assert.equal(r.status,0,r.stderr);},config:f.config,task:fs.readFileSync(f.prompt,'utf8')+'\n\nORIGINAL FULL TASK:\n'+fs.readFileSync(path.join(attempt.source,'TASK.md'),'utf8'),enabled:false,model:f.model,variant:f.variant,limitMs:Math.max(1,deadline-Date.now()),stopWorkload});
  if(result.timedOut&&!deadlineTriggered)pauseScheduling('unattributed_timeout',attempt.slot);
  terminationVerified=result.termination?.terminationVerified===true;if(!terminationVerified)throw Error('Termination not verified');
  clearTimeout(timer);forwardingOpen=false;abort.abort();await Promise.allSettled([...active]);save();
  const native=session.exec(['node','-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});console.log(JSON.stringify({sessions:db.prepare('SELECT id,parent_id,directory,agent,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write FROM session').all(),messages:db.prepare('SELECT id,session_id,data FROM message').all().map(x=>({...x,data:JSON.parse(x.data)})),tools:db.prepare('SELECT id,message_id,session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool')}));db.close();"]);if(native.status!==0)throw Error('Native accounting extraction failed');fs.writeFileSync(path.join(out,'native-evidence.json'),native.stdout);
  assert.deepEqual(inputManifest(session),f.inputManifests[attempt.task],'Candidate inputs changed');inputsVerified=true;
  const evidence=JSON.parse(native.stdout);
  const text=result.answer;
  fs.writeFileSync(path.join(out,'answer.txt'),text);
  const decision=result.decision;
  const {events,stderr,answer,...phase}=result;
  const summary={slot:attempt.slot,task:attempt.task,...phase,decision,selectionCompleted:decision!==null,requests:requests.filter(r=>r.forwarded).length,requestsWithoutUsage:requests.filter(r=>r.forwarded&&!r.usage).length,toolCalls:evidence.tools.length,sessions:evidence.sessions.length,ownTaskDeadlineTriggered:deadlineTriggered,inputsUnchanged:true};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message},null,2));pauseScheduling('execution_or_capture_error',attempt.slot,{message:error.message});if(session)stopWorkload(session);}
 finally{clearTimeout(timer);forwardingOpen=false;abort.abort();await Promise.allSettled([...active]);save();if(session){if(session.close()!==0){pauseScheduling('cleanup_unverified',attempt.slot);throw Error('Container cleanup failed');}relayRemoved=true;}}
 const stopFacts={ownTaskDeadlineTriggered:deadlineTriggered,terminationVerified,inputsVerified,forwardingClosed:!forwardingOpen,relayRemoved,activeProviderHandlers:active.size,providerServerStateMayRemainUnknown:requests.some(r=>r.forwarded&&!r.streamEnded)};
 fs.writeFileSync(path.join(out,'stop-verification.json'),JSON.stringify(stopFacts,null,2));
 if(!terminationVerified||!inputsVerified||!relayRemoved||forwardingOpen||active.size)pauseScheduling('local_execution_unverified',attempt.slot,stopFacts);
 if(terminationVerified)fs.writeFileSync(path.join(out,'completed.json'),JSON.stringify({...attempt,terminationVerified,at:new Date().toISOString()},null,2),{flag:'wx'});
}
fs.writeFileSync(path.join(root,'outcome.json'),JSON.stringify({status:pause?'paused':'finished',pause},null,2));console.log(JSON.stringify({status:pause?'paused':'finished',pause}));

return {status:pause?'paused':'finished',pause};
}
