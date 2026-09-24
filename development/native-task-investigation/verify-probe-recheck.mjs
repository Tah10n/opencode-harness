import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {availabilityObserver,availabilityAdmission,availabilityProbe,recheckSavedAvailability} from './availability-probe.mjs';
const root=path.resolve(process.argv[2]??'local/native-investigation-comparison');
const event=(type,response)=>({type,response}),created=event('response.created',{id:'r',status:'in_progress'});
const item=(id,text)=>({id,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]});
const added=(i,index=0)=>({type:'response.output_item.added',output_index:index,item:{...i,status:'in_progress',content:[]}});
const done=(i,index=0)=>({type:'response.output_item.done',output_index:index,item:i});
const completed=(output=[])=>event('response.completed',{id:'r',status:'completed',output});
const a=item('a','Привет'),b=item('b',' мир');
const serialize=events=>Buffer.from(events.map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join(''));
const cases=[
 ['item-empty-terminal',[created,added(a),done(a),completed()],true,'Привет'],
 ['terminal-only',[created,completed([a])],true,'Привет'],
 ['deduplicated',[created,added(a),done(a),completed([a])],true,'Привет'],
 ['several-items',[created,added(a),done(a),added(b,1),done(b,1),completed()],true,'Привет мир'],
 ['delta-only',[created,added(a),{type:'response.output_text.delta',item_id:'a',output_index:0,delta:'Hi'}],false],
 ['item-without-terminal',[created,added(a),done(a)],false],
 ...['failed','incomplete'].map(status=>[status,[created,added(a),done(a),event('response.'+status,{id:'r',status,output:[]})],false]),
 ['protocol-error',[created,added(a),done(a),{type:'error',code:'server_error'},completed()],false],
 ['foreign-item',[created,added(a),done(b),completed()],false],
 ['foreign-response',[created,added(a),{...done(a),response_id:'other'},completed()],false],
 ['conflicting-text',[created,added(a),done(a),completed([item('a','Other')])],false],
 ['conflicting-index',[created,added(a),done(a,1),completed()],false],
 ['unbound-item',[created,done(a),completed()],false],
 ['delivery-error',[created,added(a),done(a),completed()],false,undefined,{error:{name:'AbortError'}}],
 ['empty',[created,completed()],false],
 ['reasoning-not-answer',[created,completed([{id:'reason',type:'reasoning',content:[{type:'output_text',text:'Hidden'}]}])],false],
 ['tool-not-answer',[created,completed([{id:'tool',type:'function_call',arguments:'Answer'}])],false],
 ['not-normal-eof',[created,added(a),done(a),completed()],false,undefined,{streamEnded:false}],
 ['handler-unfinished',[created,added(a),done(a),completed()],false,undefined,{handlerFinished:false}],
];
const results=[];
for(const [name,events,want,text,overrides]of cases){
 const record={status:200,streamEnded:true,handlerFinished:true,connectionClosed:true,activeProviderHandlers:0,...overrides};
 const obs=availabilityObserver(record),bytes=serialize(events);for(let i=0;i<bytes.length;i++)obs.push(bytes.subarray(i,i+1));obs.end();record.text=obs.text();assert.equal(availabilityAdmission(record),want,name);if(text)assert.equal(record.text,text,name);results.push({name,passed:true});
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'probe-recheck-'));
const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Real fetch prohibited in offline test');};
try{
 const saved=fs.readFileSync(root+'/continuation-3-9/availability.sse');
 const oldSource=execFileSync('git',['show','0d010ef08233613518a2352c085444ed7b717f39:development/native-task-investigation/availability-probe.mjs'],{encoding:'utf8'}).replace("'../native-task-ab/run-comparison.mjs'",JSON.stringify(new URL('../native-task-ab/run-comparison.mjs',import.meta.url).href));
 const old=await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'));
 let replayCalls=0;
 for(const [name,probe,want]of [['original',old.availabilityProbe,false],['corrected',availabilityProbe,true]]){
  const out=temp+'/'+name;fs.mkdirSync(out);const result=await probe({out,readAuth:()=>({access:'fixture',accountId:'fixture'}),fetchImpl:async()=>{replayCalls++;return new Response(saved,{status:200});}});assert.equal(result.success,want,name);if(want){assert.equal(result.text,'Okay');assert.equal(result.reason,undefined);}
 }
 const rechecked=recheckSavedAvailability(root);assert.equal(rechecked.success,true);assert.equal(rechecked.usage.total_tokens,47);assert.equal(rechecked.newProviderRequests,0);
 console.log(JSON.stringify({passed:true,realProviderRequests:0,syntheticReplayCalls:replayCalls,originalCodeReproducesFalsePause:true,correctedCodeAcceptsSameBytes:true,cases:results,savedRecheck:rechecked},null,2));
}finally{globalThis.fetch=originalFetch;fs.rmSync(temp,{recursive:true,force:true});}
