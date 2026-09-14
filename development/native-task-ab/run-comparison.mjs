// Frozen primary or conditional transfer comparison using the same managed-deadline scheduler.
// A/B do not add a phase or an intermediate model deadline.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {runTask} from './native-run.mjs';
import {execFileSync} from 'node:child_process';
// Per-request observer for the response lifecycle forms actually emitted by
// the configured upstream. Transport/native completion remain separate facts.
export function responseObserver(record, persist=()=>{}) {
 const decoder=new TextDecoder('utf-8',{fatal:true});let buffer='';
 const terminalTypes={'response.completed':'completed','response.failed':'failed','response.incomplete':'incomplete'};
 const conflict=reason=>{record.responseBindingError??=reason;record.serverCompletion='unknown';persist();};
 const usageOf=u=>{if(!u||typeof u!=='object')return null;const out={};for(const key of ['input_tokens','output_tokens','total_tokens'])if(Number.isFinite(u[key])&&u[key]>=0)out[key]=u[key];if(Number.isFinite(u.input_tokens_details?.cached_tokens))out.cached_tokens=u.input_tokens_details.cached_tokens;if(Number.isFinite(u.output_tokens_details?.reasoning_tokens))out.reasoning_tokens=u.output_tokens_details.reasoning_tokens;return Object.keys(out).length?out:null;};
 const packet=text=>{
  const lines=text.split(/\r?\n/),data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');if(!data||data==='[DONE]')return;
  let event;try{event=JSON.parse(data);}catch{conflict('Malformed upstream SSE JSON');return;}
  const lifecycle=['response.created','response.in_progress',...Object.keys(terminalTypes)].includes(event?.type);if(!lifecycle)return;
  const declared=lines.find(l=>l.startsWith('event:'))?.slice(6).trim();if(declared&&declared!==event.type){conflict('SSE event/type mismatch');return;}
  const r=event.response,status=terminalTypes[event.type]??'in_progress';
  if(!r||typeof r.id!=='string'||!r.id||r.status!==status){conflict('Unbound or inconsistent response lifecycle');return;}
  if(record.responseId&&record.responseId!==r.id){conflict('Different response IDs in one request');return;}
  if(!record.responseId){if(!['response.created','response.in_progress'].includes(event.type)){conflict('Terminal response without request-local lifecycle binding');return;}record.responseId=r.id;}
  if(!terminalTypes[event.type]){if(record.terminalResponse)conflict('Nonterminal lifecycle after terminal response');else record.responseStatus=r.status;return;}
  const usage=usageOf(r.usage),previous=record.terminalResponse;
  if(previous&&(previous.id!==r.id||previous.status!==r.status||JSON.stringify(previous.usage)!==JSON.stringify(usage))){conflict('Conflicting terminal response events');return;}
  if(!previous){record.terminalResponse={id:r.id,status:r.status,eventType:event.type,usage};record.responseStatus=r.status;record.usage=usage;record.terminalEvents=1;}
  else record.duplicateTerminalEvents=(record.duplicateTerminalEvents??0)+1;
  record.serverCompletion=record.responseBindingError?'unknown':r.status;persist();
 };
 const consume=text=>{buffer+=text;let match;while((match=/\r?\n\r?\n/.exec(buffer))){packet(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);}};
 return {push(bytes){try{consume(decoder.decode(bytes,{stream:true}));}catch(error){conflict('Invalid upstream UTF-8');throw error;}},end(){try{consume(decoder.decode());}catch(error){conflict('Invalid upstream UTF-8 at EOF');throw error;}}};
}
export function knownResponseTerminal(record){return !!record.terminalResponse&&!record.responseBindingError;}

