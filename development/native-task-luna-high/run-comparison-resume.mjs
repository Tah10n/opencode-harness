// Continuation of the same frozen four-slot diagnosis. Original scheduler/stop record retained.
// Only external scheduling and task-deadline classification differ; measured H is unchanged.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {runTask} from '../native-task-abc/native-run.mjs';
export async function runComparison({root,startContainer,captureCandidate,stopWorkload,readAuth,fetchImpl=fetch,runTaskImplementation=runTask}) {
const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const amendment=JSON.parse(fs.readFileSync(path.join(root,'resume-authorization.json')));
const preserved=JSON.parse(fs.readFileSync(path.join(root,'pre-resume-preserved.json')));
const runtimeFiles=['opencode.json','core.md','native-task-plugin.mjs','native-task-workflow.mjs','native-task-observations.mjs','native-review-context.mjs','review-context.mjs'];
function verify(){
 if(amendment.allowedFirstExecutions.join(',')!=='2,3,4'||f.attempts.length!==4||f.model!=='openai/gpt-5.6-luna'||f.variant!=='high'||f.budgetMs!==900000||!f.preflightPassed)throw Error('Invalid continuation configuration');
 for(const [file,digest]of Object.entries(preserved))if(sha(fs.readFileSync(file))!==digest)throw Error('Preserved first-result file changed: '+file);
 for(const n of runtimeFiles){const file=path.join(f.template,n);if(sha(fs.readFileSync(file))!==f.files[file])throw Error('Frozen H runtime changed: '+n);}
 if(JSON.stringify(f.attempts.map(a=>[a.slot,a.task,a.arm]))!==JSON.stringify([[1,'legacy-runtime-reload','P'],[2,'legacy-runtime-reload','H'],[3,'reconnect-revoked','H'],[4,'reconnect-revoked','P']]))throw Error('Schedule changed');
}
verify();if(fs.existsSync(path.join(root,'resume-paused.json')))throw Error('Continuation paused; no automatic resume');

let pause=null;
function pauseScheduling(kind,slot,details={}){if(pause)return;pause={kind,slot,...details};fs.writeFileSync(path.join(root,'resume-paused.json'),JSON.stringify(pause,null,2),{flag:'wx'});}
for(const attempt of f.attempts.slice(1)){
 verify();if(pause)break;const out=path.join(root,'runs',attempt.task+'-'+attempt.arm);
 if(fs.existsSync(out))throw Error('Previously created slot must never be retried: '+out);
 fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({...attempt,at:new Date().toISOString()},null,2),{flag:'wx'});
 const requests=[],active=new Set(),abort=new AbortController();let session,deadline=null,timer,result,terminationVerified=false,forwardingOpen=true,deadlineTriggered=false,captureSaved=false,relayRemoved=false;
 const deadlineReason=Object.assign(new Error('Own task deadline reached'),{name:'AbortError'});
 const save=()=>fs.writeFileSync(path.join(out,'provider-metadata.json'),JSON.stringify(requests,null,2));
 try{
  session=await startContainer({source:attempt.source,toolchain:f.toolchain,template:attempt.arm==='H'?f.template:f.dependencies,output:path.join(out,'session'),onRequest:(frame,rawSend,signal)=>{
   const send=message=>{if(forwardingOpen)rawSend(message);};
   const pending=(async()=>{
    const requestKind=frame.body?.tools?.length?'work':'title';
    let requestSignal;
    const record={requestKind,at:new Date().toISOString(),path:frame.path,model:frame.body?.model,effort:frame.body?.reasoning?.effort??null,forwarded:false,usage:null};requests.push(record);save();
    if(pause||abort.signal.aborted||!deadline||Date.now()>=deadline){record.notForwardedReason='paused-or-deadline';save();send({type:'headers',status:408,contentType:'text/plain'});send({type:'end'});return;}
    if(frame.path!=='/v1/responses'||frame.body?.model!=='gpt-5.6-luna'||frame.body.stream!==true||frame.body?.reasoning?.effort!=='high'){pauseScheduling('boundary_refusal',attempt.slot);record.rejected=true;save();send({type:'headers',status:403,contentType:'text/plain'});send({type:'end'});return;}
    try{
     const a=readAuth();record.forwarded=true;record.forwardedAt=new Date().toISOString();save();
     requestSignal=AbortSignal.any([signal,abort.signal,AbortSignal.timeout(180000)]);
     const response=await fetchImpl('https://chatgpt.com/backend-api/codex/responses',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${a.access}`,'ChatGPT-Account-Id':a.accountId},body:JSON.stringify({...frame.body,store:false}),signal:requestSignal});record.status=response.status;save();
     if([401,403,429].includes(response.status)){
      pauseScheduling('provider_refusal',attempt.slot,{status:response.status});
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
  const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true});"]);if(setup.status!==0)throw Error('Dependency preparation failed: '+setup.stderr);
  const inputRead=session.exec(['node','-e',`const fs=require('fs'),path=require('path'),{createHash}=require('crypto'),out={};function visit(d,p=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='.git')continue;const file=path.join(d,e.name),rel=p+e.name,st=fs.lstatSync(file);if(st.isSymbolicLink())throw Error('Symlink');if(st.isDirectory())visit(file,rel+'/');else out[rel]={sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),executable:!!(st.mode&0o111)};}}visit('/work/repo');console.log(JSON.stringify(out));`]);
  if(inputRead.status!==0)throw Error('Actual input read failed');
  const got=JSON.parse(inputRead.stdout),expected=f.inputManifests[attempt.task+'-'+attempt.arm];
  if(Object.keys(got).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>JSON.stringify(got[k])!==JSON.stringify(v)))throw Error('Actual model container input mismatch');
  fs.writeFileSync(path.join(out,'input-verification.json'),JSON.stringify({matched:true,files:Object.keys(got).length,providerRequestsBeforeStart:requests.length}));
  const version=session.exec(['/opt/opencode','--version']);if(version.status!==0||version.stdout.trim()!=='1.18.26')throw Error('Runtime mismatch');
  deadline=Date.now()+f.budgetMs;timer=setTimeout(()=>{deadlineTriggered=true;forwardingOpen=false;abort.abort(deadlineReason);},f.budgetMs);
  result=await runTaskImplementation(session,{config:f.config,task:fs.readFileSync(path.join(attempt.source,'TASK.md'),'utf8'),enabled:attempt.arm==='H',arm:attempt.arm,model:f.model,variant:f.variant,limitMs:f.budgetMs,continuation:f.continuation,canContinue:()=>!pause&&!abort.signal.aborted,stopWorkload});
  if(result.timedOut&&!deadlineTriggered)pauseScheduling('unattributed_timeout',attempt.slot);
  terminationVerified=result.termination?.terminationVerified===true;if(!terminationVerified)throw Error('Termination not verified');
  clearTimeout(timer);forwardingOpen=false;abort.abort();await Promise.allSettled([...active]);save();
  const native=session.exec(['node','-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});console.log(JSON.stringify({sessions:db.prepare('SELECT id,parent_id,directory,agent,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write FROM session').all(),messages:db.prepare('SELECT id,session_id,data FROM message').all().map(x=>({...x,data:JSON.parse(x.data)})),tools:db.prepare('SELECT id,message_id,session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool')}));db.close();"]);if(native.status!==0)throw Error('Native accounting extraction failed');fs.writeFileSync(path.join(out,'native-evidence.json'),native.stdout);
  if(captureCandidate(session,out).status!==0)throw Error('Candidate capture failed');captureSaved=true;
  const evidence=JSON.parse(native.stdout);let workflow=null;try{workflow=JSON.parse(evidence.tools.find(t=>t.data.tool==='harness_task')?.data.state?.output);}catch{}
  const summary={...attempt,...result,requests:requests.filter(r=>r.forwarded).length,requestsWithoutUsage:requests.filter(r=>r.forwarded&&!r.usage).length,workflowStatus:workflow?.status??null,repairs:workflow?.repairs??null,toolCalls:evidence.tools.length,sessions:evidence.sessions.length,delivery:attempt.arm==='H'?workflow?.executionDirectory??null:'/work/repo',ownTaskDeadlineTriggered:deadlineTriggered};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message},null,2));pauseScheduling('execution_or_capture_error',attempt.slot,{message:error.message});if(session&&!fs.existsSync(path.join(out,'candidate.tar'))){stopWorkload(session);captureCandidate(session,out);}}
 finally{clearTimeout(timer);forwardingOpen=false;abort.abort();await Promise.allSettled([...active]);save();if(session){if(session.close()!==0){pauseScheduling('cleanup_unverified',attempt.slot);throw Error('Container cleanup failed');}relayRemoved=true;}}
 const stopFacts={ownTaskDeadlineTriggered:deadlineTriggered,terminationVerified,captureSaved,forwardingClosed:!forwardingOpen,relayRemoved,activeProviderHandlers:active.size,providerServerStateMayRemainUnknown:requests.some(r=>r.forwarded&&!r.streamEnded)};
 fs.writeFileSync(path.join(out,'stop-verification.json'),JSON.stringify(stopFacts,null,2));
 if(!terminationVerified||!captureSaved||!relayRemoved||forwardingOpen||active.size)pauseScheduling('local_execution_unverified',attempt.slot,stopFacts);
 if(terminationVerified)fs.writeFileSync(path.join(out,'completed.json'),JSON.stringify({...attempt,terminationVerified,at:new Date().toISOString()},null,2),{flag:'wx'});
}
fs.writeFileSync(path.join(root,'resume-outcome.json'),JSON.stringify({status:pause?'paused':'finished',pause},null,2));console.log(JSON.stringify({status:pause?'paused':'finished',pause}));

return {status:pause?'paused':'finished',pause};
}
