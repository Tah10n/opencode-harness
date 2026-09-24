// One neutral request through the series route and response lifecycle observer.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {responseObserver,knownResponseTerminal} from '../native-task-ab/run-comparison.mjs';
export async function availabilityProbe({out,readAuth,fetchImpl=fetch,limitMs=120000}) {
 const record={kind:'availability',model:'gpt-5.6-luna',effort:'high',forwarded:false,usage:null,retryCount:0,success:false,at:new Date().toISOString()};
 const file=out+'/availability.json';fs.writeFileSync(file,JSON.stringify(record),{flag:'wx',mode:0o600});
 const save=()=>fs.writeFileSync(file,JSON.stringify(record,null,2));
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(new Error('Availability deadline')),limitMs);
 let response;
 try {
  const auth=readAuth();
  // The same adapter fields as recorded series requests; no output cap, tools or session.
  const body=JSON.stringify({model:'gpt-5.6-luna',instructions:'Answer briefly.',input:[{role:'user',content:[{type:'input_text',text:'Reply with one word.'}]}],store:false,include:['reasoning.encrypted_content'],reasoning:{effort:'high',summary:'auto'},stream:true});
  record.forwarded=true;record.forwardedAt=new Date().toISOString();save();
  response=await fetchImpl('https://chatgpt.com/backend-api/codex/responses',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${auth.access}`,'ChatGPT-Account-Id':auth.accountId},body,signal:abort.signal});
  record.status=response.status;record.upstreamRequestId=response.headers.get('x-request-id');save();
  if(response.status!==200){record.serverCompletion=[401,403,429].includes(response.status)?'known_refusal':'unknown';record.reason='non-200';let bytes=Buffer.alloc(0);for await(const chunk of response.body??[]){bytes=Buffer.concat([bytes,Buffer.from(chunk)]);if(bytes.length>=8192){record.errorBodyTruncated=true;break;}}record.errorBody=bytes.subarray(0,8192).toString('utf8');return record;}
  const observer=availabilityObserver(record,save);
  for await(const chunk of response.body){fs.appendFileSync(out+'/availability.sse',chunk,{mode:0o600});observer.push(chunk);if(record.admissionStop){record.reason=record.admissionStop.kind;return record;}}
  observer.end();record.streamEnded=true;
  record.text=observer.text();
 }catch(error){record.error={name:error.name,message:error.message};record.serverCompletion=knownResponseTerminal(record)?record.terminalResponse.status:record.serverCompletion??'unknown';record.reason='transport-or-authorization-error';}
 finally{clearTimeout(timer);abort.abort();if(response?.body&&!response.body.locked)await response.body.cancel().catch(()=>{});record.handlerFinished=true;record.connectionClosed=true;record.activeProviderHandlers=0;record.finishedAt=new Date().toISOString();record.success=availabilityAdmission(record);if(!record.success)record.reason??=record.textBindingError??'completion-or-text-unconfirmed';save();}
 return record;
}

// Only completed assistant text is collected. Lifecycle/UTF-8/SSE parsing stays
// in the existing observer; items are local to this one response stream.
export function availabilityObserver(record,persist=()=>{}) {
 const slots=new Map(),ids=new Map();
 const reject=reason=>{record.textBindingError??=reason;};
 const receive=(item,index,done,terminal=false)=>{
  if(!Number.isSafeInteger(index)||index<0||!item||typeof item.id!=='string'||!item.id){reject('Missing item identity');return;}
  const old=slots.get(index);
  if((ids.has(item.id)&&ids.get(item.id)!==index)||(old&&old.id!==item.id)){reject('Conflicting item index or ID');return;}
  if(old&&(old.type!==item.type||old.role!==item.role)){reject('Conflicting item kind');return;}
  if(done&&!terminal&&!old){reject('Unbound completed item');return;}
  const state=old??{id:item.id,type:item.type,role:item.role};
  ids.set(item.id,index);slots.set(index,state);
  if(!done)return;
  if(item.type!=='message'||item.role!=='assistant')return;
  if(item.status!=='completed'||!Array.isArray(item.content)){reject('Assistant message is not completed');return;}
  const parts=item.content.filter(c=>c.type==='output_text');
  if(parts.some(c=>typeof c.text!=='string')){reject('Invalid assistant text');return;}
  const text=parts.map(c=>c.text).join('');
  if(state.text!==undefined&&state.text!==text){reject('Conflicting completed text');return;}
  state.text=text;
 };
 const observer=responseObserver(record,persist,()=>{},(event,declared)=>{
  if(!['response.output_item.added','response.output_item.done','response.completed'].includes(event?.type))return;
  if(declared&&declared!==event.type){reject('Item event/type mismatch');return;}
  if(!record.responseId||(event.response_id&&event.response_id!==record.responseId)){reject('Item outside bound response');return;}
  if(event.type==='response.completed'){
   if(event.response?.id!==record.responseId)return;
   const output=event.response.output;
   if(!Array.isArray(output)){reject('Missing completed output array');return;}
   output.forEach((item,i)=>receive(item,i,true,true));
   if(output.length&&[...slots].some(([i,s])=>s.text!==undefined&&i>=output.length))reject('Conflicting completed output set');
  }else{
   if(record.terminalResponse){reject('Item after terminal response');return;}
   receive(event.item,event.output_index,event.type==='response.output_item.done');
  }
 });
 return {...observer,text:()=>[...slots].sort(([a],[b])=>a-b).map(([,s])=>s.text??'').join('')};
}
export function availabilityAdmission(record){
 return record.status===200&&knownResponseTerminal(record)&&record.serverCompletion==='completed'&&!!record.text?.trim()
  &&record.streamEnded===true&&record.handlerFinished===true&&record.connectionClosed===true&&record.activeProviderHandlers===0
  &&!record.admissionStop&&!record.textBindingError&&!record.error&&!record.transportError;
}
// No fetch or auth is accepted or invoked by this offline entry point.
export function recheckSavedAvailability(root,expectedReportHash){
 const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const reportPath=path.resolve('development/native-task-investigation/availability-results.json');
 if(expectedReportHash)assert.equal(sha(reportPath),expectedReportHash,'Saved report changed');
 const report=JSON.parse(fs.readFileSync(reportPath)),dir=path.join(root,'continuation-3-9');
 assert.equal(sha(dir+'/availability.sse'),report.probe.rawEvidenceSha256);
 assert.equal(sha(dir+'/availability.json'),report.probe.localRecordSha256);
 assert.equal(sha(dir+'/scheduling-paused.json'),report.probe.pauseSha256);
 const previous=JSON.parse(fs.readFileSync(dir+'/availability.json')),pause=JSON.parse(fs.readFileSync(dir+'/scheduling-paused.json'));
 assert.equal(pause.kind,'availability_not_confirmed');assert.equal(previous.reason,'completion-or-text-unconfirmed');
 assert.equal(previous.forwarded,true);assert.equal(previous.model,'gpt-5.6-luna');assert.equal(previous.effort,'high');
 const record={status:previous.status,usage:null,streamEnded:false,handlerFinished:previous.handlerFinished,connectionClosed:previous.connectionClosed,activeProviderHandlers:previous.activeProviderHandlers,error:previous.error,transportError:previous.transportError};
 const observer=availabilityObserver(record),bytes=fs.readFileSync(dir+'/availability.sse');
 // Deliberately split bytes, including UTF-8; the exact bytes remain unchanged.
 for(let i=0;i<bytes.length;i+=37)observer.push(bytes.subarray(i,i+37));
 observer.end();record.streamEnded=previous.streamEnded===true;record.text=observer.text();record.success=availabilityAdmission(record);
 assert.equal(record.responseId,previous.responseId);assert.deepEqual(record.usage,previous.usage);
 return {kind:'offline-saved-availability-recheck',...record,previousAdmissionSuccess:previous.success,newProviderRequests:0,usageAlreadyCounted:true,sourceHashes:{sse:sha(dir+'/availability.sse'),metadata:sha(dir+'/availability.json'),pause:sha(dir+'/scheduling-paused.json'),report:sha(reportPath)}};
}
