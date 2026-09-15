// One neutral request through the series route and response lifecycle observer.
import fs from 'node:fs';
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
  const observer=responseObserver(record,save);
  for await(const chunk of response.body){fs.appendFileSync(out+'/availability.sse',chunk,{mode:0o600});observer.push(chunk);if(record.admissionStop){record.reason=record.admissionStop.kind;return record;}}
  observer.end();record.streamEnded=true;
  // Read text only from the bound completed response, not an unconfirmed delta.
  for(const packet of fs.readFileSync(out+'/availability.sse','utf8').split(/\r?\n\r?\n/)){const data=packet.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data||data==='[DONE]')continue;let e;try{e=JSON.parse(data);}catch{continue;}if(e.type==='response.completed'&&e.response?.id===record.responseId)record.text=(e.response.output??[]).filter(i=>i.type==='message'&&i.role==='assistant').flatMap(i=>i.content??[]).filter(c=>c.type==='output_text').map(c=>c.text??'').join('');}
  record.success=knownResponseTerminal(record)&&record.serverCompletion==='completed'&&!record.admissionStop&&!!record.text?.trim();
  if(!record.success)record.reason='completion-or-text-unconfirmed';
 }catch(error){record.error={name:error.name,message:error.message};record.serverCompletion=knownResponseTerminal(record)?record.terminalResponse.status:record.serverCompletion??'unknown';record.reason='transport-or-authorization-error';}
 finally{clearTimeout(timer);abort.abort();if(response?.body&&!response.body.locked)await response.body.cancel().catch(()=>{});record.handlerFinished=true;record.connectionClosed=true;record.activeProviderHandlers=0;record.finishedAt=new Date().toISOString();save();}
 return record;
}
