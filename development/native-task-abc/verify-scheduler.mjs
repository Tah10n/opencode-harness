import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {runComparison} from './run-comparison.mjs';
for(const mode of ['complete','quota','unknown']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'abc-scheduler-'));let starts=0,forwards=0,closes=0;
 try{
  const source=path.join(root,'source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'TASK.md'),'Public scripted task');
  const attempts=Array.from({length:4},(_,i)=>['A','B','C'].map((arm,j)=>({task:'t'+i,arm,slot:i*3+j+1,source}))).flat();
  fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify({files:{},attempts,model:'openai/gpt-5.6-luna',variant:'low',budgetMs:900000,preflightPassed:true,config:{},continuation:'fixed continuation'}));
  const result=await runComparison({root,
   startContainer:async({output,onRequest})=>{starts++;fs.mkdirSync(output);return{output,onRequest,exec:args=>({status:0,stdout:args[0]==='/opt/opencode'?'1.18.26':args.join(' ').includes('DatabaseSync')?JSON.stringify({sessions:[],tools:[],messages:[]}):'',stderr:''}),close:()=>{closes++;return 0;}};},
   captureCandidate:(session,out)=>{fs.writeFileSync(path.join(out,'candidate.tar'),'scripted');return{status:0};},
   stopWorkload:()=>({terminationVerified:true}),readAuth:()=>({access:'scripted',accountId:'scripted'}),
   fetchImpl:async()=>{forwards++;if(mode==='unknown')throw Error('Scripted uncertain send');if(mode==='quota')return new Response(JSON.stringify({error:{type:'usage_limit_reached',message:'Scripted quota refusal'}}),{status:429});return new Response('data: '+JSON.stringify({response:{status:'completed',id:'scripted',usage:{input_tokens:1,output_tokens:1,total_tokens:2}}})+'\n\n',{status:200,headers:{'content-type':'text/event-stream'}});},
   runTaskImplementation:async(session,options)=>{await session.onRequest({path:'/v1/responses',body:{model:'gpt-5.6-luna',stream:true,reasoning:{effort:'low'}}},()=>{},new AbortController().signal).catch(()=>{});return{exitCode:mode==='complete'?0:1,termination:{terminationVerified:true},timedOut:false,elapsedMs:1,parseErrors:0,phaseCount:options.arm==='B'?2:1};}
  });
  assert.equal(starts,mode==='complete'?12:1);assert.equal(forwards,starts);assert.equal(closes,starts);
  assert.equal(result.status,mode==='complete'?'finished':'paused');
  if(mode!=='complete'){assert.equal(result.pause.kind,mode==='quota'?'incomplete_quota':'unknown_submission');assert.equal(fs.readdirSync(path.join(root,'runs')).length,1);}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
console.log(JSON.stringify({passed:true,fixedTwelveSlots:true,quotaStopsScheduling:true,unknownSubmissionStopsScheduling:true,realProviderRequests:0}));
