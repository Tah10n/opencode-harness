// Compact public evidence. No private sessions or complete project copies.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {reviewContext} from '../../lib/native-review-context.mjs';

const root=process.cwd(),local=path.resolve('local/native-sensitivity'),campaign=path.join(local,'diagnostic'),pub=path.resolve('development/native-task-sensitivity');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const freeze=read(path.join(campaign,'freeze.json')),admission=read(path.join(campaign,'admission.json'));
fs.mkdirSync(path.join(pub,'patches'),{recursive:true});fs.mkdirSync(path.join(pub,'attempts'),{recursive:true});
const names=new Set(execFileSync('docker',['ps','-a','--format','{{.Names}}'],{encoding:'utf8'}).trim().split('\n'));
function sourceManifest(dir) {
  const out={};
  function visit(current,prefix='') {
    for(const e of fs.readdirSync(current,{withFileTypes:true})) {
      if(e.name==='.git'||e.name==='node_modules')continue;
      const file=path.join(current,e.name),name=prefix+e.name,st=fs.lstatSync(file);
      if(st.isDirectory())visit(file,name+'/');else out[name]=st.isSymbolicLink()?{symlink:fs.readlinkSync(file)}:{sha256:sha(fs.readFileSync(file)),executable:!!(st.mode&0o111)};
    }
  }visit(dir);return out;
}
const rows=[];
for(const attempt of freeze.attempts) {
  const id=attempt.task+'-'+attempt.arm,dir=path.join(campaign,'runs',id),r=read(path.join(dir,'result.json'));
  const stop=read(path.join(dir,'stop-verification.json')),metadata=read(path.join(dir,'provider-metadata.json')),native=read(path.join(dir,'native-evidence.json'));
  const container=read(path.join(dir,'session/container.json')).name;
  if(names.has(container)||!stop.terminationVerified||!stop.captureSaved||!stop.relayRemoved||stop.activeProviderHandlers!==0||metadata.length||native.sessions.length||native.tools.length)throw Error('Unexpected attempt state: '+id);
  const captured=path.join(dir,'candidate'),actual=sourceManifest(captured);
  const expected=Object.fromEntries(Object.entries(freeze.inputManifests[id]).filter(([name])=>!name.startsWith('node_modules/')));
  if(Object.keys(actual).length!==Object.keys(expected).length||Object.entries(expected).some(([n,v])=>JSON.stringify(actual[n])!==JSON.stringify(v)))throw Error('Captured input changed: '+id);
  const snapshot=reviewContext({cwd:captured,base:'HEAD',taskFile:null,permissionRules:[{permission:'*',pattern:'*',action:'allow'}]});
  if(snapshot.status!=='captured')throw Error(snapshot.error);
  const patch='patches/'+String(attempt.slot).padStart(2,'0')+'-'+id+'.patch';fs.writeFileSync(path.join(pub,patch),snapshot.diff);
  const started=read(path.join(dir,'started.json')),completed=read(path.join(dir,'completed.json'));
  const row={slot:attempt.slot,case:attempt.task,task:attempt.originalTask,arm:attempt.arm,seedPatch:path.relative(pub,attempt.seedPatch),seedSha256:attempt.seedSha256,
    status:'startup_failed_before_provider',nativeExit:r.exitCode,nativeCompleted:false,authorSessionStarted:false,providerRequests:0,toolCalls:0,diagnosticCalls:0,
    Q:null,D:0,qualityAssessment:'No author result; model quality is unobserved. Captured source equals the supplied unfinished patch, not a newly delivered solution.',
    failure:fs.readFileSync(path.join(dir,'session/stderr.txt'),'utf8').replace(/\u001b\[[0-9;]*m/g,''),patch,patchKind:'captured-input-not-author-delivery',patchSha256:sha(snapshot.diff),inputPreserved:true,
    executionElapsedMs:r.executionElapsedMs,cleanupElapsedMs:r.cleanupElapsedMs,elapsedMs:r.elapsedMs,preparationAndCaptureElapsedMs:Date.parse(completed.at)-Date.parse(started.at)-r.elapsedMs,
    usage:{inputTokens:0,outputTokens:0,cachedInputTokens:0,reasoningTokens:0,unknownRequests:0,basis:'No request reached the container relay or provider; native sessions/tools are empty.'},
    terminationVerified:stop.terminationVerified,containerRemoved:true,completedAt:completed.at};
  rows.push(row);fs.writeFileSync(path.join(pub,'attempts',String(attempt.slot).padStart(2,'0')+'.json'),JSON.stringify(row,null,2)+'\n');
}
for(const [name,digest]of Object.entries(admission.historicalPreservation))if(sha(fs.readFileSync(path.resolve('local/native-task-h00-transfer',name)))!==digest)throw Error('Historical state changed');
const sanitize=value=>JSON.parse(JSON.stringify(value).replace(/(?:\/private)?\/var\/folders\/[^"\\\s]+\/harness-sense-[^/"\\\s]+/g,'<diagnostic>').replace(/\/work\/tmp\/harness-sense-[^/"\\\s]+/g,'<diagnostic>'));
const targeted=sanitize(read(path.join(local,'targeted.json')));
const historical=['weak-computed','weak-remove','control-computed','control-remove','strong-remove'].map(id=>{
  const r=read(path.join(local,id,'result.json'));
  return {id,task:r.task,seedPatch:r.patch,report:sanitize(r.report),realProviderRequests:0,terminationVerified:r.termination.terminationVerified};
});
fs.writeFileSync(path.join(pub,'local-observations.json'),JSON.stringify({targeted,historical},null,2)+'\n');
fs.copyFileSync(path.join(local,'strong-remove/regression.js'),path.join(pub,'denque-empty-regression.js'));
const installed=read(path.join(local,'container-fixture/installed-preflight.json'));
if(!installed.passed||installed.realProviderRequests!==0)throw Error('Corrected readonly installed fixture missing');
const totals={attempts:rows.length,authorSessions:0,providerRequests:0,toolCalls:0,diagnosticCalls:0,deliveredPatches:0,
  executionMs:rows.reduce((n,r)=>n+r.executionElapsedMs,0),cleanupMs:rows.reduce((n,r)=>n+r.cleanupElapsedMs,0),preparationAndCaptureMs:rows.reduce((n,r)=>n+r.preparationAndCaptureElapsedMs,0),
  usage:{inputTokens:0,outputTokens:0,cachedInputTokens:0,reasoningTokens:0,unknownRequests:0}};
const observedLocal=[...targeted.results.map(r=>r.report),...historical.map(r=>r.report)];
const cost={batch:totals,retainedLocalObservations:{calls:observedLocal.length,commands:observedLocal.reduce((n,r)=>n+r.cost.commands,0),engineMs:observedLocal.reduce((n,r)=>n+r.cost.engineMs,0),preparationMs:observedLocal.reduce((n,r)=>n+r.cost.preparationMs,0),totalMs:observedLocal.reduce((n,r)=>n+r.cost.totalMs,0),scope:'These retained local observations only. Earlier iterative checks, npm preparation and developer work were not completely timed; their aggregate cost is unknown, not zero.'},
  correctedInstalledFixture:{nativeElapsedMs:installed.results[0].elapsedMs,scriptedRequests:installed.results[0].requests.length,realProviderRequests:0},monetaryCost:null};
fs.writeFileSync(path.join(pub,'costs.json'),JSON.stringify(cost,null,2)+'\n');
fs.writeFileSync(path.join(pub,'results.json'),JSON.stringify({kind:'selected-development-diagnostic',measuredSource:'6f514420',freezeSha256:admission.freezeSha256,opencode:'1.18.26',model:'openai/gpt-5.6-luna',effort:'high',budgetMs:900000,rows,totals,qualityComparison:null,transferGatePassed:false,transferRuns:0,replacements:0,additionalRealSmokes:0,historicalPreservationVerified:true,
  correctedReadonlyFixture:{passed:true,realProviderRequests:0,nativeCompleted:installed.results[0].nativeCompleted},conclusion:'Eight failed startup attempts, zero model evaluations. No evidence of test-quality or full-delivery advantage. Fixed profile preparation checked only with a scripted container fixture; no replacement campaign.'},null,2)+'\n');
console.log(JSON.stringify({publishedRows:rows.length,capturedInputPatches:rows.length,inputsUnchanged:true,allContainersRemoved:true,historicalPreserved:true,totals,local:cost.retainedLocalObservations}));
