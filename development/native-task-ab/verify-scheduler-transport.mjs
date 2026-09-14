// Real loopback transport; scripted responses only. No real provider or auth file.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runComparison as currentRunComparison} from './run-comparison.mjs';
import {startContainer as installedContainer} from './container-session.mjs';
import {captureCandidate as installedCapture} from './capture-candidate.mjs';
import {stopWorkload as installedStop} from '../native-task-utility/container/stop-workload.mjs';
import {runNativePhase} from '../native-task-abc/native-run.mjs';
const root=path.resolve(process.env.SCHEDULER_TRANSPORT_OUTPUT??'local/native-task-ab/transport-boundary');
if(fs.existsSync(root))throw Error('Keep previous transport evidence; choose a fresh output directory');
fs.mkdirSync(root,{recursive:true});
let runComparison=currentRunComparison;
if(process.env.SCHEDULER_VERIFY_BASELINE==='1'){
 const old=execFileSync('git',['show','65143259aedbc58c064a6b8b0db7ce34c5f671d8:development/native-task-ab/run-comparison.mjs'],{encoding:'utf8'}).replace("'./native-run.mjs'",JSON.stringify(new URL('./native-run.mjs',import.meta.url).href));
 fs.writeFileSync(root+'/baseline.mjs',old);runComparison=(await import(new URL('file://'+root+'/baseline.mjs'))).runComparison;
}
const fixtureRoot=path.resolve('local/native-sensitivity/usage-20260914');
const frozen=JSON.parse(fs.readFileSync(fixtureRoot+'/freeze.json'));
const body={model:'gpt-5.6-luna',reasoning:{effort:'high'},stream:true,tools:[{name:'fixture',type:'function',parameters:{type:'object',properties:{}}}],input:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async test=>{const deadline=Date.now()+5000;while(!test()){if(Date.now()>deadline)throw Error('Fixture condition timed out');await sleep(5);}};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
const close=async server=>{server.closeAllConnections();await new Promise(r=>server.close(r));};
const event=(type,id,status,extra={})=>'data: '+JSON.stringify({type,response:{id,status,...extra}})+'\n\n';
const completed=(id='resp_local')=>event('response.created',id,'in_progress')+event('response.completed',id,'completed',{usage:{input_tokens:2,output_tokens:3,total_tokens:5}});
function nativeResponse(index,call){
 const id='resp_native_'+index,item=call?{id:'fc_'+index,type:'function_call',call_id:'call_'+index,name:'bash',arguments:JSON.stringify({command:'node --check value.mjs',description:'Check preserved partial source'}),status:'completed'}:{id:'msg_'+index,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Scripted local task completed.',annotations:[]}]};
 const base={id,object:'response',created_at:1,model:body.model,status:'in_progress',output:[]};
 const events=[{type:'response.created',response:base},{type:'response.output_item.added',output_index:0,item:call?{...item,arguments:'',status:'in_progress'}:{...item,status:'in_progress',content:[]}}];
 if(call)events.push({type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta:item.arguments});else events.push({type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:item.content[0].text});
 events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{...base,status:'completed',output:[item],usage:{input_tokens:2,output_tokens:3,total_tokens:5}}});return events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('');
}
const all=[];
const modes=process.env.SCHEDULER_VERIFY_BASELINE==='1'?['baseline-replay']:process.env.SCHEDULER_INSTALLED_ONLY==='1'?['installed-503','installed-delayed-503','installed-success','installed-cancel','installed-hard-deadline']:[
 '503-retry','delayed-503','oversized-503','200-disconnect','completed-delivery-error','previous-completed-new-unknown',
 '401','403','429','queued-title','already-forwarded','late-completed-after-pause','successful-duplicate','cancelled-before-fetch','pause-during-auth','cancelled-in-flight',
 ...(process.env.SCHEDULER_SKIP_INSTALLED==='1'?[]:['installed-503','installed-delayed-503','installed-success','installed-cancel','installed-hard-deadline'])];
