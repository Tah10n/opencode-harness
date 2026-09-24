// Model-free admission tests for the existing explicit continuation mechanism.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {recheckSavedAvailability} from './availability-probe.mjs';
import {runComparison} from '../native-task-ab/run-comparison.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'integration-continuation-'));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const json=(p,x)=>fs.writeFileSync(p,JSON.stringify(x));
const reports=[];globalThis.fetch=()=>{throw Error('No network permitted in offline admission verification');};
try{for(const mode of ['valid','wrong-first','wrong-second','changed-pause','old-container-present','unstarted-artifact','probe-task-artifact','changed-bundle','changed-history','missing-history-hash','existing-continuation','task-pause','changed-probe','changed-report']){
 const dir=root+'/'+mode;fs.mkdirSync(dir);const source=dir+'/source';fs.mkdirSync(source);fs.writeFileSync(source+'/TASK.md','Fixture');const manifest={'TASK.md':{sha256:sha(source+'/TASK.md'),executable:false}};
 const bundle=dir+'/bundle';fs.mkdirSync(bundle);fs.writeFileSync(bundle+'/product','fixed candidate');
 const order=['P','R','H','R','H','P','H','P','R'];const attempts=order.map((arm,i)=>({slot:i+1,task:'task'+Math.floor(i/3),project:'project'+Math.floor(i/3),arm,source}));
 const launcher=path.resolve('development/native-task-ab/run-comparison.mjs');
 const frozen={version:1,experimentKind:'targeted-integration',runtimeSha:'fixed-product',model:'openai/gpt-5.6-luna',variant:'high',budgetMs:900000,strategy:'direct',streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,preflightPassed:true,attempts,files:{[launcher]:'old-launcher'},runtimeManifests:{[bundle]:{product:{sha256:sha(bundle+'/product'),executable:false}}},inputManifests:Object.fromEntries(attempts.map(a=>[a.task+'-'+a.arm,manifest]))};json(dir+'/freeze.json',frozen);json(dir+'/scheduling-paused.json',{kind:'unknown_submission',slot:1});
 const historical=dir+'/runs/task0-P';fs.mkdirSync(historical+'/session',{recursive:true});for(const n of ['started','completed','result'])json(historical+'/'+n+'.json',attempts[0]);
 json(historical+'/stop-verification.json',{terminationVerified:true,captureSaved:true,forwardingClosed:true,relayRemoved:true,activeProviderHandlers:0});json(historical+'/session/cleanup.json',{status:0});json(historical+'/session/container.json',{name:'historical-fixture'});json(historical+'/provider-metadata.json',[]);fs.writeFileSync(historical+'/candidate.tar','fixture archive');
 const historicalFiles={};for(const n of fs.readdirSync(historical))if(n!=='session')historicalFiles['runs/task0-P/'+n]=sha(historical+'/'+n);for(const n of fs.readdirSync(historical+'/session'))historicalFiles['runs/task0-P/session/'+n]=sha(historical+'/session/'+n);
 const second=dir+'/continuation-2-9/runs/task0-R';fs.cpSync(historical,second,{recursive:true});for(const n of ['started','completed','result'])json(second+'/'+n+'.json',attempts[1]);
 for(const [rel,digest]of Object.entries({...historicalFiles}))historicalFiles[rel.replace('runs/task0-P','continuation-2-9/runs/task0-R')]=sha(dir+'/'+rel.replace('runs/task0-P','continuation-2-9/runs/task0-R'));
 json(dir+'/continuation-2-9/scheduling-paused.json',{kind:'provider_protocol_error',slot:2});
 const original=path.resolve('local/native-investigation-comparison/continuation-3-9');fs.cpSync(original,dir+'/continuation-3-9',{recursive:true});
 const amendment={version:1,firstSlot:3,lastSlot:9,availabilityRequests:0,savedProbeReportSha256:sha('development/native-task-investigation/availability-results.json'),savedProbePauseSha256:sha(dir+'/continuation-3-9/scheduling-paused.json'),previousPauseSha256:sha(dir+'/continuation-2-9/scheduling-paused.json'),additionalLauncherFiles:Object.fromEntries(['availability-probe.mjs','prepare-availability.mjs','prepare-probe-recheck.mjs'].map(n=>[n,sha('development/native-task-investigation/'+n)])),runtimeSha:frozen.runtimeSha,originalFreezeSha256:sha(dir+'/freeze.json'),originalPauseSha256:sha(dir+'/scheduling-paused.json'),launcherFiles:{[launcher]:{before:'old-launcher',after:sha(launcher)}},historicalFiles};
 if(mode==='wrong-second')amendment.firstSlot=2;
 if(mode==='changed-report')amendment.savedProbeReportSha256='bad';
 if(mode==='changed-probe')fs.appendFileSync(dir+'/continuation-3-9/availability.sse','changed');
 if(mode==='probe-task-artifact')fs.mkdirSync(dir+'/continuation-3-9/runs');
 if(mode==='wrong-first')amendment.firstSlot=1;
 if(mode==='changed-pause')json(dir+'/scheduling-paused.json',{kind:'unknown_submission',slot:2});
 if(mode==='unstarted-artifact')fs.mkdirSync(dir+'/continuation-2-9/runs/task0-H');
 if(mode==='changed-bundle')fs.writeFileSync(bundle+'/product','changed');
 if(mode==='missing-capture')fs.unlinkSync(historical+'/candidate.tar');
 if(mode==='changed-history')json(historical+'/provider-metadata.json',[{changed:true}]);
 if(mode==='missing-history-hash')delete amendment.historicalFiles['runs/task0-P/candidate.tar'];
 if(mode==='unallowed-launcher')amendment.launcherFiles['/unallowed']={before:'x',after:'x'};
 if(mode==='existing-continuation')fs.mkdirSync(dir+'/continuation-3-9-rechecked');
 json(dir+'/amendment.json',amendment);const started=[];let quiescence=false,hits=0,handler;
 const probe=()=>{throw Error('New probe is prohibited');};
 let failure=null;try{await runComparison({root:dir,continuationFile:dir+'/amendment.json',beforeTasks:probe,verifyQuiescence:async rows=>{assert.equal(rows.length,2);quiescence=true;if(mode==='old-container-present')throw Error('Historical container still exists');},readAuth:()=>{throw Error('No provider expected');},startContainer:async args=>{handler=args.onRequest;const a=attempts[started.length+2];started.push(a.slot);return {slot:a.slot,setTaskBudget(){},close(){return 0;},exec(argv){return {status:0,stdout:argv[0]==='/opt/opencode'?'1.18.26':argv[2]?.includes('DatabaseSync')?JSON.stringify({sessions:[],messages:[],tools:[]}):argv[2]?.includes("visit('/work/repo')")?JSON.stringify(manifest):''};}};},runTaskImplementation:async()=>{if(mode==='task-pause')await handler({path:'/forbidden',body:{}},()=>{},new AbortController().signal);return {exitCode:0,termination:{terminationVerified:true},nativeCompleted:true,elapsedMs:0};},stopWorkload:()=>({terminationVerified:true}),captureCandidate:(s,out)=>{fs.writeFileSync(out+'/candidate.tar','new capture');return {status:0};}});}catch(e){failure=e.message;}

 if(['valid','task-pause'].includes(mode)){assert.equal(failure,null);assert.deepEqual(started,mode==='valid'?[3,4,5,6,7,8,9]:mode==='task-pause'?[3]:[]);assert.equal(hits,0);const saved=JSON.parse(fs.readFileSync(dir+'/continuation-3-9-rechecked/saved-probe-recheck.json'));assert.equal(saved.handlerFinished,true);assert.equal(saved.usage.total_tokens,47);assert.equal(saved.success,true);assert.equal(saved.newProviderRequests,0);await assert.rejects(()=>runComparison({root:dir,continuationFile:dir+'/amendment.json',beforeTasks:probe}));assert.equal(hits,0);assert.ok(quiescence);assert.equal(sha(dir+'/freeze.json'),amendment.originalFreezeSha256);assert.equal(sha(dir+'/scheduling-paused.json'),amendment.originalPauseSha256);}else{assert.ok(failure,mode);assert.deepEqual(started,[],mode);assert.equal(hits,0);}
 reports.push({mode,passed:true,startedSlots:started,upstreamRequests:hits,rejection:failure});
}console.log(JSON.stringify({passed:true,realProviderRequests:0,scenarios:reports},null,2));}finally{fs.rmSync(root,{recursive:true,force:true});}