export async function runComparison({root,startContainer,captureCandidate,stopWorkload,readAuth,fetchImpl=fetch,runTaskImplementation=runTask,continuationFile=null,verifyQuiescence=verifyHistoricalContainers}) {
const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const amendment=continuationFile?JSON.parse(fs.readFileSync(continuationFile)):null;
const outputRoot=amendment?path.join(root,'continuation-19-48'):root;
const allowedChanges=['run-comparison.mjs','run.mjs','verify-scheduler.mjs'].map(n=>path.resolve('development/native-task-ab',n));
if(amendment){
 if(amendment.version!==1||amendment.firstSlot!==19||amendment.lastSlot!==48||amendment.originalFreezeSha256!==sha(fs.readFileSync(path.join(root,'freeze.json')))||f.experimentKind!=='h00-transfer')throw Error('Invalid explicit continuation amendment');
 const historicalPause=JSON.parse(fs.readFileSync(path.join(root,'scheduling-paused.json')));
 if(historicalPause.kind!=='unknown_submission'||historicalPause.slot!==18)throw Error('Amendment does not authorize this pause');
 if(amendment.originalPauseSha256!==sha(fs.readFileSync(path.join(root,'scheduling-paused.json'))))throw Error('Historical pause changed');
 if(!amendment.launcherFiles||!Object.keys(amendment.launcherFiles).length||Object.keys(amendment.launcherFiles).some(file=>!allowedChanges.includes(file)))throw Error('Amendment exceeds launcher scope');
 for(const [file,versions] of Object.entries(amendment.launcherFiles))if(versions.before!==f.files[file]||versions.after!==sha(fs.readFileSync(file)))throw Error('Amended launcher version mismatch');
}

function verify(){
 const transfer=f.experimentKind==='transfer', h00=f.experimentKind==='h00-transfer';
 if(f.attempts.length!==(h00?48:transfer?8:30)||f.model!=='openai/gpt-5.6-luna'||f.variant!=='high'||f.budgetMs!==900000||!f.preflightPassed)throw Error('Invalid development configuration');
 for(const [file,digest] of Object.entries(f.files))if(sha(fs.readFileSync(file))!==(amendment?.launcherFiles[file]?.after??digest))throw Error('Frozen file changed: '+file);
 for(const [directory,expected]of Object.entries(f.runtimeManifests??{})){const seen=new Set();const visit=(dir,prefix='')=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name),name=prefix+entry.name,stat=fs.lstatSync(file);if(stat.isDirectory()){visit(file,name+'/');continue;}const got=stat.isSymbolicLink()?{symlink:fs.readlinkSync(file)}:{sha256:sha(fs.readFileSync(file)),executable:!!(stat.mode&0o111)};if(JSON.stringify(got)!==JSON.stringify(expected[name]))throw Error('Installed runtime changed: '+name);seen.add(name);}};visit(directory);if(seen.size!==Object.keys(expected).length)throw Error('Installed runtime missing files');}
 const groups=new Map();for(const a of f.attempts){const group=groups.get(a.task)??[];group.push(a.arm);groups.set(a.task,group);}
 if(h00){
  if(groups.size!==12||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000)throw Error('Invalid H00 transfer settings');
  const projects=new Map();for(const task of groups.keys()){const rows=f.attempts.filter(a=>a.task===task),project=rows[0].project;if(!project||rows.some(a=>a.project!==project))throw Error('Invalid project group');projects.set(project,(projects.get(project)??0)+1);for(const repetition of [1,2])if(rows.filter(a=>a.repetition===repetition).map(a=>a.arm).sort().join(',')!=='H00,P')throw Error('Invalid H00 repeated pair');}
  if(projects.size<6||[...projects.values()].some(n=>n>2))throw Error('Invalid project diversity');
 }else if(transfer){
  if(!['H10','H01','H11'].includes(f.selectedH)||f.transferGatePassed!==true||groups.size!==2)throw Error('Invalid transfer gate or candidate');
  for(const task of groups.keys())for(const repetition of [1,2]){const pair=f.attempts.filter(a=>a.task===task&&a.repetition===repetition).map(a=>a.arm).sort();if(pair.join(',')!==[f.selectedH,'P'].sort().join(','))throw Error('Invalid transfer pair');}
 }else if(groups.size!==6||[...groups.values()].some(x=>x.slice().sort().join(',')!=='H00,H01,H10,H11,P'))throw Error('Invalid pair schedule');
 if(new Set(f.attempts.map(a=>a.slot)).size!==f.attempts.length||f.attempts.some((a,i)=>a.slot!==i+1))throw Error('Invalid slot identity');
}

