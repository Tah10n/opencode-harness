import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
export const digest=b=>createHash('sha256').update(b).digest('hex');
export const event=(type,id,status,extra={})=>'data: '+JSON.stringify({type,response:{id,status,...extra}})+'\r\n\r\n';
export const stream=Buffer.from(event('response.created','resp_local','in_progress')+'data: '+JSON.stringify({type:'unknown.future',text:'Привет 🌍'})+'\r\n\r\n'+'data: '+JSON.stringify({type:'response.output_text.delta',delta:'hello'})+'\n\n'+event('response.completed','resp_local','completed',{usage:{input_tokens:2,output_tokens:3,total_tokens:5}}));
export const body={model:'gpt-5.6-luna',reasoning:{effort:'high'},stream:true,tools:[{name:'fixture',type:'function',parameters:{type:'object',properties:{}}}],input:[]};
const listen=s=>new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+s.address().port));});
const close=async s=>{s.closeAllConnections();await new Promise(r=>s.close(r));};
export async function fixture(runComparison,dir,{kind='assertion-review-pair',mode='success',beforeRequest=()=>{},afterChunk=()=>{}}={}){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});const source=dir+'/input';fs.mkdirSync(source);fs.writeFileSync(source+'/TASK.md','Local recorder fixture; no model inference.');
 const manifest={'TASK.md':{sha256:digest(fs.readFileSync(source+'/TASK.md')),executable:false}};
 const pair=kind.startsWith('assertion-review');
 const attempts=pair?['AR0','AR1'].map((arm,i)=>({slot:i+1,task:'account-switch-ledger',project:'Tah10n/viberacing',arm,source})):[1,2].map(i=>({slot:i,task:'fixture-'+i,arm:'H1',source:source+(i===2?'-2':'')}));
 if(!pair)fs.cpSync(source,source+'-2',{recursive:true});
 const f={experimentKind:kind,model:'openai/gpt-5.6-luna',variant:'high',strategy:'direct',budgetMs:pair?1800000:900000,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,preflightPassed:true,files:{},attempts,inputManifests:Object.fromEntries(attempts.map(a=>[a.task+'-'+a.arm,manifest])),runtimeSha:'8facea83bec3203ed500ee6884278d2df06b8c2b',candidates:{AR0:'ca72c444b06b3be096cfa22aa6a82968e807a994',AR1:'8facea83bec3203ed500ee6884278d2df06b8c2b'},templates:{AR0:'local-fixture-a',AR1:'local-fixture-b'}};
 fs.writeFileSync(dir+'/freeze.json',JSON.stringify(f));
 let handler,slot=0,hits=0;const sent=[],received=[],controllers=new Set(),pending=new Set();
 const upstream=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);received.push(Buffer.concat(chunks));hits++;res.writeHead(200,{'content-type':'text/event-stream','x-request-id':'safe-local-'+hits});
  if(mode==='read-error'||mode==='cancel'){res.write(stream.subarray(0,100));setTimeout(()=>mode==='read-error'?res.destroy():[...controllers].forEach(c=>c.abort()),30);return;}
  if(mode==='eof-only'){res.end(stream.subarray(0,stream.indexOf('data: {"type":"response.completed"')));return;}
  if(mode==='terminal-write-error'){res.end(stream);return;}
  const cut=stream.indexOf(Buffer.from('🌍'))+2,separator=stream.indexOf('\r\n\r\n')+3;
  for(const [a,b]of [[0,separator],[separator,cut],[cut,stream.length]]){res.write(stream.subarray(a,b));await new Promise(r=>setTimeout(r,8));}res.end();
 });const url=await listen(upstream);
 const downstream=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const controller=new AbortController();controllers.add(controller);res.once('close',()=>{if(!res.writableEnded)controller.abort();});
  const p=handler({id:'local-'+(sent.length+1),path:'/v1/responses',body:JSON.parse(Buffer.concat(chunks))},frame=>{
   if(frame.type==='headers')res.writeHead(frame.status,{'content-type':frame.contentType});
   if(frame.type==='chunk'){const bytes=Buffer.from(frame.data,'base64');res.write(bytes);afterChunk(bytes);}
   if(frame.type==='end')res.end();
  },controller.signal).catch(()=>res.destroy()).finally(()=>{controllers.delete(controller);pending.delete(p);if(!res.writableEnded)res.end();});pending.add(p);
 });const downstreamURL=await listen(downstream);
 const request=async tools=>{try{const r=await fetch(downstreamURL,{method:'POST',body:JSON.stringify({...body,tools}),signal:AbortSignal.timeout(5000)});const bytes=Buffer.from(await r.arrayBuffer());sent.push({status:r.status,bytes});}catch(e){sent.push({error:e.name});}};
 const out=dir+'/runs/'+attempts[0].task+'-'+attempts[0].arm;
 try{
 const result=await runComparison({root:dir,readAuth:()=>{if(mode==='auth-error')throw Error('scripted unavailable authorization');return {access:'scripted-not-a-secret',accountId:'local'};},fetchImpl:async(expected,options)=>{assert.equal(expected,'https://chatgpt.com/backend-api/codex/responses');return fetch(url,options);},
  startContainer:async options=>{handler=options.onRequest;slot++;return {setTaskBudget(){},close(){return 0;},exec(argv){return {status:0,stdout:argv[0]==='/opt/opencode'?'1.18.26':argv[2].includes('DatabaseSync')?JSON.stringify({sessions:[],messages:[],tools:[]}):argv[2].includes("visit('/work/repo')")?JSON.stringify(manifest):''};}};},
  stopWorkload:()=>({terminationVerified:true}),captureCandidate:(_,o)=>{fs.writeFileSync(o+'/candidate.tar','safe fixture artifact');return {status:0};},
  runTaskImplementation:async()=>{if(slot===1){await beforeRequest(out);await request(body.tools);await request([]);}return {exitCode:0,termination:{terminationVerified:true}};}});
 await Promise.allSettled([...pending]);return {result,out,hits,sent,received,records:JSON.parse(fs.readFileSync(out+'/provider-metadata.json'))};
 }finally{for(const c of controllers)c.abort();await close(downstream);await close(upstream);}
}
