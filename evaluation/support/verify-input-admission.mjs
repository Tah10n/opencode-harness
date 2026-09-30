import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {runComparison} from './scheduler.mjs';import {verifyReadyInputs} from '../polybench/input-preflight.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'input-admission-'));
try{
 const source=root+'/source';fs.mkdirSync(source);fs.writeFileSync(source+'/TASK.md','Synthetic task');
 const f={experimentKind:'fixture',model:'openai/scripted',variant:'high',preflightPassed:true,budgetMs:10000,files:{},attempts:[{slot:1,task:'task',arm:'P',source}],inputManifests:{'task-P':{tail:{sha256:'expected',executable:false}}}};
 for(const mode of ['truncated','corrupt','exit','cancelled','limit','changed-tail','deleted-tail','added-tail']){
  const out=root+'/'+mode;fs.mkdirSync(out);fs.writeFileSync(out+'/freeze.json',JSON.stringify(f));let models=0,auth=0,providers=0,closed=0;
  const result=await runComparison({root:out,startContainer:async()=>({exec:()=>({status:0}),close:()=>{closed++;return 0;}}),readInput:async()=>{
   if(!mode.endsWith('tail'))throw Error('Input '+mode);
   return {manifest:mode==='deleted-tail'?{}:mode==='added-tail'?{tail:f.inputManifests['task-P'].tail,zzz:{sha256:'extra',executable:false}}:{tail:{sha256:'changed',executable:false}},receipt:{fixture:true}};
  },runTaskImplementation:()=>{models++;throw Error('Model prohibited');},readAuth:()=>{auth++;},fetchImpl:()=>{providers++;},stopWorkload:()=>({terminationVerified:true}),captureCandidate:()=>({status:0})});
  assert.equal(result.status,'paused');assert.equal(closed,1);assert.equal(models+auth+providers,0);assert.ok(!fs.existsSync(out+'/runs/task-P/input-verification.json'));
 }
 const sources=['first','second','third'];const attempts=sources.flatMap((task,i)=>['P','C','T'].map(arm=>({task,arm,source:'/prepared/'+task,preparationStatus:'ready',slot:i*3+1}))).concat({task:'bad',source:'/prepared/bad',preparationStatus:'preparation_error'});
 const frozen={attempts,environments:Object.fromEntries(sources.map(n=>['/prepared/'+n,{image:n}])),runtimeManifests:Object.fromEntries(sources.map(n=>['/prepared/'+n,{}])),templates:{T:'/task-bundle'}};
 fs.mkdirSync(root+'/all-ready');fs.mkdirSync(root+'/failed-ready');
 const seen=[];await verifyReadyInputs(frozen,root+'/all-ready',{verifyInput:async a=>{seen.push(a.source);assert.equal(a.template,'/task-bundle');}});
 assert.deepEqual(seen,sources.map(n=>'/prepared/'+n));
 let admitted=false;await assert.rejects((async()=>{await verifyReadyInputs(frozen,root+'/failed-ready',{verifyInput:async a=>{if(a.source.endsWith('second'))throw Error('Task input rejected');}});admitted=true;})(),/Task input rejected/);assert.equal(admitted,false);
 console.log(JSON.stringify({passed:true,failuresBeforeModel:8,allReadyTasks:seen.length,realProviderRequests:0}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