verify();
if(amendment){
 if(fs.existsSync(outputRoot))throw Error('Continuation directory already exists; never overwrite or automatically resume');
 const identity=(got,wanted)=>['slot','task','project','repetition','arm','source'].every(key=>got[key]===wanted[key]);
 const historical=[];
 const expectedDirectories=new Set(f.attempts.filter(a=>a.slot<19).map(a=>a.task+'-r'+a.repetition+'-'+a.arm));
 const actualDirectories=fs.readdirSync(path.join(root,'runs'));
 if(actualDirectories.length!==18||actualDirectories.some(n=>!expectedDirectories.has(n)))throw Error('Unrecognized historical run directory');
 for(const attempt of f.attempts){
  const dir=path.join(root,'runs',attempt.task+'-r'+attempt.repetition+'-'+attempt.arm);
  if(attempt.slot>=19){if(fs.existsSync(dir))throw Error('Unstarted slot has historical artifacts: '+attempt.slot);continue;}
  const get=name=>JSON.parse(fs.readFileSync(path.join(dir,name)));
  for(const name of ['started.json','completed.json','result.json'])if(!identity(get(name),attempt))throw Error('Historical attempt identity mismatch: '+attempt.slot);
  const facts=get('stop-verification.json');
  if(!facts.terminationVerified||!facts.captureSaved||!facts.forwardingClosed||!facts.relayRemoved||facts.activeProviderHandlers!==0||get('session/cleanup.json').status!==0)throw Error('Historical stop unverified: '+attempt.slot);
  if(!fs.existsSync(path.join(dir,'candidate.tar'))||!Array.isArray(get('provider-metadata.json')))throw Error('Historical capture/accounting missing');
  historical.push({slot:attempt.slot,container:get('session/container.json').name});
 }
 if(!amendment.historicalFiles||!Object.keys(amendment.historicalFiles).length)throw Error('Missing historical artifact preservation manifest');
 for(const [relative,digest] of Object.entries(amendment.historicalFiles)){
  const file=path.resolve(root,relative);if(!file.startsWith(path.resolve(root)+path.sep)||sha(fs.readFileSync(file))!==digest)throw Error('Historical artifact changed: '+relative);
 }
 await verifyQuiescence(historical);
 fs.mkdirSync(outputRoot,{mode:0o700});fs.writeFileSync(path.join(outputRoot,'admission.json'),JSON.stringify({originalFreezeSha256:amendment.originalFreezeSha256,amendmentSha256:sha(fs.readFileSync(continuationFile)),firstSlot:19,lastSlot:48,historicalStopsVerified:18,at:new Date().toISOString()},null,2),{flag:'wx'});
}else if(fs.existsSync(path.join(root,'scheduling-paused.json')))throw Error('Continuation paused; no automatic resume');

