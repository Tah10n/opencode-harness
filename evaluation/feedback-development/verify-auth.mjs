import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {existingConnection,authSource,ConnectionError} from './auth.mjs';
import {realBatch} from './suite.mjs';
import {runComparison} from '../support/scheduler.mjs';
import {manifest} from '../support/manifest.mjs';
import {mock} from 'node:test';

export async function verifyAuth(root) {
  fs.mkdirSync(root,{recursive:true});
  const data=path.join(root,'data'),file=path.join(data,'opencode/auth.json');fs.mkdirSync(path.dirname(file),{recursive:true});
  const env={XDG_DATA_HOME:data},home=path.join(root,'other-home');
  const auth=(expires=Date.now()+60000)=>({type:'oauth',access:'synthetic-access',refresh:'synthetic-refresh',accountId:'synthetic-account',expires});
  const save=a=>fs.writeFileSync(file,JSON.stringify({openai:a,retained:{type:'api',key:'synthetic-other-provider'}}),{mode:0o600});
  let fetches=0;
  const neverFetch=()=>{fetches++;throw Error('No network permitted');};
  assert.deepEqual(authSource({env,home}),{kind:'file',file});
  assert.equal(authSource({env:{XDG_DATA_HOME:'relative'},home}).file,path.join(home,'.local/share/opencode/auth.json'));
  save(auth());const original=fs.readFileSync(file),connection=existingConnection({env,home,fetchImpl:neverFetch});
  const initial=await connection.readiness();assert.equal(initial.expired,false);assert.equal(initial.inferenceRequests,0);assert.equal(fetches,0);
  assert.ok(fs.readFileSync(file).equals(original),'Fresh access never mutates the auth store or expires');
  save({...auth(),access:'synthetic-updated-access'});
  assert.equal((await connection.read()).access,'synthetic-updated-access','Reread the current ordinary OpenCode record');

  let refreshCalls=0;
  const tokenFetch=async(url,init)=>{
    refreshCalls++;assert.equal(url,'https://auth.openai.com/oauth/token');assert.equal(init.redirect,'error');
    assert.equal(init.method,'POST');assert.equal(new URLSearchParams(init.body).get('grant_type'),'refresh_token');
    assert.equal(new URLSearchParams(init.body).get('refresh_token'),'synthetic-refresh');
    await new Promise(resolve=>setTimeout(resolve,5));
    return Response.json({access_token:'synthetic-native-renewed',refresh_token:'synthetic-native-rotated',expires_in:60});
  };
  const initialClock=Date.now();save(auth(initialClock+1000));const expiring=existingConnection({env,home,fetchImpl:tokenFetch});await expiring.readiness();
  assert.equal(refreshCalls,0,'A valid current access must not be refreshed');
  const realNow=Date.now;let reads,before;
  try{
    Date.now=()=>initialClock+1001;before=Date.now();
    assert.equal(JSON.parse(fs.readFileSync(file)).openai.expires,initialClock+1000,'Only synthetic time advanced; stored expiry unchanged');
    reads=await Promise.all([expiring.read(),expiring.read(),expiring.read()]);
  }finally{Date.now=realNow;}
  assert.equal(refreshCalls,1,'Native loader single-flights simultaneous expired-access requests');
  assert.ok(reads.every(a=>a.access==='synthetic-native-renewed'&&a.accountId==='synthetic-account'));
  const stored=JSON.parse(fs.readFileSync(file));
  assert.equal(stored.openai.refresh,'synthetic-native-rotated');assert.ok(stored.openai.expires>=before+60000);
  assert.equal(stored.openai.expires,before+60000,'Native expiry is derived from the token response');assert.deepEqual(stored.retained,{type:'api',key:'synthetic-other-provider'});
  const safe=expiring.safeStatus();
  for(const value of ['synthetic-native-renewed','synthetic-native-rotated','synthetic-account'])assert.ok(!JSON.stringify(safe).includes(value));
  assert.equal(safe.authRefreshCalls,1);assert.equal(safe.inferenceRequests,0);

  save(auth(Date.now()-1));let failures=0;const old=fs.readFileSync(file);
  const failed=existingConnection({env,home,fetchImpl:async()=>{failures++;return new Response(null,{status:401});}});
  await assert.rejects(()=>failed.readiness(),e=>e instanceof ConnectionError&&e.reason==='native-refresh-failed');
  assert.equal(failures,1);assert.ok(fs.readFileSync(file).equals(old),'Failed refresh never repairs or changes expiry');
  assert.throws(()=>failed.assertStoredReady(),/access-expired/);
  const apiCall=spawnSync(process.execPath,['--input-type=module','-e',`import {prepare} from ${JSON.stringify(new URL('./prepare.mjs',import.meta.url).href)};try{prepare({output:${JSON.stringify(realBatch)},model:'openai/gpt-5.6-luna',variant:'high',authorizeModelRuns:true});process.exit(2);}catch(e){if(e.reason!=='access-expired')throw e;console.log('READINESS_REJECTED_BEFORE_PREPARATION');}`],{env:{...process.env,XDG_DATA_HOME:data,OPENCODE_AUTH_CONTENT:''},encoding:'utf8'});
  assert.equal(apiCall.status,0,apiCall.stderr);assert.match(apiCall.stdout,/READINESS_REJECTED_BEFORE_PREPARATION/);

  let cancelled=0;const abort=new AbortController();
  const slow=existingConnection({env,home,fetchImpl:async(url,{signal})=>{cancelled++;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}});
  const hanging=slow.read({signal:abort.signal});setTimeout(()=>abort.abort(new Error('Synthetic task deadline')),5);
  await assert.rejects(()=>hanging,e=>e.reason==='native-refresh-cancelled');assert.equal(cancelled,1);assert.ok(fs.readFileSync(file).equals(old));

  const overridden={...env,OPENCODE_AUTH_CONTENT:JSON.stringify({openai:auth()})};
  const fromEnvironment=existingConnection({env:overridden,home,fetchImpl:neverFetch});
  assert.equal((await fromEnvironment.readiness()).sourceKind,'environment');assert.equal(fetches,0);
  save(auth());const fallback=existingConnection({env:{...env,OPENCODE_AUTH_CONTENT:'malformed-json'},home,fetchImpl:neverFetch});assert.equal((await fallback.readiness()).sourceKind,'file');
  const wrongProvider=()=>existingConnection({env,home,providerID:'different',fetchImpl:neverFetch});assert.throws(wrongProvider,/unsupported-provider/);
  save({type:'api',key:'synthetic-key'});await assert.rejects(()=>existingConnection({env,home,fetchImpl:neverFetch}).readiness(),/oauth-record-missing/);
  save({...auth(),refresh:''});await assert.rejects(()=>existingConnection({env,home,fetchImpl:neverFetch}).readiness(),/required-refresh-fields-missing/);
  save({...auth(),accountId:undefined});await assert.rejects(()=>existingConnection({env,home,fetchImpl:neverFetch}).readiness(),/required-access-fields-missing/);
  fs.rmSync(file);await assert.rejects(()=>existingConnection({env,home,fetchImpl:neverFetch}).readiness(),/source-missing/);
  fs.writeFileSync(file,'invalid');await assert.rejects(()=>existingConnection({env,home,fetchImpl:neverFetch}).readiness(),/source-invalid/);
  assert.equal(fetches,0);
  // Actual scheduler + asynchronous native auth, after part of a short budget.
  // This formerly stopped before auth with RangeError for fractional milliseconds.
  save(auth(Date.now()-1));
  const bounded=existingConnection({env,home,fetchImpl:tokenFetch}),shortRoot=path.join(root,'short-budget'),source=path.join(root,'public');
  fs.mkdirSync(shortRoot);fs.mkdirSync(source);fs.writeFileSync(path.join(source,'TASK.md'),'Synthetic asynchronous auth deadline');
  const inputs=manifest(source),attempt={slot:1,task:'short-budget',arm:'direct',source};
  fs.writeFileSync(path.join(shortRoot,'freeze.json'),JSON.stringify({experimentKind:'fixture',model:'openai/gpt-5.6-luna',variant:'high',budgetMs:5000,streamLimit:'remaining-task-budget',preflightPassed:true,files:{},attempts:[attempt],inputManifests:{'short-budget-direct':inputs}}));
  let syntheticRequests=0;
  let outcome;mock.timers.enable({apis:['Date'],now:Date.now()});
  try{outcome=await runComparison({root:shortRoot,readAuth:bounded.read,readInput:async()=>({manifest:inputs,receipt:{fixture:true}}),
    fetchImpl:async()=>{syntheticRequests++;return new Response(['response.created','response.completed'].map((type,i)=>'data: '+JSON.stringify({type,response:{id:'synthetic-response',model:'gpt-5.6-luna',status:i?'completed':'in_progress',usage:i?{input_tokens:1,output_tokens:1,total_tokens:2}:undefined}})+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});},
    startContainer:async({output,onRequest})=>{fs.mkdirSync(output);return {name:'synthetic-short-auth',onRequest,setTaskBudget(){},close(){return 0;},exec(argv){return {status:0,stdout:argv[0]==='/opt/opencode'?'1.18.26':argv[2]?.includes('DatabaseSync')?'{"sessions":[],"messages":[],"tools":[]}':''};}};},
    runTaskImplementation:async session=>{await new Promise(resolve=>setTimeout(resolve,1));await session.onRequest({id:'1',path:'/v1/responses',body:{model:'gpt-5.6-luna',reasoning:{effort:'high'},stream:true}},()=>{},new AbortController().signal);return {exitCode:0,termination:{terminationVerified:true}};},
    stopWorkload:()=>({terminationVerified:true}),captureCandidate:()=>({status:0})});}finally{mock.timers.reset();}
  assert.equal(outcome.status,'finished',JSON.stringify(outcome.pause));assert.equal(syntheticRequests,1);assert.equal(bounded.safeStatus().authRefreshCalls,1);
  const native=fs.readFileSync(new URL('./vendor/native-auth.mjs',import.meta.url));
  const provenance=JSON.parse(fs.readFileSync(new URL('./vendor/native-auth-source.json',import.meta.url)));
  assert.equal(createHash('sha256').update(native).digest('hex'),provenance.generatedSha256);
  return {passed:true,synthetic:true,realInferenceRequests:0,realAuthorizationRequests:0,sourceResolution:true,currentRecordReread:true,expiryAfterReadiness:true,nativeRefreshSingleFlight:true,failedRefreshUnchanged:true,deadlineCancellation:true,readinessBeforePreparation:true,shortBudgetAsyncAuth:true,secretFreeStatus:true,nativeSourceHashVerified:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-auth-'));
  try{console.log(JSON.stringify(await verifyAuth(root)));}finally{fs.rmSync(root,{recursive:true,force:true});}
}
