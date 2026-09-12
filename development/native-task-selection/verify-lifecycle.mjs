// Process/stream regressions, using the existing local scripted provider. No model evaluation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {pathToFileURL} from 'node:url';
import {runSelector} from './phases.mjs';
import {runNativePhase} from '../native-task-abc/native-run.mjs';
const phaseImpl=process.env.NATIVE_LIFECYCLE_BASELINE?(await import(pathToFileURL(process.env.NATIVE_LIFECYCLE_BASELINE))).runNativePhase:runNativePhase;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'selection-lifecycle-'));
const provider=spawn(process.execPath,['scripts/verify-native-task-fixture.mjs'],{env:{PATH:process.env.PATH,NATIVE_TASK_FIXTURE_PROVIDER_ONLY:'1',NATIVE_SELECTION_LIFECYCLE:'1'},stdio:['ignore','pipe','pipe']});
let providerError='';provider.stderr.on('data',x=>providerError+=x);
const providerClosed=new Promise(r=>provider.once('close',r));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// This child consumes real HTTP and writes native JSON lines in a controlled lifecycle order.
const childScript=String.raw`
 const fs=require('node:fs');const [url,out,mode,finishMs,exitMs]=process.argv.slice(1);
 const mark=name=>fs.writeFileSync(out+'/'+name,String(Date.now()));
 const emit=e=>process.stdout.write(JSON.stringify({sessionID:'same',...e})+'\n');
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 (async()=>{
  const r=await fetch(url+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:mode}]})});
  let body='',partialEmitted=false;for await(const chunk of r.body){body+=Buffer.from(chunk).toString();if(mode.includes('partial')&&!partialEmitted&&body.includes('\n\n')){
   partialEmitted=true;
   emit({type:'step_finish',part:{reason:'tool-calls',tokens:{input:7,output:3}}});
   emit({type:'text',part:{text:JSON.parse(body.split('\n')[0].slice(6)).choices[0].delta.content}});mark('partial');
  }}
  mark('provider-end');
  const packet=body.split('\n').find(x=>x.startsWith('data: {'));
  emit({type:'text',part:{text:JSON.parse(packet.slice(6)).choices[0].delta.content}});mark('text');
  await sleep(+finishMs);
  emit({type:'step_finish',part:{reason:'stop',tokens:{input:11,output:5}}});mark('step-finish');
  if(mode==='abort-error')emit({type:'error',error:{name:'AbortError',message:'Original native abort'}});
  if(mode==='malformed')process.stdout.write('not-json\n');
  await sleep(+exitMs);process.stderr.write('fixture stderr retained\n');mark('exit');
 })().catch(e=>{process.stderr.write(e.stack);process.exitCode=1;});
`;
const children=[];let requests=0;
try{
 const lines=readline.createInterface({input:provider.stdout});
 const info=await new Promise((resolve,reject)=>{lines.once('line',x=>resolve(JSON.parse(x)));provider.once('error',reject);provider.once('exit',code=>reject(Error('Fixture '+code+providerError)));});
 const cases=[
  {name:'decision-before-boundary',finish:260,exit:80,decision:'X'},
  {name:'response-crossing',responseDelay:240,finish:100,exit:60,decision:'X'},
  {name:'no-decision',finish:260,exit:40,decision:'X',phases:2},
  {name:'partial-hard-deadline',partial:true,limit:500},
  {name:'callback-delayed-success',finish:260,exit:20,callback:'delayed',decision:'X'},
  {name:'step-finish-before-hard-deadline',finish:20,exit:900,limit:500},
  {name:'callback-never',finish:900,exit:20,limit:500,callback:'never'},
  {name:'callback-never-after-close',finish:260,exit:20,limit:500,callback:'never'},
  {name:'callback-late-error',finish:900,exit:20,limit:500,callback:'late-error'},
  {name:'callback-error',finish:900,exit:20,callback:'error'},
  {name:'cancel-pending',finish:900,exit:20,cancel:true,callback:'never'},
  {name:'pre-cancel',cancel:'before'},
  {name:'expired-before-spawn',expired:true},
  {name:'unknown-workload',finish:260,exit:40,unknown:true},
  {name:'active-tool',finish:260,exit:40,activeTool:true},
  {name:'abort-error',finish:260,exit:40},
  {name:'malformed',finish:260,exit:40},
  {name:'no-research-boundary',finish:30,exit:20,decision:'X',noBoundary:true},
  {name:'cleanup-after-deadline',finish:20,exit:20,limit:500,cleanup:600,decision:'X',noBoundary:true},
 ];
 for(const c of cases){
  const output=path.join(root,c.name);fs.mkdirSync(output);let calls=0,child,activeTool,callbackSettledAt=null,boundaryAt=null;
  if(c.activeTool){activeTool=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});children.push(activeTool);}
  const abort=new AbortController();if(c.cancel==='before')abort.abort(new Error('User cancellation'));
  let cancelTimer;
  const result=await runSelector({output},{config:{},deadline:c.expired?Date.now()-1:undefined,limitMs:c.limit??1500,researchMs:c.noBoundary?undefined:180,signal:abort.signal,canFinalize:()=>!abort.signal.aborted,
   researchStopped:async()=>{
    boundaryAt=Date.now();
    if(c.cancel)cancelTimer=setTimeout(()=>abort.abort(new Error('User cancellation')),40);
    if(c.callback==='delayed')await sleep(350);
    if(c.callback==='never')await new Promise(()=>{});
    if(c.callback==='late-error'){await sleep(700);throw Error('Late callback failure');}
    if(c.callback==='error')throw Error('Boundary failure');
    callbackSettledAt=Date.now();
   },
   stopWorkload:async()=>{
    if(c.cleanup){abort.abort(new Error('Late cancellation during cleanup'));await sleep(c.cleanup);}
    const killed=[];if(activeTool){process.kill(activeTool.pid,0);const closed=new Promise(r=>activeTool.once('close',r));activeTool.kill('SIGKILL');await closed;killed.push(activeTool.pid);}
    if(c.unknown)throw Error('Scripted unavailable termination evidence');
    return{terminationVerified:true,killed};
   },
  },{phase:async(session,options)=>{
   calls++;
   // Preserve an ordinary launcher call with no optional boundary at all.
   if(c.noBoundary){delete options.researchMs;delete options.researchStopped;}
   if(process.env.NATIVE_LIFECYCLE_BASELINE){options.onTimeout=options.researchStopped;options.limitMs=180;options.stopWorkload=()=>({terminationVerified:true,killed:[]});}
   return phaseImpl(session,options,{spawnProcess:()=>{
    requests++;
    // Delay fetch inside the child to put HTTP completion on either side of research.
    const script=c.responseDelay?childScript.replace('(async()=>{','(async()=>{await sleep('+c.responseDelay+');'):childScript;
    child=spawn(process.execPath,['-e',script,info.fixtureURL,session.output,calls===2?'decision':c.partial?'partial':c.name,String(calls===2?20:c.finish??30),String(c.exit??20)],{stdio:['ignore','pipe','pipe']});children.push(child);
    return child;
   }});
  }});
  clearTimeout(cancelTimer);
  assert.equal(result.decision,c.decision??null,c.name+': '+JSON.stringify(result));
  assert.equal(calls,c.phases??1,c.name+' phase count');
  if(child){assert.ok(child.exitCode!==null||child.signalCode!==null,c.name+' process closed');assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});}
  if(activeTool)assert.throws(()=>process.kill(activeTool.pid,0),{code:'ESRCH'});
  const firstDir=path.join(output,'research'),saved=JSON.parse(fs.readFileSync(path.join(firstDir,'finished.json')));
  assert.deepEqual(saved.stopReason,result.phaseFacts[0].stopReason);
  if(c.name==='decision-before-boundary'){
   assert.ok(Number(fs.readFileSync(path.join(firstDir,'provider-end')))<boundaryAt);
   assert.ok(Number(fs.readFileSync(path.join(firstDir,'text')))<boundaryAt);
   assert.ok(Number(fs.readFileSync(path.join(firstDir,'step-finish')))>callbackSettledAt);
   assert.ok(Number(fs.readFileSync(path.join(firstDir,'exit')))>callbackSettledAt);
   assert.equal(result.phaseCount,1);
  }
  if(c.name==='response-crossing')assert.ok(Number(fs.readFileSync(path.join(firstDir,'provider-end')))>boundaryAt);
  if(c.partial){
   assert.match(result.answer,/DECISION: X/);assert.equal(result.timedOut,true);
   assert.deepEqual(result.events[0].part.tokens,{input:7,output:3});
   assert.equal(result.events.at(-1).part.tokens,undefined,'Missing final usage is not zero');
   assert.ok(!result.events.some(e=>e.part?.reason==='stop'));
   assert.match(fs.readFileSync(path.join(firstDir,'events.jsonl'),'utf8'),/DECISION/);
  }
  if(c.callback==='never'||c.callback==='late-error'||c.partial){
   assert.equal(result.stopReason.kind,c.cancel?'cancelled':'hard_deadline');
   assert.equal(result.timedOut,!c.cancel);assert.ok(result.elapsedMs<(c.limit??1500)+500);
  }
  if(c.name==='step-finish-before-hard-deadline'){assert.ok(result.events.some(e=>e.part?.reason==='stop'));assert.equal(result.stopReason.kind,'hard_deadline');assert.equal(result.signal,'SIGKILL');}
  if(c.callback==='delayed')assert.equal(result.researchBoundary,'settled');
  if(c.callback==='error'){assert.equal(result.stopReason.kind,'research_boundary_error');assert.equal(result.stopReason.message,'Boundary failure');assert.equal(result.timedOut,false);}
  if(c.cancel){assert.equal(result.stopReason.kind,'cancelled');assert.equal(result.stopReason.message,'User cancellation');}
  if(c.cancel==='before'||c.expired)assert.equal(child,undefined);
  if(c.expired){assert.equal(result.timedOut,true);assert.equal(result.stopReason.kind,'hard_deadline');}
  if(c.unknown){assert.equal(result.termination.terminationVerified,false);assert.match(result.termination.error,/unavailable termination evidence/);}
  if(c.name==='cleanup-after-deadline'){assert.equal(result.timedOut,false);assert.ok(result.cleanupElapsedMs>=600);}
  if(c.callback==='late-error'){
   const frozen=JSON.stringify(result),disk=fs.readFileSync(path.join(firstDir,'finished.json'),'utf8');await sleep(800);
   abort.abort(new Error('Late user event'));assert.equal(JSON.stringify(result),frozen);assert.equal(fs.readFileSync(path.join(firstDir,'finished.json'),'utf8'),disk);
  }
  console.log(JSON.stringify({case:c.name,passed:true,phases:calls,decision:result.decision,stopReason:result.stopReason,elapsedMs:result.elapsedMs}));
 }
 const received=fs.readFileSync(path.join(info.project,'lifecycle-requests.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(received.length,requests,'Every spawned consumer made exactly one scripted request');
 console.log(JSON.stringify({passed:true,processCases:cases.length,scriptedRequests:requests,realProviderCalls:0,modelTaskRuns:0}));
}finally{
 for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
 provider.kill('SIGTERM');await providerClosed;
 fs.rmSync(root,{recursive:true,force:true});
}
