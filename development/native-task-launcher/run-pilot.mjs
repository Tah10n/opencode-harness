import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
// Future revision of the external comparison launcher. Dependencies are the existing
// container/native adapters; injection permits a model-free scripted execution.
export async function runPilot({root,startContainer,captureCandidate,runOpenCode,stopWorkload,readAuth,fetchImpl=fetch}) {
const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
const sha=x=>createHash('sha256').update(x).digest('hex');
function verify(){
 for(const [file,digest]of Object.entries(f.files))if(sha(fs.readFileSync(file))!==digest)throw Error('Frozen file changed: '+file);
 const development=f.kind==='original-requirement-development';
 const comparison=f.kind==='fixed-20-pair-full-native-comparison';
 const count=development?4:comparison?40:200;
 if(f.attempts.length!==count||!f.preflightPassed||!(/^[a-f0-9]{40}$/.test(f.candidateCommit))||
   (!development&&!comparison&&f.candidateCommit!=='3750b0d448fbfa7db80c459029a98fd221e86f94')||
   development&&![1,2].includes(f.version)||f.model!=='openai/gpt-5.6-luna'||f.variant!=='low'||f.budgetMs!==900000)throw Error('Invalid freeze');
 const pairs=new Map();for(const a of f.attempts){if(!['A','B'].includes(a.arm))throw Error('Invalid arm');const arms=pairs.get(a.task)??[];arms.push(a.arm);pairs.set(a.task,arms);}
 if(development){if(pairs.size!==4||[...pairs.values()].some(arms=>arms.join('')!=='B'))throw Error('Invalid development schedule');}
 else if(pairs.size!==count/2||[...pairs.values()].some(arms=>arms.sort().join('')!=='AB'))throw Error('Invalid paired schedule');
}

verify();
if(fs.existsSync(path.join(root,'scheduling-paused.json')))throw Error('Scheduling is paused; no automatic resume');
let pause=null;
for(const attempt of f.attempts){
 verify();const {task,arm}=attempt;const out=path.join(root,'runs',task+'-'+arm);if(fs.existsSync(out)){const done=path.join(out,'completed.json');if(!fs.existsSync(done))throw Error('Previously started slot has no verified completion; never retry: '+out);const prior=JSON.parse(fs.readFileSync(done)),cleanup=JSON.parse(fs.readFileSync(path.join(out,'session/cleanup.json')));if(prior.task!==task||prior.arm!==arm||prior.slot!==attempt.slot||!prior.terminationVerified||cleanup.status!==0)throw Error('Prior slot accounting/termination mismatch: '+out);continue;}fs.mkdirSync(out,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({at:new Date().toISOString(),...attempt,model:f.model,variant:f.variant,budgetMs:f.budgetMs},null,2),{flag:'wx'});
 const requests=[],activeRequests=new Set(),providerAbort=new AbortController();let session,workflowDeadline=null,deadlineTimer,terminationVerified=false,completed=false,quotaStopped=false;
 const saveRequests=()=>fs.writeFileSync(path.join(out,'provider-metadata.json'),JSON.stringify(requests,null,2),{mode:0o600});
 try{
  session=await startContainer({source:attempt.source,toolchain:f.toolchain,template:arm==='B'?f.template:f.dependencies,output:path.join(out,'session'),onRequest:(frame,send,signal)=>{const pending=(async()=>{
   const record={at:new Date().toISOString(),model:frame.body?.model,path:frame.path,hasTools:!!frame.body?.tools?.length,effort:frame.body?.reasoning?.effort??null,usage:null,forwarded:false};requests.push(record);saveRequests();
   if(pause){record.notForwardedReason=pause.kind;saveRequests();send({type:'headers',status:429,contentType:'application/json'});send({type:'end'});return;}
   if(workflowDeadline&&(Date.now()>=workflowDeadline||providerAbort.signal.aborted)){record.notForwardedReason='task-deadline-or-finished';saveRequests();send({type:'headers',status:408,contentType:'text/plain'});send({type:'end'});return;}
   if(!workflowDeadline||frame.path!=='/v1/responses'||frame.body?.model!=='gpt-5.6-luna'||frame.body.stream!==true){record.rejected=true;saveRequests();send({type:'headers',status:403,contentType:'text/plain'});send({type:'end'});return;}
   // Same forwarding boundary as the preceding native development runs. Only
   // numeric response usage is additionally observed; task bodies are unchanged.
   try{const a=readAuth();record.forwarded=true;record.forwardedAt=new Date().toISOString();saveRequests();const response=await fetchImpl('https://chatgpt.com/backend-api/codex/responses',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${a.access}`,'ChatGPT-Account-Id':a.accountId},body:JSON.stringify({...frame.body,store:false}),signal:AbortSignal.any([signal,providerAbort.signal,AbortSignal.timeout(Math.max(1,Math.min(180000,workflowDeadline-Date.now())))])});record.status=response.status;
    if(response.status===429){
     // Bound diagnostic bytes; unknown/truncated 429 also pauses, without claiming quota.
     let bytes=Buffer.alloc(0),truncated=false;
     try { for await(const chunk of response.body){const part=Buffer.from(chunk);if(bytes.length+part.length>8192){bytes=Buffer.concat([bytes,part.subarray(0,8192-bytes.length)]);truncated=true;break;}bytes=Buffer.concat([bytes,part]);} }
     catch(error){record.bodyReadError=error.name;}
     let type=null,message=null;try{const value=JSON.parse(bytes.toString());type=typeof value.error?.type==='string'?value.error.type.slice(0,128):null;message=typeof value.error?.message==='string'?value.error.message.slice(0,1024):null;}catch{}
     pause={kind:type==='usage_limit_reached'&&!truncated?'incomplete_quota':'paused_unknown_429',status:429,type,message,truncated,slot:attempt.slot};
     record.refusal=pause;saveRequests();
     fs.writeFileSync(path.join(root,'scheduling-paused.json'),JSON.stringify(pause,null,2),{flag:'wx',mode:0o600});
     // Stop using the existing verified workload boundary, retaining the container for capture.
     const stopped=stopWorkload(session);if(stopped?.terminationVerified!==true)throw Error('Quota stop termination unverified');quotaStopped=true;providerAbort.abort();return;
    }
    send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/event-stream'});
    const decoder=new TextDecoder();let buffer='';
    for await(const chunk of response.body){send({type:'chunk',data:Buffer.from(chunk).toString('base64')});buffer+=decoder.decode(chunk,{stream:true});let split;while((split=buffer.indexOf('\n\n'))>=0){const part=buffer.slice(0,split);buffer=buffer.slice(split+2);for(const line of part.split('\n'))if(line.startsWith('data: ')){try{const event=JSON.parse(line.slice(6));if(event.response?.usage){const u=event.response.usage;record.usage=Object.fromEntries(['input_tokens','output_tokens','total_tokens'].filter(k=>Number.isFinite(u[k])).map(k=>[k,u[k]]));if(Number.isFinite(u.input_tokens_details?.cached_tokens))record.usage.input_tokens_details={cached_tokens:u.input_tokens_details.cached_tokens};if(Number.isFinite(u.output_tokens_details?.reasoning_tokens))record.usage.output_tokens_details={reasoning_tokens:u.output_tokens_details.reasoning_tokens};record.responseId=event.response.id;record.responseStatus=event.response.status;}}catch{}}}}
    send({type:'end'});
   }catch(error){record.error=error.name;throw error;}finally{record.finishedAt=new Date().toISOString();saveRequests();}
  })();activeRequests.add(pending);return pending.finally(()=>activeRequests.delete(pending));}});
  const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true});"]);if(setup.status!==0)throw Error('Native dependency setup failed: '+setup.stderr);
  const version=session.exec(['/opt/opencode','--version']);if(version.status!==0||version.stdout.trim()!=='1.18.26')throw Error('Frozen OpenCode version mismatch');
  const config=JSON.parse(fs.readFileSync(path.join(root,'run-config.json')));
  workflowDeadline=Date.now()+f.budgetMs;deadlineTimer=setTimeout(()=>providerAbort.abort(),f.budgetMs);
  const result=await runOpenCode(session,{config,task:fs.readFileSync(path.join(attempt.source,'TASK.md'),'utf8'),enabled:arm==='B',model:f.model,variant:f.variant,limitMs:f.budgetMs,...(arm==='B'?{command:'harness-task'}:{})});
  terminationVerified=result.termination?.terminationVerified===true;if(!terminationVerified)throw Error('Workload termination unverified before observer checks');
  clearTimeout(deadlineTimer);providerAbort.abort();await Promise.allSettled([...activeRequests]);saveRequests();
  const native=session.exec(['node','-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});const sessions=db.prepare('SELECT id,parent_id,directory,agent,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write FROM session').all();const messages=db.prepare('SELECT id,session_id,data FROM message').all().map(x=>({...x,data:JSON.parse(x.data)}));const tools=db.prepare('SELECT id,message_id,session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool');console.log(JSON.stringify({sessions,messages,tools}));db.close();"]);if(native.status!==0)throw Error('Native accounting extraction failed: '+native.stderr);
  fs.writeFileSync(path.join(out,'native-evidence.json'),native.stdout,{mode:0o600});const evidence=JSON.parse(native.stdout);
  const workflowTool=evidence.tools.find(x=>x.data.tool==='harness_task');let workflow;try{workflow=JSON.parse(workflowTool?.data.state?.output);}catch{}
  const capture=captureCandidate(session,out);if(capture.status!==0)throw Error('Candidate capture failed');
  let nativeSource='/work/repo';
  if(arm==='B'){
   const retained=session.exec(['node','-e',"const fs=require('fs'),p='/work/repo/.git/harness-task';console.log(JSON.stringify(fs.existsSync(p)?fs.readdirSync(p).filter(n=>/^[a-f0-9-]+$/.test(n)&&fs.existsSync(p+'/'+n+'/worktree')).map(n=>({artifacts:p+'/'+n,executionDirectory:p+'/'+n+'/worktree'})):[]));"]);if(retained.status!==0)throw Error('Retained delivery discovery failed');const found=JSON.parse(retained.stdout);
   if(found.length!==1)throw Error('B delivery unavailable or ambiguous; baseline is not a substitute');
   if(workflow?.executionDirectory&&workflow.executionDirectory!==found[0].executionDirectory)throw Error('B delivery paths disagree');
   workflow={...found[0],...workflow};nativeSource=workflow.executionDirectory;
  }
  if(nativeSource!=='/work/repo'&&!/^\/work\/repo\/\.git\/harness-task\/[a-f0-9-]+\/worktree$/.test(nativeSource))throw Error('Unexpected native delivery path');
  // The model process has ended. Only now supply independent checks, inside the
  // existing offline container. Never execute generated candidate code on host.
  const acceptanceBytes=fs.readFileSync(path.join(attempt.source,'../acceptance/acceptance.test.mjs')).toString('base64');
  const originalTests=Object.fromEntries(fs.readdirSync(path.join(attempt.source,'test')).map(n=>[n,fs.readFileSync(path.join(attempt.source,'test',n)).toString('base64')]));
  const inject=session.exec(['node','-e',`const fs=require('fs'),path=require('path');fs.writeFileSync('/work/acceptance.test.mjs',Buffer.from(${JSON.stringify(acceptanceBytes)},'base64'));fs.cpSync(${JSON.stringify(nativeSource)},'/work/preservation',{recursive:true,filter:p=>path.basename(p)!=='.git'});fs.rmSync('/work/preservation/test',{recursive:true,force:true});fs.mkdirSync('/work/preservation/test');for(const [name,bytes]of Object.entries(${JSON.stringify(originalTests)}))fs.writeFileSync(path.join('/work/preservation/test',name),Buffer.from(bytes,'base64'));`]);if(inject.status!==0)throw Error('Independent check setup failed');
  let d0Available=false;
  if(arm==='B'&&workflow?.artifacts){
   const d0Patch=path.join(workflow.artifacts,'D0.patch');
   const prepared=session.exec(['node','-e',`const fs=require('fs');if(fs.existsSync(${JSON.stringify(d0Patch)})){fs.cpSync('/input','/work/d0',{recursive:true});console.log('present');}`]);
   if(prepared.status!==0)throw Error('D0 preparation failed');
   if(prepared.stdout.trim()==='present'){
    const applied=session.exec(['git','-C','/work/d0','apply','--binary',d0Patch]);
    // Empty D0 is valid; git apply reports no valid patches for an empty file.
    const empty=session.exec(['node','-e',`console.log(require('fs').statSync(${JSON.stringify(d0Patch)}).size)`]);
    if(applied.status!==0&&empty.stdout.trim()!=='0')throw Error('D0 patch reconstruction failed: '+applied.stderr);
    const copied=session.exec(['node','-e',`const fs=require('fs'),path=require('path');fs.cpSync('/work/d0','/work/d0-preservation',{recursive:true});fs.rmSync('/work/d0-preservation/test',{recursive:true,force:true});fs.mkdirSync('/work/d0-preservation/test');for(const [name,bytes]of Object.entries(${JSON.stringify(originalTests)}))fs.writeFileSync(path.join('/work/d0-preservation/test',name),Buffer.from(bytes,'base64'));`]);if(copied.status!==0)throw Error('D0 preservation setup failed');d0Available=true;
   }
  }
  const grade={};
  for(const [name,argv]of [['acceptance',['env',`PILOT_SOURCE=${nativeSource}`,'node','--test','/work/acceptance.test.mjs']],['preservation',['node','--test',...Object.keys(originalTests).map(n=>'/work/preservation/test/'+n)]],['ordinary',['npm','--prefix',nativeSource,'test']],...(d0Available?[['d0-acceptance',['env','PILOT_SOURCE=/work/d0','node','--test','/work/acceptance.test.mjs']],['d0-preservation',['node','--test',...Object.keys(originalTests).map(n=>'/work/d0-preservation/test/'+n)]],['d0-ordinary',['npm','--prefix','/work/d0','test']]]:[])]){
   const checked=session.exec(argv);fs.writeFileSync(path.join(out,name+'.stdout.txt'),checked.stdout??'');fs.writeFileSync(path.join(out,name+'.stderr.txt'),checked.stderr??'');
   const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped'].map(k=>[k,Number(new RegExp(`(?:# |ℹ )${k} (\\d+)`).exec(checked.stdout??'')?.[1])]));
   grade[name]={exitCode:checked.status,error:checked.error?.message,counts,passed:checked.status===0&&counts.tests>0&&counts.fail===0&&counts.cancelled===0&&counts.skipped===0};
   if(name.endsWith('preservation')&&counts.tests!==f.expectedPreservationTests[task])grade[name].passed=false;
   if(name.endsWith('acceptance')&&counts.tests!==f.expectedAcceptanceTests[task])grade[name].passed=false;
   if(checked.status===null)break; // Container close below terminates any timed-out check.
  }
  fs.writeFileSync(path.join(out,'behavior-grading.json'),JSON.stringify(grade,null,2));
  const delivery=arm==='B'&&workflow?.executionDirectory?path.join(out,'candidate',path.relative('/work/repo',workflow.executionDirectory)):path.join(out,'candidate');
  const summary={...attempt,exitCode:result.exitCode,timedOut:result.timedOut,elapsedMs:result.elapsedMs,parseErrors:result.parseErrors,requests:requests.filter(x=>x.forwarded).length,relayRequests:requests.length,requestsWithoutObservedUsage:requests.filter(x=>x.forwarded&&!x.usage).length,toolCalls:evidence.tools.length,sessions:evidence.sessions.length,terminationVerified,workflowStatus:workflow?.status??null,repairs:workflow?.repairs??0,delivery};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
  if(requests.some(x=>x.rejected||[401,403].includes(x.status)))throw Error('Provider authorization/boundary refusal; stop without retry');
  completed=true; // Non-200/timeout alone does not erase independently captured delivery.
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message}));
  if(pause&&quotaStopped&&!fs.existsSync(path.join(out,'candidate'))){
   const retained=captureCandidate(session,out);if(retained.status!==0)throw Error('Partial candidate capture failed after quota stop');
  }
  // A captured B protocol failure is one retained failed slot, not a reason to
  // cancel the remaining predefined pairs. Never substitute the baseline.
  if(error.message==='B delivery unavailable or ambiguous; baseline is not a substitute'){
   const finished=JSON.parse(fs.readFileSync(path.join(out,'session/finished.json')));const evidence=JSON.parse(fs.readFileSync(path.join(out,'native-evidence.json')));
   fs.writeFileSync(path.join(out,'behavior-grading.json'),JSON.stringify(Object.fromEntries(['acceptance','preservation','ordinary'].map(name=>[name,{exitCode:null,counts:null,passed:false,unavailable:true,reason:error.message}])),null,2));
   const summary={...attempt,...finished,requests:requests.filter(x=>x.forwarded).length,relayRequests:requests.length,requestsWithoutObservedUsage:requests.filter(x=>x.forwarded&&!x.usage).length,toolCalls:evidence.tools.length,sessions:evidence.sessions.length,workflowStatus:'incomplete',protocolError:error.message,repairs:0,delivery:null};
   fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
   if(requests.some(x=>x.rejected||[401,403].includes(x.status)))throw error;completed=true;
  }else throw error;
 }
 finally{clearTimeout(deadlineTimer);providerAbort.abort();await Promise.allSettled([...activeRequests]);saveRequests();if(session&&session.close()!==0)throw Error('Container termination unverified; no further task-run admitted');}
 if(pause) return {status:pause.kind,refusal:pause};
 if(completed&&terminationVerified)fs.writeFileSync(path.join(out,'completed.json'),JSON.stringify({...attempt,at:new Date().toISOString(),terminationVerified:true},null,2),{flag:'wx'});
}

return {status:"finished"};
}
