import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {prepareRecording,recordingProfile,inspectFullTaskRecordingProfile as large,selectRecordingProfile} from '../../native-task-ab/provider-recording.mjs';
import {runComparison} from '../../native-task-ab/run-comparison.mjs';
const root=path.resolve(process.argv[2]??'local/investigation-followup-full-task/recording-controls-final');fs.mkdirSync(root,{mode:0o700});
const get=p=>JSON.parse(fs.readFileSync(p)),dir=n=>{const d=root+'/'+n;fs.mkdirSync(d,{mode:0o700});return d;};
assert.deepEqual(recordingProfile,{name:'research-full-v1',requestBytes:16777216,responseBytes:67108864,totalBytes:268435456,requests:1024,storageMs:30000});
prepareRecording(dir('default'),{});assert.equal(get(root+'/default/recording-config.json').bounds.totalBytes,268435456);
prepareRecording(dir('selected'),{},{profile:large.name});assert.deepEqual(get(root+'/selected/recording-config.json').bounds,large);
assert.throws(()=>selectRecordingProfile('unlimited'),/Unknown/);
assert.throws(()=>prepareRecording(dir('old-over'),{},{bounds:large}),/Invalid/);
assert.throws(()=>prepareRecording(dir('large-over'),{},{profile:large.name,bounds:{...large,totalBytes:large.totalBytes+1}}),/Invalid/);
for(const [name,bounds,expected] of [['response',{responseBytes:3,totalBytes:100},['response']],['slot',{responseBytes:100,totalBytes:7},['slot']],['both',{responseBytes:3,totalBytes:7},['response','slot']]]){
 const record={requestIndex:1},r=prepareRecording(dir(name),{},{profile:large.name,bounds:{...large,...bounds}}).begin(record,'{}','{}');assert.equal(r.append(Buffer.from('1234')),false);assert.equal(r.finish('interrupted'),false);assert.deepEqual(record.recording.limit.exceeded.map(x=>x.scope),expected);
}
const shared=prepareRecording(dir('shared'),{},{profile:large.name,bounds:{...large,totalBytes:23,responseBytes:100}});
for(const [i,role]of ['author','child','parent','title'].entries()){const rec={requestIndex:i+1,requestKind:role},r=shared.begin(rec,'{}','{}');if(i<3){assert.ok(r.append(Buffer.from('ab')));assert.ok(r.finish('eof'));}else{assert.equal(r.append(Buffer.from('ab')),false);assert.deepEqual(rec.recording.limit.exceeded,[{scope:'slot',boundBytes:23,usedBytes:22,operationBytes:2}]);r.finish('interrupted');}}
// Existing scheduler, small injected storage failure: closure blocks the next role.
const schedule=dir('admission'),f=get('local/investigation-followup-full-task/prepared.json');f.runtimeManifests={};fs.writeFileSync(schedule+'/freeze.json',JSON.stringify(f));let handler,sent=0;
const stream=Buffer.from('data: '+JSON.stringify({type:'response.created',response:{id:'control',status:'in_progress'}})+'\n\n'+'data: '+JSON.stringify({type:'response.completed',response:{id:'control',status:'completed',usage:{input_tokens:1,output_tokens:1,total_tokens:2}}})+'\n\n');
const originalWrite=fs.writeSync;
const result=await runComparison({root:schedule,readAuth:()=>({access:'fixture',accountId:'fixture'}),fetchImpl:async()=>{sent++;return new Response(stream);},startContainer:async o=>{handler=o.onRequest;return {setTaskBudget(){},close(){return 0;},exec(args){return {status:0,stdout:args[0]==='/opt/opencode'?'1.18.26':args[2]?.includes('DatabaseSync')?JSON.stringify({sessions:[],messages:[],tools:[]}):args[2]?.includes("visit('/work/repo')")?JSON.stringify(f.inputManifests['account-switch-ledger-I1']):''};}};},stopWorkload:()=>({terminationVerified:true}),captureCandidate:()=>({status:0}),runTaskImplementation:async()=>{
 const body={model:'gpt-5.6-luna',reasoning:{effort:'high'},stream:true,tools:[]};
 fs.writeSync=function(...args){if(Buffer.isBuffer(args[1])&&args[1].equals(stream))throw Error('Synthetic full-recording storage failure');return originalWrite.apply(this,args);};try{await handler({id:'title',path:'/v1/responses',body},()=>{},new AbortController().signal);}finally{fs.writeSync=originalWrite;}
 await handler({id:'author',path:'/v1/responses',body:{...body,tools:[{name:'read'}]}},()=>{},new AbortController().signal);
 return {termination:{terminationVerified:true},nativeCompleted:true};
}});
assert.equal(sent,1);assert.equal(result.pause.kind,'evidence_incomplete');const rec=get(schedule+'/runs/account-switch-ledger-I1/provider-metadata.json');assert.equal(rec[1].forwarded,false);assert.equal(rec[0].recording.profile,large.name);
const receipt={passed:true,defaultUnchanged:true,selectedProfilePassedToRecorder:true,finiteProfilesOnly:true,responseAndSlotIndependent:true,sharedAllRolesCounter:true,admissionClosedAfterStorageFailure:true,syntheticUpstreamRequests:1,realProviderRequests:0};fs.writeFileSync('development/investigation-followup/full-task/recording-verification.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
