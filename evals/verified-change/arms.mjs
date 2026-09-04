// Fixed evaluation arm adapters using the installed product runtime. This is not
// an alternative product controller; C always executes its installed CLI.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {pathToFileURL} from 'node:url'; import {spawn} from 'node:child_process';
export async function installedRuntime(directory) {
 const workspace=await import(pathToFileURL(path.join(directory,'lib/workspace.mjs')));
 const sessions=await import(pathToFileURL(path.join(directory,'lib/opencode.mjs')));
 const checks=await import(pathToFileURL(path.join(directory,'lib/checks.mjs')));
 const sandbox=await import(pathToFileURL(path.join(directory,'lib/sandbox.mjs')));
 return {...workspace,...sessions,...checks,...sandbox,directory,cli:path.join(directory,'lib/cli.mjs')};
}
const privateDirectory=()=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'verified-change-arm-'));fs.chmodSync(p,0o700);return p;};
export function isolationState(error){return !error||!['CLEANUP_UNVERIFIED','SHARED_DRAFT_MISMATCH','UNRESOLVED_PRIOR_ATTEMPT'].some(code=>error.includes(code));}
export async function plainArm(runtime,{original,task,image,model,variant,budgetMs,initialSnapshot,signal}) {
 const output=privateDirectory(),started=Date.now(),abort=new AbortController();
 const externalAbort=()=>abort.abort();signal?.addEventListener('abort',externalAbort,{once:true});
 if(signal?.aborted)abort.abort();
 const timer=setTimeout(()=>abort.abort(),budgetMs);
 const record=event=>fs.appendFileSync(path.join(output,'attempts.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n',{mode:0o600});
 let candidate,snapshot,usage,status='infrastructure_error',error;
 const name=initialSnapshot?'D1':'D0';
 try {
  candidate=await runtime.createCandidate(original,path.join(output,'candidate'));
  if(initialSnapshot){const fingerprint=await runtime.importDraft(candidate,initialSnapshot.patchPath,abort.signal);if(fingerprint!==initialSnapshot.fingerprint)throw Error('SHARED_DRAFT_MISMATCH');}
  const session=await runtime.createOpenCodeSession({controlDirectory:path.join(output,'control'),model,variant,timeoutMs:budgetMs,
   sandbox:{image,workspace:candidate,readonly:true,writablePaths:['src']}});
  const docs=['AGENTS.md','WORKFLOW.md','README.md'].filter(file=>fs.existsSync(path.join(candidate,file))).map(file=>`${file}:\n${fs.readFileSync(path.join(candidate,file),'utf8')}`).join('\n\n');
  const instruction=initialSnapshot
   ? 'Review the existing draft against the original request. Inspect relevant project instructions, consumers and available tests. Correct any missed requirement or regression you find. You have an additional opportunity to inspect, test and improve this draft; preserve correct existing behavior.'
   : 'Work on this task in /workspace using the isolated repository tools. Read relevant project instructions and consumers. Run available tests as needed.';
  if(abort.signal.aborted)throw new DOMException('cancelled','AbortError');
  record({phase:'model_started',role:initialSnapshot?'extra_plain':'draft'});
  usage=await session.prompt(`${instruction} Authorized source paths: ["src"].\n\n${task}\n\n${docs}`,abort.signal);
  record({phase:'model_finished',usage});
  snapshot=await runtime.snapshotCandidate(candidate,output,name);
  const scope=runtime.checkScope(snapshot,original.workspace,['src']);
  record({phase:'snapshot',fingerprint:snapshot.fingerprint,scope});
  status=signal?.aborted?'cancelled':Date.now()-started>=budgetMs||abort.signal.aborted?'timeout':scope.passed?'completed':'scope_violation';
 }catch(failure){
  error=failure.message;status=Date.now()-started>=budgetMs||error==='OPENCODE_SESSION_TIMEOUT'?'timeout':signal?.aborted?'cancelled':'infrastructure_error';
  record({phase:'interrupted',status,error});
  // Keep partial bytes for diagnosis, but never make them an eligible D0 or arm
  // success after timeout, scope violation or uncertain provider submission.
  if(candidate&&!snapshot){try{snapshot=await runtime.snapshotCandidate(candidate,output,name);}catch(snapshotError){record({phase:'partial_snapshot_unavailable',error:snapshotError.message});}}
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',externalAbort);}
 const result={status,error,isolationVerified:isolationState(error),snapshot,usage,elapsedMs:Date.now()-started,budgetMs,output};
 fs.writeFileSync(path.join(output,'arm.json'),JSON.stringify(result,null,2),{mode:0o600});
 return result;
}
export async function harnessArm(runtime,{original,task,model,variant,budgetMs,initialSnapshot,signal}) {
 if(!initialSnapshot)throw Error('SHARED_DRAFT_REQUIRED');
 const output=privateDirectory(),started=Date.now();
 // The product gets a clean original base and a separate immutable D0 patch.
 // It authors tests independently before importing that patch into its candidate.
 const workspace=await runtime.createCandidate(original,path.join(output,'repository'));
 const argv=[runtime.cli,'run','--workspace',workspace,'--model',model,'--variant',variant,'--time-limit-ms',String(budgetMs),'--draft-patch',initialSnapshot.patchPath,'--',task];
 const stdoutFile=path.join(output,'stdout.json'),stderrFile=path.join(output,'stderr.txt');
 const out=fs.openSync(stdoutFile,'wx',0o600),err=fs.openSync(stderrFile,'wx',0o600);
 let processResult;
 try{
  processResult=await new Promise(resolve=>{
   const child=spawn(process.execPath,argv,{stdio:['ignore',out,err]});
   const abort=()=>child.kill('SIGINT');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   child.once('error',error=>{signal?.removeEventListener('abort',abort);resolve({error:error.message});});
   child.once('close',(exitCode,terminationSignal)=>{signal?.removeEventListener('abort',abort);resolve({exitCode,terminationSignal});});
  });
 }finally{fs.closeSync(out);fs.closeSync(err);}
 let report,failureDetail,error=processResult.error;
 try{if(fs.statSync(stdoutFile).size>32*1024*1024)throw Error('REPORT_TOO_LARGE');report=JSON.parse(fs.readFileSync(stdoutFile,'utf8'));}catch(failure){error??=failure.message;}
 if(report?.output&&['execution_error','timeout','cancelled'].includes(report.stopReason)&&!Array.isArray(report.snapshots)){
  try{const failureFile=path.join(report.output,'error.json');if(fs.statSync(failureFile).size>1024*1024)throw Error('ERROR_REPORT_TOO_LARGE');failureDetail=JSON.parse(fs.readFileSync(failureFile,'utf8'));error??=failureDetail.error;}catch(failure){error??='PRODUCT_FAILURE_DETAIL_UNAVAILABLE: '+failure.message;}
 }
 const imported=report?.snapshots?.[0]?.snapshot;
 let status=report?.stopReason==='timeout'?'timeout':report?.stopReason==='cancelled'?'cancelled':error||!report?.selected?'infrastructure_error':'completed';
 if(imported&&imported.fingerprint!==initialSnapshot.fingerprint){status='isolation_violation';error='SHARED_DRAFT_MISMATCH';}
 if(report?.stopReason==='scope_violation')status='scope_violation';
 const isolationVerified=isolationState(error)&&!error?.includes('PRODUCT_FAILURE_DETAIL_UNAVAILABLE')&&Boolean(report)&&!processResult.terminationSignal;
 const result={status,error,isolationVerified,...processResult,snapshot:report?.selected,report,completedPromptUsage:report?.usage??failureDetail?.usage,elapsedMs:Date.now()-started,budgetMs,output};
 fs.writeFileSync(path.join(output,'arm.json'),JSON.stringify(result,null,2),{mode:0o600});
 return result;
}
