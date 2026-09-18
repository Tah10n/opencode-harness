import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {mock} from 'node:test';import {runComparison} from './run-comparison-resume.mjs';
const real=path.resolve('local/native-task-luna-high'),f=JSON.parse(fs.readFileSync(real+'/freeze.json'));const reports=[];
for(const mode of ['unattributed-timeout','managed-deadline','late-response','foreign-abort-near-deadline','unknown-execution','unexplained-disconnect','quota','authorization','capture-failure','cleanup-failure']){
 const root=fs.mkdtempSync(real+'/scheduler-fixture-'+mode+'-');for(const name of ['freeze.json','resume-authorization.json','pre-resume-preserved.json'])fs.copyFileSync(real+'/'+name,root+'/'+name);
 let started=[],sessions=[],fetchCalls=0,closed=0,lateForwarded=0,deadlineReached=false,latePacketsAttempted=0;
 mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
 try{
 const startContainer=async({source,output,onRequest})=>{fs.mkdirSync(output);const attempt=f.attempts.find(x=>x.source===source);assert.ok(attempt.slot>=2);started.push(attempt.slot);const session={name:'scripted-'+attempt.slot,output,onRequest,slot:attempt.slot,exec(argv){
 if(argv[0]==='/opt/opencode')return {status:0,stdout:'1.18.26\n'};
 const script=argv[2];if(script.includes('DatabaseSync'))return {status:0,stdout:JSON.stringify({sessions:[],messages:[],tools:[]})};
 if(script.includes("visit('/work/repo')"))return {status:0,stdout:JSON.stringify(f.inputManifests[attempt.task+'-'+attempt.arm])};
 return {status:0,stdout:''};},close(){closed++;return mode==='cleanup-failure'?1:0;}};sessions.push(session);return session;};
 const fetchImpl=async(url,{signal})=>{fetchCalls++;assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');
 if(mode==='quota'||mode==='authorization')return new Response(JSON.stringify({error:{type:mode==='quota'?'usage_limit_reached':'unauthorized',message:'Scripted refusal'}}),{status:mode==='quota'?429:401});
 if(mode==='unexplained-disconnect')throw new TypeError('Scripted transport disconnect');
 if(mode==='late-response')return {status:200,headers:new Headers({'content-type':'text/event-stream'}),body:(async function*(){yield Buffer.from('data: '+JSON.stringify({response:{status:'in_progress'}})+'\n\n');await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));latePacketsAttempted++;yield Buffer.from('data: '+JSON.stringify({response:{status:'completed',usage:{input_tokens:1,output_tokens:1,total_tokens:2}}})+'\n\n');})()};
 if(['managed-deadline','unknown-execution','foreign-abort-near-deadline'].includes(mode))return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 throw Error('Unexpected provider call');};
 const runTaskImplementation=async(session)=>{
 if(session.slot===2&&['managed-deadline','late-response','foreign-abort-near-deadline','unknown-execution','unexplained-disconnect','quota','authorization'].includes(mode)){
 const signal=new AbortController();const pending=session.onRequest({path:'/v1/responses',body:{model:'gpt-5.6-luna',reasoning:{effort:'high'},stream:true,tools:[{}]}},()=>{if(deadlineReached)lateForwarded++;},signal.signal).catch(e=>e);
 for(let i=0;i<8;i++)await Promise.resolve();if(['managed-deadline','late-response','foreign-abort-near-deadline','unknown-execution'].includes(mode)){assert.equal(fetchCalls,1);if(mode==='foreign-abort-near-deadline')signal.abort();deadlineReached=true;mock.timers.tick(900000);}await pending;
 }
 return {exitCode:session.slot===2&&mode==='managed-deadline'?null:0,timedOut:session.slot===2&&['managed-deadline','late-response','foreign-abort-near-deadline','unattributed-timeout','unknown-execution'].includes(mode),elapsedMs:session.slot===2&&mode==='managed-deadline'?900000:1,termination:{terminationVerified:mode!=='unknown-execution'}};};
 let result,error;try{result=await runComparison({root,startContainer,fetchImpl,runTaskImplementation,readAuth:()=>({access:'scripted-not-a-credential',accountId:'scripted-account'}),stopWorkload:()=>({terminationVerified:mode!=='unknown-execution'}),captureCandidate:(s,out)=>{fs.writeFileSync(path.join(out,'candidate.tar'),'scripted immutable result',{flag:'wx'});return {status:mode==='capture-failure'?1:0};}});}catch(e){error=e.message;}
 assert.deepEqual(started,['managed-deadline','late-response'].includes(mode)?[2,3,4]:[2]);assert.equal(lateForwarded,0);assert.equal(closed,started.length);
 if(mode==='late-response')assert.equal(latePacketsAttempted,1);
 if(['managed-deadline','late-response'].includes(mode)){assert.equal(result.status,'finished');const facts=JSON.parse(fs.readFileSync(root+'/runs/legacy-runtime-reload-H/stop-verification.json'));assert.ok(facts.ownTaskDeadlineTriggered&&facts.terminationVerified&&facts.captureSaved&&facts.relayRemoved&&facts.forwardingClosed);assert.equal(facts.activeProviderHandlers,0);}
 else assert.ok(result?.status==='paused'||error);
 reports.push({mode,startedSlots:started,scriptedProviderRequests:fetchCalls,realProviderRequests:0,status:result?.status??'thrown-stop',error:error??null,lateResponsesForwarded:lateForwarded,latePacketsAttempted,closedSessions:closed});
 }finally{mock.timers.reset();}
}
fs.writeFileSync(real+'/resume-scheduler-fixture.json',JSON.stringify({passed:true,scenarios:reports},null,2)+'\n');console.log(JSON.stringify({passed:true,scenarios:reports},null,2));
