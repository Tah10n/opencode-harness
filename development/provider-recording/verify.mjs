import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {mock} from 'node:test';
import {runComparison} from '../native-task-ab/run-comparison.mjs';import {prepareRecording,recordingProfile} from '../native-task-ab/provider-recording.mjs';
import {performance} from 'node:perf_hooks';import {materializeNativeTemplate} from '../../lib/native-template.mjs';
import {fixture,stream,digest,body} from './fixture.mjs';
const root=path.resolve(process.argv[2]);fs.mkdirSync(root,{recursive:true,mode:0o700});const results=[];
for(const kind of ['assertion-review-pair','sensitivity-usage']){
 const r=await fixture(runComparison,root+'/'+kind,{kind});assert.equal(r.result.status,'finished');assert.equal(r.hits,2);
 for(const [i,record]of r.records.entries()){
  assert.equal(record.recording.evidenceComplete,true);assert.equal(record.usage.total_tokens,5);assert.equal(record.serverCompletion,'completed');
  assert.ok(fs.readFileSync(r.out+`/response-${i+1}.sse`).equals(stream));assert.ok(r.sent[i].bytes.equals(stream));assert.ok(fs.readFileSync(r.out+`/upstream-request-${i+1}.json`).equals(r.received[i]));
  assert.equal(record.recording.forwarded.sha256,digest(stream));assert.equal(record.recording.response.size,stream.length);assert.equal(fs.statSync(r.out+`/response-${i+1}.sse`).mode&0o777,0o600);
  assert.equal(JSON.parse(fs.readFileSync(r.out+`/request-${i+1}.json`)).store,undefined);assert.equal(JSON.parse(r.received[i]).store,false);
 }
 assert.deepEqual(r.records.map(r=>r.requestKind),['work','title']);results.push({kind,requests:r.hits,bytes:stream.length*2,passed:true});
}
for(const mode of ['read-error','cancel','eof-only','prepare-error','dispatch-metadata-error','auth-error','terminal-write-error']){
 let restore=()=>{};
 try{
 const r=await fixture(runComparison,root+'/'+mode,{mode,beforeRequest:out=>{
  if(mode==='dispatch-metadata-error'){const rename=fs.renameSync;let injected=false;const m=mock.method(fs,'renameSync',function(src,dst){if(!injected&&dst===out+'/provider-metadata.json'&&JSON.parse(fs.readFileSync(src)).some(r=>r.forwarded)){injected=true;throw Error('scripted metadata rename failure');}return rename.call(this,src,dst);});restore=()=>m.mock.restore();}
  if(mode==='prepare-error')fs.symlinkSync('/nonexistent',out+'/response-1.sse');
  if(mode==='terminal-write-error'){let responseFd,injected=false;const open=fs.openSync;const om=mock.method(fs,'openSync',function(file,...args){const fd=open.call(this,file,...args);if(String(file)===out+'/response-1.sse')responseFd=fd;return fd;});const original=fs.writeSync;const m=mock.method(fs,'writeSync',function(fd,buffer,...args){if(!injected&&fd===responseFd&&Buffer.isBuffer(buffer)&&buffer.includes('response.completed')){injected=true;throw Error('scripted ENOSPC on terminal chunk');}return original.call(this,fd,buffer,...args);});restore=()=>{m.mock.restore();om.mock.restore();};}
 }});
 assert.equal(r.result.status,'paused');assert.equal(r.hits,['prepare-error','dispatch-metadata-error','auth-error'].includes(mode)?0:1);
 const first=r.records[0];assert.equal(first.recording.evidenceComplete,mode==='eof-only');
 if(mode==='terminal-write-error'){assert.equal(first.serverCompletion,'completed');assert.equal(first.usage.total_tokens,5);assert.equal(first.recording.status,'write_error');assert.equal(r.result.pause.kind,'evidence_incomplete');}
 else if(mode==='auth-error'){assert.equal(first.recording.status,'not_started');assert.equal(first.forwarded,false);assert.equal(first.usage,null);}
 else if(['prepare-error','dispatch-metadata-error'].includes(mode)){assert.equal(first.forwarded,false);assert.equal(first.notForwardedReason,'recording-preparation-failed');assert.equal(first.serverCompletion,undefined);}
 else {assert.equal(first.serverCompletion,'unknown');assert.equal(first.usage,null);assert.equal(first.recording.response.eof,mode==='eof-only');}
 results.push({mode,requests:r.hits,state:first.recording.status,provider:first.serverCompletion??'not_sent',passed:true});
 }finally{restore();}
}
// New names are tested at the recorder boundary, never admitted to the scheduler.
for(const mode of ['new-label','limit','corruption','request-corruption','unsafe']){
 const dir=root+'/'+mode;fs.mkdirSync(dir,{mode:0o700});
 if(mode==='unsafe'){const link=dir+'/link';fs.symlinkSync(dir,link);assert.throws(()=>prepareRecording(link,{run:'local'}),/Unsafe/);results.push({mode,passed:true});continue;}
 const rec={requestIndex:1,requestKind:'title',relayRequestId:'local'};
 const recording=prepareRecording(dir,{run:'new-unregistered-label',slot:1},{bounds:{...recordingProfile,...(mode==='limit'?{responseBytes:5}:{})}}).begin(rec,JSON.stringify(body),JSON.stringify({...body,store:false}));
 const ok=recording.append(stream);assert.equal(ok,mode!=='limit');
 if(mode==='request-corruption')fs.writeFileSync(dir+'/request-1.json','corrupt');
 if(mode==='corruption')fs.writeFileSync(dir+'/response-1.sse','corrupt');
 assert.equal(recording.finish('eof'),mode==='new-label');results.push({mode,state:rec.recording.status,passed:true});
}
{
 const dir=root+'/storage-time';fs.mkdirSync(dir,{mode:0o700});let now=0;const clock=mock.method(performance,'now',()=>now);let write;
 try{const rec={requestIndex:1};const recording=prepareRecording(dir,{run:'local'}).begin(rec,'{}','{}');const original=fs.writeSync;write=mock.method(fs,'writeSync',function(...args){const n=original.apply(this,args);now=30001;return n;});assert.equal(recording.append(stream),false);assert.equal(recording.finish('eof'),false);assert.match(rec.recording.error,/time limit/);results.push({mode:'storage-time-limit',passed:true});}finally{write?.mock.restore();clock.mock.restore();}
}
{
 const dir=root+'/ordinary';materializeNativeTemplate({repositoryRoot:process.cwd(),outputDirectory:dir});
 assert.ok(!fs.existsSync(dir+'/provider-recording.mjs'));assert.equal(JSON.parse(fs.readFileSync(dir+'/opencode.json')).plugin,undefined);
 assert.ok(!fs.existsSync(dir+'/recording-config.json'));results.push({mode:'ordinary-template-uninstrumented',passed:true});
}
await assert.rejects(fixture(runComparison,root+'/unknown-admission',{kind:'unregistered'}),/Unknown development experiment/);
results.push({mode:'unknown-admission-rejected',passed:true});
fs.writeFileSync(root+'/result.json',JSON.stringify({passed:true,results,realProviderCalls:0},null,2));console.log(JSON.stringify({passed:true,results,realProviderCalls:0}));
