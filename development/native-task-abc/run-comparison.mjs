import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {runTask} from './native-run.mjs';
export async function runComparison({root,startContainer,captureCandidate,stopWorkload,readAuth,fetchImpl=fetch,runTaskImplementation=runTask}) {
const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function verify(){for(const [file,digest]of Object.entries(f.files))if(sha(fs.readFileSync(file))!==digest)throw Error('Frozen file changed: '+file);if(f.attempts.length!==12||f.model!=='openai/gpt-5.6-luna'||f.variant!=='low'||f.budgetMs!==900000||!f.preflightPassed)throw Error('Invalid freeze');const groups=new Map();for(const a of f.attempts){const group=groups.get(a.task)??[];group.push(a.arm);groups.set(a.task,group);}if(groups.size!==4||[...groups.values()].some(x=>x.sort().join('')!=='ABC'))throw Error('Invalid triad schedule');}
verify();if(fs.existsSync(path.join(root,'scheduling-paused.json')))throw Error('Scheduling paused; no automatic resume');
let pause=null;
function pauseScheduling(kind,slot,details={}){if(pause)return;pause={kind,slot,...details};fs.writeFileSync(path.join(root,'scheduling-paused.json'),JSON.stringify(pause,null,2),{flag:'wx'});}
for(const attempt of f.attempts){
 verify();if(pause)break;const out=path.join(root,'runs',attempt.task+'-'+attempt.arm);
 if(fs.existsSync(out))throw Error('Previously created slot must never be retried: '+out);
 fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({...attempt,at:new Date().toISOString()},null,2),{flag:'wx'});
 const requests=[],active=new Set(),abort=new AbortController();let session,deadline=null,timer,result,terminationVerified=false;
 const save=()=>fs.writeFileSync(path.join(out,'provider-metadata.json'),JSON.stringify(requests,null,2));
 try{
  session=await startContainer({source:attempt.source,toolchain:f.toolchain,template:attempt.arm==='C'?f.template:f.dependencies,output:path.join(out,'session'),onRequest:(frame,send,signal)=>{
   const pending=(async()=>{
    const record={at:new Date().toISOString(),path:frame.path,model:frame.body?.model,effort:frame.body?.reasoning?.effort??null,forwarded:false,usage:null};requests.push(record);save();
    if(pause||abort.signal.aborted||!deadline||Date.now()>=deadline){record.notForwardedReason='paused-or-deadline';save();send({type:'headers',status:408,contentType:'text/plain'});send({type:'end'});return;}
    if(frame.path!=='/v1/responses'||frame.body?.model!=='gpt-5.6-luna'||frame.body.stream!==true){pauseScheduling('boundary_refusal',attempt.slot);record.rejected=true;save();send({type:'headers',status:403,contentType:'text/plain'});send({type:'end'});return;}
    try{
     const a=readAuth();record.forwarded=true;record.forwardedAt=new Date().toISOString();save();
     const response=await fetchImpl('https://chatgpt.com/backend-api/codex/responses',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${a.access}`,'ChatGPT-Account-Id':a.accountId},body:JSON.stringify({...frame.body,store:false}),signal:AbortSignal.any([signal,abort.signal,AbortSignal.timeout(Math.max(1,Math.min(180000,deadline-Date.now())))])});record.status=response.status;save();
     if([401,403,429].includes(response.status)){
      let bytes=Buffer.alloc(0),truncated=false;for await(const chunk of response.body){const b=Buffer.from(chunk);if(bytes.length+b.length>8192){bytes=Buffer.concat([bytes,b.subarray(0,8192-bytes.length)]);truncated=true;break;}bytes=Buffer.concat([bytes,b]);}
      let type=null,message=null;try{const value=JSON.parse(bytes.toString());type=typeof value.error?.type==='string'?value.error.type.slice(0,128):null;message=typeof value.error?.message==='string'?value.error.message.slice(0,1024):null;}catch{}
      record.refusal={status:response.status,type,message,truncated};pauseScheduling(type==='usage_limit_reached'&&!truncated?'incomplete_quota':'provider_refusal',attempt.slot,record.refusal);save();stopWorkload(session);abort.abort();return;
     }
     send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/event-stream'});
     const decoder=new TextDecoder();let buffer='';
     for await(const chunk of response.body){send({type:'chunk',data:Buffer.from(chunk).toString('base64')});buffer+=decoder.decode(chunk,{stream:true});let split;while((split=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,split);buffer=buffer.slice(split+2);for(const line of packet.split('\n'))if(line.startsWith('data: ')){try{const event=JSON.parse(line.slice(6));if(event.response?.usage){const u=event.response.usage;record.usage=Object.fromEntries(['input_tokens','output_tokens','total_tokens'].filter(k=>Number.isFinite(u[k])).map(k=>[k,u[k]]));if(Number.isFinite(u.input_tokens_details?.cached_tokens))record.usage.cached_tokens=u.input_tokens_details.cached_tokens;if(Number.isFinite(u.output_tokens_details?.reasoning_tokens))record.usage.reasoning_tokens=u.output_tokens_details.reasoning_tokens;}if(event.response?.status){record.responseStatus=event.response.status;record.responseId=event.response.id;}}catch{}}}}
     record.streamEnded=true;if(response.status===200&&!['completed','failed','cancelled','incomplete'].includes(record.responseStatus)){pauseScheduling('unknown_submission',attempt.slot,{reason:'Stream ended without a terminal provider response'});stopWorkload(session);abort.abort();return;}send({type:'end'});
    }catch(error){record.error=error.name;pauseScheduling(record.forwarded?'unknown_submission':'authorization_unavailable',attempt.slot,{error:error.name});if(session)stopWorkload(session);abort.abort();throw error;}
    finally{record.finishedAt=new Date().toISOString();save();}
   })();active.add(pending);return pending.finally(()=>active.delete(pending));
  }});
  const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true});"]);if(setup.status!==0)throw Error('Dependency preparation failed: '+setup.stderr);
  const version=session.exec(['/opt/opencode','--version']);if(version.status!==0||version.stdout.trim()!=='1.18.26')throw Error('Runtime mismatch');
  deadline=Date.now()+f.budgetMs;timer=setTimeout(()=>abort.abort(),f.budgetMs);
  result=await runTaskImplementation(session,{config:f.config,task:fs.readFileSync(path.join(attempt.source,'TASK.md'),'utf8'),enabled:attempt.arm==='C',arm:attempt.arm,model:f.model,variant:f.variant,limitMs:f.budgetMs,continuation:f.continuation,canContinue:()=>!pause&&!abort.signal.aborted,stopWorkload});
  terminationVerified=result.termination?.terminationVerified===true;if(!terminationVerified)throw Error('Termination not verified');
  clearTimeout(timer);abort.abort();await Promise.allSettled([...active]);save();
  const native=session.exec(['node','-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});console.log(JSON.stringify({sessions:db.prepare('SELECT id,parent_id,directory,agent,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write FROM session').all(),messages:db.prepare('SELECT id,session_id,data FROM message').all().map(x=>({...x,data:JSON.parse(x.data)})),tools:db.prepare('SELECT id,message_id,session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool')}));db.close();"]);if(native.status!==0)throw Error('Native accounting extraction failed');fs.writeFileSync(path.join(out,'native-evidence.json'),native.stdout);
  if(captureCandidate(session,out).status!==0)throw Error('Candidate capture failed');
  const evidence=JSON.parse(native.stdout);let workflow=null;try{workflow=JSON.parse(evidence.tools.find(t=>t.data.tool==='harness_task')?.data.state?.output);}catch{}
  const summary={...attempt,...result,requests:requests.filter(r=>r.forwarded).length,requestsWithoutUsage:requests.filter(r=>r.forwarded&&!r.usage).length,workflowStatus:workflow?.status??null,repairs:workflow?.repairs??null,toolCalls:evidence.tools.length,sessions:evidence.sessions.length,delivery:attempt.arm==='C'?workflow?.executionDirectory??null:'/work/repo'};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message},null,2));pauseScheduling('execution_or_capture_error',attempt.slot,{message:error.message});if(session&&!fs.existsSync(path.join(out,'candidate.tar'))){stopWorkload(session);captureCandidate(session,out);}}
 finally{clearTimeout(timer);abort.abort();await Promise.allSettled([...active]);save();if(session&&session.close()!==0)throw Error('Container cleanup failed');}
 if(terminationVerified)fs.writeFileSync(path.join(out,'completed.json'),JSON.stringify({...attempt,terminationVerified,at:new Date().toISOString()},null,2),{flag:'wx'});
}
fs.writeFileSync(path.join(root,'outcome.json'),JSON.stringify({status:pause?'paused':'finished',pause},null,2));console.log(JSON.stringify({status:pause?'paused':'finished',pause}));

return {status:pause?'paused':'finished',pause};
}
