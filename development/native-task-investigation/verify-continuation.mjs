// Model-free admission tests for the existing explicit continuation mechanism.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {runComparison} from '../native-task-ab/run-comparison.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'integration-continuation-'));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const json=(p,x)=>fs.writeFileSync(p,JSON.stringify(x));
const reports=[];
try{for(const mode of ['valid','wrong-first','changed-pause','old-container-present','unstarted-artifact','changed-bundle','missing-capture','changed-history','missing-history-hash','unallowed-launcher','existing-continuation']){
 const dir=root+'/'+mode;fs.mkdirSync(dir);const source=dir+'/source';fs.mkdirSync(source);fs.writeFileSync(source+'/TASK.md','Fixture');const manifest={'TASK.md':{sha256:sha(source+'/TASK.md'),executable:false}};
 const bundle=dir+'/bundle';fs.mkdirSync(bundle);fs.writeFileSync(bundle+'/product','fixed candidate');
 const order=['P','R','H','R','H','P','H','P','R'];const attempts=order.map((arm,i)=>({slot:i+1,task:'task'+Math.floor(i/3),project:'project'+Math.floor(i/3),arm,source}));
 const launcher=path.resolve('development/native-task-ab/run-comparison.mjs');
 const frozen={version:1,experimentKind:'targeted-integration',runtimeSha:'fixed-product',model:'openai/gpt-5.6-luna',variant:'high',budgetMs:900000,strategy:'direct',streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,preflightPassed:true,attempts,files:{[launcher]:'old-launcher'},runtimeManifests:{[bundle]:{product:{sha256:sha(bundle+'/product'),executable:false}}},inputManifests:Object.fromEntries(attempts.map(a=>[a.task+'-'+a.arm,manifest]))};json(dir+'/freeze.json',frozen);json(dir+'/scheduling-paused.json',{kind:'unknown_submission',slot:1});
 const historical=dir+'/runs/task0-P';fs.mkdirSync(historical+'/session',{recursive:true});for(const n of ['started','completed','result'])json(historical+'/'+n+'.json',attempts[0]);
 json(historical+'/stop-verification.json',{terminationVerified:true,captureSaved:true,forwardingClosed:true,relayRemoved:true,activeProviderHandlers:0});json(historical+'/session/cleanup.json',{status:0});json(historical+'/session/container.json',{name:'historical-fixture'});json(historical+'/provider-metadata.json',[]);fs.writeFileSync(historical+'/candidate.tar','fixture archive');
 const historicalFiles={};for(const n of fs.readdirSync(historical))if(n!=='session')historicalFiles['runs/task0-P/'+n]=sha(historical+'/'+n);for(const n of fs.readdirSync(historical+'/session'))historicalFiles['runs/task0-P/session/'+n]=sha(historical+'/session/'+n);
 const amendment={version:1,firstSlot:2,lastSlot:9,runtimeSha:frozen.runtimeSha,originalFreezeSha256:sha(dir+'/freeze.json'),originalPauseSha256:sha(dir+'/scheduling-paused.json'),launcherFiles:{[launcher]:{before:'old-launcher',after:sha(launcher)}},historicalFiles};
 if(mode==='wrong-first')amendment.firstSlot=1;
 if(mode==='changed-pause')json(dir+'/scheduling-paused.json',{kind:'unknown_submission',slot:2});
 if(mode==='unstarted-artifact')fs.mkdirSync(dir+'/runs/task0-R');
 if(mode==='changed-bundle')fs.writeFileSync(bundle+'/product','changed');
 if(mode==='missing-capture')fs.unlinkSync(historical+'/candidate.tar');
 if(mode==='changed-history')json(historical+'/provider-metadata.json',[{changed:true}]);
 if(mode==='missing-history-hash')delete amendment.historicalFiles['runs/task0-P/candidate.tar'];
 if(mode==='unallowed-launcher')amendment.launcherFiles['/unallowed']={before:'x',after:'x'};
 if(mode==='existing-continuation')fs.mkdirSync(dir+'/continuation-2-9');
 json(dir+'/amendment.json',amendment);const started=[];let quiescence=false;
 let failure=null;try{await runComparison({root:dir,continuationFile:dir+'/amendment.json',verifyQuiescence:async rows=>{assert.equal(rows.length,1);quiescence=true;if(mode==='old-container-present')throw Error('Historical container still exists');},readAuth:()=>{throw Error('No provider expected');},startContainer:async args=>{const a=attempts[started.length+1];started.push(a.slot);return {slot:a.slot,setTaskBudget(){},close(){return 0;},exec(argv){return {status:0,stdout:argv[0]==='/opt/opencode'?'1.18.26':argv[2]?.includes('DatabaseSync')?JSON.stringify({sessions:[],messages:[],tools:[]}):argv[2]?.includes("visit('/work/repo')")?JSON.stringify(manifest):''};}};},runTaskImplementation:async()=>({exitCode:0,termination:{terminationVerified:true},nativeCompleted:true,elapsedMs:0}),stopWorkload:()=>({terminationVerified:true}),captureCandidate:(s,out)=>{fs.writeFileSync(out+'/candidate.tar','new capture');return {status:0};}});}catch(e){failure=e.message;}
 if(mode==='valid'){assert.equal(failure,null);assert.deepEqual(started,[2,3,4,5,6,7,8,9]);assert.ok(quiescence);assert.equal(sha(dir+'/freeze.json'),amendment.originalFreezeSha256);assert.equal(sha(dir+'/scheduling-paused.json'),amendment.originalPauseSha256);}else{assert.ok(failure,mode);assert.deepEqual(started,[],mode);}
 reports.push({mode,passed:true,startedSlots:started,rejection:failure});
}console.log(JSON.stringify({passed:true,realProviderRequests:0,scenarios:reports},null,2));}finally{fs.rmSync(root,{recursive:true,force:true});}