for(const mode of modes){
 const dir=root+'/'+mode;fs.mkdirSync(dir);const installed=mode.startsWith('installed-'),delayed=mode.includes('delayed');
 const source=dir+'/input';fs.mkdirSync(source);fs.writeFileSync(source+'/TASK.md','Inspect the unfinished change and finish the task.');fs.writeFileSync(source+'/value.mjs','export const value = 1;\n');
 const manifest=Object.fromEntries(['TASK.md','value.mjs'].map(n=>[n,{sha256:createHash('sha256').update(fs.readFileSync(source+'/'+n)).digest('hex'),executable:false}]));
 const attempts=[1,2].map(slot=>({slot,task:'case-'+slot,arm:'H1',source:slot===1?source:dir+'/input-2'}));fs.cpSync(source,attempts[1].source,{recursive:true});
 const f={experimentKind:'sensitivity-usage',model:'openai/gpt-5.6-luna',variant:'high',strategy:'direct',budgetMs:900000,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,preflightPassed:true,files:{},attempts,inputManifests:{'case-1-H1':manifest,'case-2-H1':manifest},toolchain:frozen.toolchain,template:frozen.template,config:frozen.config};
 fs.writeFileSync(dir+'/freeze.json',JSON.stringify(f));
 let hits=0,started=[],stops=0,handler,installedSession,upstreamHeaders=false,pausedBeforeEnd=false,lateAttempt=null,requestID=0,authCalls=0,delayedStop;const nativeCancel=new AbortController();
 const pending=new Set(),controllers=new Set(),seen=[];
 const upstream=http.createServer(async(req,res)=>{
  let text='';for await(const c of req)text+=c;const upstreamIndex=++hits;seen.push({index:upstreamIndex,sha256:createHash('sha256').update(text).digest('hex')});
  if(mode==='installed-success'){res.writeHead(200,{'content-type':'text/event-stream'});res.end(nativeResponse(hits,hits%2===1));return;}
  if(['installed-cancel','installed-hard-deadline'].includes(mode)){res.writeHead(200,{'content-type':'text/event-stream'});res.write(event('response.created','resp_native_wait','in_progress'));if(mode==='installed-cancel')setTimeout(()=>nativeCancel.abort(),100);return;}
  if(mode==='successful-duplicate'||mode==='completed-delivery-error'||mode==='previous-completed-new-unknown'&&hits===1){res.writeHead(200,{'content-type':'text/event-stream'});res.end(completed('resp_'+hits));return;}
  if(mode==='200-disconnect'||mode==='cancelled-in-flight'||mode==='already-forwarded'&&hits===2){res.writeHead(200,{'content-type':'text/event-stream'});res.write(event('response.created','resp_unknown','in_progress'));if(mode==='200-disconnect')res.end();return;}
  if(mode==='late-completed-after-pause'&&hits===2){await until(()=>fs.existsSync(dir+'/scheduling-paused.json'));res.writeHead(200,{'content-type':'text/event-stream'});res.end(completed('resp_late'));return;}
  if(['already-forwarded','late-completed-after-pause'].includes(mode)&&hits===1)await until(()=>hits===2);
  const status=['401','403','429'].includes(mode)?Number(mode):503;
  res.writeHead(status,{'content-type':'application/json','x-request-id':'local-'+upstreamIndex});res.flushHeaders();upstreamHeaders=true;
  if(delayed||mode==='late-completed-after-pause'){res.write('upstream reset before headers; partial body');return;}
  if(mode==='oversized-503'){res.end('x'.repeat(20000));return;}
  res.end(status===503?'upstream connect error or disconnect/reset before headers. reset reason: connection termination':JSON.stringify({error:{type:status===429?'usage_limit_reached':'unauthorized',message:'Scripted refusal'}}));
 });
 const upstreamURL=await listen(upstream);
 const downstream=http.createServer(async(req,res)=>{
  let text='';for await(const c of req)text+=c;
  const controller=new AbortController();controllers.add(controller);
  res.once('close',()=>{if(!res.writableEnded)controller.abort();});
  const work=Promise.resolve().then(()=>handler({id:'probe-'+(++requestID),path:'/v1/responses',body:JSON.parse(text)},frame=>{
   if(mode==='completed-delivery-error'&&frame.type==='chunk')throw new Error('Scripted client delivery failure after observed terminal');
   if(frame.type==='headers')res.writeHead(frame.status,{'content-type':frame.contentType});
   if(frame.type==='chunk')res.write(Buffer.from(frame.data,'base64'));
   if(frame.type==='end')res.end();
  },controller.signal)).catch(()=>res.destroy()).finally(()=>{pending.delete(work);controllers.delete(controller);});pending.add(work);
 });
 const downstreamURL=await listen(downstream);
 const request=async value=>{try{const r=await fetch(downstreamURL,{method:'POST',body:JSON.stringify(value??body),signal:AbortSignal.timeout(6000)});return {status:r.status,text:await r.text()};}catch(e){return {error:e.name};}};
 const makeLate=async()=>{
  await until(()=>fs.existsSync(dir+'/scheduling-paused.json'));
  pausedBeforeEnd=delayed&&upstreamHeaders;
  // A fresh HTTP client deliberately retries and submits helper work despite the pause.
  const before=hits;lateAttempt=await request();await request({...body,tools:[]});assert.equal(hits,before);
 };
 const late=['503-retry','delayed-503','oversized-503','queued-title','installed-503','installed-delayed-503'].includes(mode)?makeLate():null;
 let outcome;
 try{
  outcome=await runComparison({root:dir,readAuth:()=>{authCalls++;if(mode==='pause-during-auth')void handler({path:'/v1/responses',body:{...body,model:'forbidden',tools:[]}},()=>{},new AbortController().signal);if(mode==='cancelled-before-fetch')for(const c of controllers)c.abort();return {access:'scripted-not-a-credential',accountId:'fixture'};},
   fetchImpl:async(url,options)=>{assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');return fetch(upstreamURL,options);},
   startContainer:async options=>{
    handler=options.onRequest;started.push(started.length+1);
    if(installed){installedSession=await installedContainer(options);return installedSession;}
    return {setTaskBudget(){},close(){return 0;},exec(argv){if(argv[0]==='/opt/opencode')return {status:0,stdout:'1.18.26'};return {status:0,stdout:argv[2].includes('DatabaseSync')?JSON.stringify({sessions:[],messages:[],tools:[]}):argv[2].includes("visit('/work/repo')")?JSON.stringify(manifest):''};}};} ,
   stopWorkload:s=>{stops++;if(installed&&mode.includes('503')){
    // Delay fixture process cleanup to expose the native client's own retry.
    // Admission must hold even when native process shutdown is slow.
    delayedStop??=setTimeout(()=>installedStop(s),5000);return {terminationVerified:false,fixtureDelayedCleanup:true};
   }return installed?installedStop(s):{terminationVerified:true};},
   captureCandidate:(s,out)=>{if(installed)return installedCapture(s,out);fs.writeFileSync(out+'/candidate.tar','preserved fixture partial output');return {status:0};},
   runTaskImplementation:async(s,options)=>{
    if(installed){
     assert.equal(s.exec(['node','-e',"require('fs').writeFileSync('value.mjs','export const value = 2;\\n')"]).status,0);
     const result=await runNativePhase(s,{...options,enabled:false,signal:nativeCancel.signal,limitMs:mode==='installed-hard-deadline'?2500:10000,deadline:Date.now()+(mode==='installed-hard-deadline'?2500:10000),stopWorkload:installedStop},{spawnProcess:(command,args,settings)=>{
      const at=args.indexOf('--format');args.splice(at,0,'--title','Local transport fixture');return spawn(command,args,settings);
     }});
     clearTimeout(delayedStop);return {...result,nativeCompleted:result.exitCode===0&&result.events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop')};
    }
    if(started.length===1){
     if(mode==='baseline-replay'){await request();await request();}
     else if(mode==='previous-completed-new-unknown'){assert.equal((await request()).status,200);await request();}
     else if(mode==='successful-duplicate'){assert.equal((await request()).status,200);assert.equal((await request()).status,200);}
     else if(['already-forwarded','late-completed-after-pause'].includes(mode)){await Promise.all([request(),request({...body,tools:[]})]);}
     else if(mode==='cancelled-in-flight'){const r=request();await until(()=>hits===1);for(const c of controllers)c.abort();await r;}
     else await request();
     if(late)await late;
    }
    return {exitCode:0,nativeCompleted:mode==='successful-duplicate',termination:{terminationVerified:true},elapsedMs:1};
   }});
  if(late)await late;
  const run=dir+'/runs/case-1-H1',records=JSON.parse(fs.readFileSync(run+'/provider-metadata.json')),stop=JSON.parse(fs.readFileSync(run+'/stop-verification.json'));
  const expected=['cancelled-before-fetch','pause-during-auth'].includes(mode)?0:mode==='installed-success'?4:['successful-duplicate','previous-completed-new-unknown','already-forwarded','late-completed-after-pause'].includes(mode)?2:1;
  assert.equal(hits,expected,'Actual upstream HTTP request count');
  const success=['successful-duplicate','completed-delivery-error','cancelled-before-fetch','installed-success'].includes(mode);
  assert.deepEqual(started,success?[1,2]:[1]);
  assert.equal(outcome.status,success?'finished':'paused');
  assert.ok(stop.terminationVerified&&stop.captureSaved&&stop.relayRemoved&&stop.activeProviderHandlers===0);
  if(late){assert.equal(lateAttempt.status,409);assert.ok(records.some(r=>!r.forwarded&&r.notForwardedReason==='series-paused'));}
  if(records[0]?.status===503){assert.equal(records[0].upstreamRequestId,'local-1');assert.equal(Buffer.from(records[0].errorBodyBase64,'base64').toString(),records[0].errorBody);assert.equal(records[0].usage,null);assert.equal(stop.providerServerStateMayRemainUnknown,true);}
  if(delayed){assert.ok(pausedBeforeEnd);assert.ok(records[0].errorBodyTimedOut);assert.match(records[0].errorBody,/partial body/);}
  if(mode==='oversized-503'){assert.ok(records[0].errorBodyTruncated);assert.equal(Buffer.byteLength(records[0].errorBody),8192);}
  if(mode==='completed-delivery-error'){assert.equal(records[0].usage.total_tokens,5);assert.equal(records[0].serverCompletion,'completed');assert.ok(records[0].transportError);}
  if(mode==='baseline-replay'){await request();await request();}
     else if(mode==='previous-completed-new-unknown'){assert.equal(records[0].usage.total_tokens,5);assert.equal(records[1].usage,null);assert.equal(records[1].serverCompletion,'unknown');}
  if(['401','403','429'].includes(mode)){assert.equal(outcome.pause.kind,mode==='429'?'incomplete_quota':'provider_refusal');assert.equal(records[0].status,Number(mode));assert.equal(records[0].serverCompletion,'known_refusal');assert.equal(stop.providerServerStateMayRemainUnknown,false);}
  if(mode==='late-completed-after-pause'){assert.equal(records[1].serverCompletion,'completed');assert.equal(records[1].usage.total_tokens,5);assert.equal(outcome.status,'paused');}
  if(installed&&mode.includes('503')){assert.ok(records.some(r=>!r.forwarded&&typeof r.relayRequestId==='string'&&/^\d+$/.test(r.relayRequestId)),'Installed native retry must reach launcher');}
  if(installed){assert.equal(fs.readFileSync(run+'/candidate/value.mjs','utf8'),'export const value = 2;\n');const patch=execFileSync('git',['diff','--binary'],{cwd:run+'/candidate',encoding:'utf8'});assert.match(patch,/export const value = 2/);fs.writeFileSync(run+'/partial.patch',patch);}
  if(!success){await assert.rejects(()=>runComparison({root:dir,startContainer:()=>{throw Error('Restart must not start a slot');}}),/no automatic resume/);}
  const allRecords=fs.readdirSync(dir+'/runs').flatMap(n=>JSON.parse(fs.readFileSync(dir+'/runs/'+n+'/provider-metadata.json')));
  const nativeRetries=records.filter(r=>!r.forwarded&&typeof r.relayRequestId==='string'&&/^\d+$/.test(r.relayRequestId));
  if(installed&&mode.includes('503'))for(const r of nativeRetries)assert.equal(fs.readFileSync(run+'/request-'+r.requestIndex+'.json','utf8'),fs.readFileSync(run+'/request-1.json','utf8'),'Native replay body retained unchanged');
  const summary={mode,nativeRetryAttempts:nativeRetries.length,passed:true,upstreamRequests:hits,startedSlots:started,scriptedReportedTokens:allRecords.reduce((n,r)=>n+(r.usage?.total_tokens??0),0),unknownUsageRequests:allRecords.filter(r=>r.forwarded&&!r.usage).length,blockedRequests:records.filter(r=>!r.forwarded).length,pausedBeforeDelayedBodyEnded:pausedBeforeEnd,partialOutputPreserved:stop.captureSaved,localTerminationVerified:stop.terminationVerified,installedOpenCode:installed?'1.18.26':null,pause:outcome.pause,realProviderRequests:0,authCalls,requestIdentities:seen};
  all.push(summary);console.log(JSON.stringify(summary));
 }finally{clearTimeout(delayedStop);await close(downstream);await close(upstream);await Promise.allSettled([...pending]);}
}
fs.writeFileSync(root+'/results.json',JSON.stringify({passed:true,realProviderRequests:0,scenarios:all},null,2)+'\n');