let pause=null;
function pauseScheduling(kind,slot,details={}){if(pause)return;pause={kind,slot,...details};fs.writeFileSync(path.join(outputRoot,'scheduling-paused.json'),JSON.stringify(pause,null,2),{flag:'wx'});}
for(const attempt of f.attempts.filter(a=>!amendment||a.slot>=19)){
 verify();if(pause)break;const out=path.join(outputRoot,'runs',attempt.task+(attempt.repetition?'-r'+attempt.repetition:'')+'-'+attempt.arm);
 if(fs.existsSync(out))throw Error('Previously created slot must never be retried: '+out);
 fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({...attempt,at:new Date().toISOString()},null,2),{flag:'wx'});
 const requests=[],active=new Set(),abort=new AbortController();let session,deadline=null,timer,result,terminationVerified=false,forwardingOpen=true,deadlineTriggered=false,captureSaved=false,relayRemoved=false;
 const deadlineReason=Object.assign(new Error('Own task deadline reached'),{name:'AbortError'});
 const settleHandlers=async()=>{let timeout;try{await Promise.race([Promise.allSettled([...active]),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Provider handlers did not settle after cancellation')),5000);})]);}finally{clearTimeout(timeout);}};
 const save=()=>fs.writeFileSync(path.join(out,'provider-metadata.json'),JSON.stringify(requests,null,2));
 try{
  session=await startContainer({source:attempt.source,toolchain:f.toolchain,template:attempt.arm!=='P'?f.template:f.dependencies,output:path.join(out,'session'),onRequest:(frame,rawSend,signal)=>{
   const send=message=>{if(forwardingOpen)rawSend(message);};
   const pending=(async()=>{
    const requestKind=frame.body?.tools?.length?'work':'title';
    let requestSignal;
    const record={requestIndex:requests.length+1,requestKind,at:new Date().toISOString(),path:frame.path,model:frame.body?.model,effort:frame.body?.reasoning?.effort??null,forwarded:false,usage:null};requests.push(record);save();
    if(f.experimentKind==='h00-transfer')fs.writeFileSync(path.join(out,'request-'+requests.length+'.json'),JSON.stringify(frame.body),{mode:0o600,flag:'wx'});
    if(pause||abort.signal.aborted||!deadline||Date.now()>=deadline){record.notForwardedReason='paused-or-deadline';save();send({type:'headers',status:408,contentType:'text/plain'});send({type:'end'});return;}
    if(frame.path!=='/v1/responses'||frame.body?.model!=='gpt-5.6-luna'||frame.body.stream!==true||frame.body?.reasoning?.effort!=='high'){pauseScheduling('boundary_refusal',attempt.slot);record.rejected=true;save();send({type:'headers',status:403,contentType:'text/plain'});send({type:'end'});return;}
    try{
     const a=readAuth();record.forwarded=true;record.forwardedAt=new Date().toISOString();record.maxDurationMs=f.streamLimit==='remaining-task-budget'?Math.max(0,deadline-Date.now()):180000;record.connectionTimeoutMs=f.connectionTimeoutMs??null;save();
     const connectionAbort=new AbortController();const connectionTimer=f.connectionTimeoutMs?setTimeout(()=>connectionAbort.abort(new Error('Connection timeout')),f.connectionTimeoutMs):null;
     requestSignal=AbortSignal.any([signal,abort.signal,...(f.streamLimit==='remaining-task-budget'?[connectionAbort.signal]:[AbortSignal.timeout(180000)])]);
     let response;try {
     response=await fetchImpl('https://chatgpt.com/backend-api/codex/responses',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${a.access}`,'ChatGPT-Account-Id':a.accountId},body:JSON.stringify({...frame.body,store:false}),signal:requestSignal});}finally{clearTimeout(connectionTimer);}
     record.status=response.status;save();
     if([401,403,429].includes(response.status)){

      let bytes=Buffer.alloc(0),truncated=false;for await(const chunk of response.body){const b=Buffer.from(chunk);if(bytes.length+b.length>8192){bytes=Buffer.concat([bytes,b.subarray(0,8192-bytes.length)]);truncated=true;break;}bytes=Buffer.concat([bytes,b]);}
      let type=null,message=null;try{const value=JSON.parse(bytes.toString());type=typeof value.error?.type==='string'?value.error.type.slice(0,128):null;message=typeof value.error?.message==='string'?value.error.message.slice(0,1024):null;}catch{}
      record.refusal={status:response.status,type,message,truncated};pauseScheduling(type==='usage_limit_reached'&&!truncated?'incomplete_quota':'provider_refusal',attempt.slot,record.refusal);save();stopWorkload(session);abort.abort();return;
     }
     send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/event-stream'});
     const observer=responseObserver(record,save);
     for await(const chunk of response.body){
      if(f.experimentKind==='h00-transfer')fs.appendFileSync(path.join(out,'response-'+record.requestIndex+'.sse'),chunk,{mode:0o600});
      // Observe/persist upstream facts before delivery can fail or be cancelled.
      observer.push(chunk);send({type:'chunk',data:Buffer.from(chunk).toString('base64')});
     }
     observer.end();record.streamEnded=true;
     if(response.status===200&&!knownResponseTerminal(record)){pauseScheduling('unknown_submission',attempt.slot,{reason:'Stream ended without a bound terminal provider response'});stopWorkload(session);abort.abort();return;}
     send({type:'end'});
    }catch(error){record.error=error.name;
     const ownDeadline=record.forwarded&&deadlineTriggered&&requestSignal?.reason===deadlineReason;
     record.transportError={name:error.name,clientOrRelayCancelled:signal.aborted,ownTaskDeadline:ownDeadline};
     record.clientDelivery='unconfirmed-after-transport-error';
     record.serverCompletion=knownResponseTerminal(record)?record.terminalResponse.status:'unknown';
     if(ownDeadline)record.cancelledByOwnTaskDeadline=true;
     if([401,403,429].includes(record.status)){record.refusal??={status:record.status,bodyInterrupted:true};pauseScheduling('provider_refusal',attempt.slot,record.refusal);}
     else if(!ownDeadline&&(!record.forwarded||!knownResponseTerminal(record)))pauseScheduling(record.forwarded?'unknown_submission':'authorization_unavailable',attempt.slot,{error:error.name});
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
 const stopFacts={ownTaskDeadlineTriggered:deadlineTriggered,terminationVerified,captureSaved,forwardingClosed:!forwardingOpen,relayRemoved,activeProviderHandlers:active.size,providerServerStateMayRemainUnknown:requests.some(r=>r.forwarded&&!knownResponseTerminal(r))};
 fs.writeFileSync(path.join(out,'stop-verification.json'),JSON.stringify(stopFacts,null,2));
 if(!terminationVerified||!captureSaved||!relayRemoved||forwardingOpen||active.size)pauseScheduling('local_execution_unverified',attempt.slot,stopFacts);
 if(terminationVerified)fs.writeFileSync(path.join(out,'completed.json'),JSON.stringify({...attempt,terminationVerified,at:new Date().toISOString()},null,2),{flag:'wx'});
}
fs.writeFileSync(path.join(outputRoot,'outcome.json'),JSON.stringify({status:pause?'paused':'finished',pause},null,2));console.log(JSON.stringify({status:pause?'paused':'finished',pause}));

return {status:pause?'paused':'finished',pause};
}

function verifyHistoricalContainers(historical){
 const names=new Set(execFileSync('docker',['ps','-a','--format','{{.Names}}'],{encoding:'utf8',timeout:30000}).trim().split('\n'));
 if(historical.some(r=>typeof r.container!=='string'||!r.container||names.has(r.container)))throw Error('Historical container absent-state not verified');
}
