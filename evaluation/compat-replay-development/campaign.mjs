// Experiment-specific admission; shared scheduler, containment, capture and auth.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {manifest} from '../support/manifest.mjs';
import {hashFile,privateJSON} from '../support/output-files.mjs';
import {runComparison,verifyFrozenSchedule} from '../support/scheduler.mjs';
import {startContainer,image} from '../support/container-session.mjs';
import {runNativePhase} from '../support/native-run.mjs';
import {stopWorkload} from '../support/stop-workload.mjs';
import {captureCandidate} from '../polybench/capture.mjs';
import {existingConnection} from '../feedback-development/auth.mjs';
import {providerConfig} from '../feedback-development/prepare.mjs';
import {config,command,cleanEnvironment,frozenManifest,prepareSource} from '../feedback-development/suite.mjs';
import {verifyUnstarted} from '../feedback-development/run.mjs';
import {directory,repository,tasks,schedule,runId,realBatch,executionManifest} from './suite.mjs';
import {treeHash} from './probe.mjs';
import {validateExperimentBundle} from './assets.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
export function sourceFiles() {
  const old=frozenManifest(),entries={...old.files,...old.product};
  for(const [name,entry] of Object.entries(manifest(directory)))if(!name.startsWith('evidence/'))entries['evaluation/compat-replay-development/'+name]=entry;
  return Object.fromEntries(Object.entries(entries).map(([name,e])=>[path.join(repository,name),e.sha256]));
}
export function prepare({output,bundle,toolchain,executionImage=image,fixture=false,attempts,preflight,installed,deadline,budgetMs=600000}) {
  if(![output,bundle,toolchain].every(p=>path.isAbsolute(p))||fs.existsSync(output))throw Error('Fresh absolute paths required');
  if(!fixture&&(output!==realBatch||attempts||budgetMs!==600000))throw Error('Only canonical once-only campaign authorized');
  let receipts=[];
  if(!fixture){
    receipts=[preflight,installed,deadline].map(file=>{if(!file||!path.isAbsolute(file))throw Error('Required gate receipt missing');return JSON.parse(fs.readFileSync(file));});
    const [p,i,d]=receipts;
    if(receipts.some(r=>r.passed!==true||r.realProviderCalls!==0||r.executionImage!==executionImage)||!p.contained||p.rows.length!==6||p.negative.length<10||!tasks.every(t=>p.taskHashes[t.id]===treeHash(t.source)&&p.rows.find(r=>r.task===t.id)?.results.gold.probe.status==='matched'))throw Error('Unproven model-free gate');
    if(JSON.stringify(p.inputHashes)!==JSON.stringify(manifest(path.join(directory,'tasks')))||p.probeSha256!==hashFile(path.join(directory,'probe.mjs')).sha256||p.workerSha256!==hashFile(path.join(directory,'worker.mjs')).sha256)throw Error('Changed model-free inputs/probe');
    if(!p.rows.every(r=>r.results.baseline.probe.status==='matched'&&r.results.baseline.independentR===false&&r.results.gold.independentR===true&&r.results.wrong.independentR===false&&r.results.wrong.probe.status==='different'&&r.results.wrong.probe.differences.length>0&&['baseline','gold','wrong'].every(k=>r.results[k].publicExit===0&&r.results[k].existingCorrectionReasons.length===0)))throw Error('Unproven incremental signal');
    for(const r of [i,d])if(JSON.stringify(r.bundleManifest)!==JSON.stringify(manifest(bundle))||r.binarySha256!==hashFile(path.join(toolchain,'package/bin/opencode')).sha256)throw Error('Installed gate assets changed');
    if(i.rows.length!==2||!i.rows.every(r=>r.delivery===true)||i.rows.find(r=>r.arm==='control')?.R!==false||i.rows.find(r=>r.arm==='candidate')?.R!==true||i.probeDelivered!==true||i.probeCleared!==true||d.controls.length!==2||!d.controls.every(r=>r.stop.terminationVerified&&r.stop.relayRemoved&&r.stop.activeProviderHandlers===0))throw Error('Unproven actual correction or stop');
    if(command('git',['status','--porcelain'],repository).trim())throw Error('Commit executable source and protocol first');
  }
  fs.mkdirSync(path.join(output,'inputs'),{recursive:true,mode:0o700});
  const selected=attempts??schedule,inputs={};
  for(const id of new Set(selected.map(a=>a.task))){const task=tasks.find(t=>t.id===id);if(!task)throw Error('Unknown task');const source=path.join(output,'inputs',id);inputs[id]={source,manifest:prepareSource(task,source)};}
  const files={...sourceFiles(),[path.join(toolchain,'package/bin/opencode')]:hashFile(path.join(toolchain,'package/bin/opencode')).sha256,...Object.fromEntries([preflight,installed,deadline].filter(Boolean).map(p=>[p,hashFile(p).sha256]))};
  const f={experimentKind:fixture?'fixture':'compat-replay-development',runId,suite:runId,model:'openai/gpt-5.6-luna',variant:'high',runtimeVersion:'1.18.26',nodeVersion:'24.19.0',budgetMs,strategy:'per-slot',streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,preflightPassed:true,executionImage,files,attempts:selected.map(a=>({...a,source:inputs[a.task].source})),toolchain,template:bundle,runtimeManifests:{[bundle]:manifest(bundle),...Object.fromEntries(Object.values(inputs).map(i=>[i.source,i.manifest]))},inputManifests:Object.fromEntries(selected.map(a=>[a.task+'-'+a.arm,inputs[a.task].manifest])),config:providerConfig('openai/gpt-5.6-luna','high'),modelRunsAuthorized:!fixture,sourceCommit:command('git',['rev-parse','HEAD'],repository).trim()};
  privateJSON(path.join(output,'freeze.json'),f);
  if(!fixture)privateJSON(path.join(output,'execution-manifest.json'),{runId,sourceCommit:f.sourceCommit,freezeSha256:hashFile(path.join(output,'freeze.json')).sha256,executionImage,order:schedule,model:f.model,variant:f.variant,budgetMs,files,bundleManifest:manifest(bundle),toolchainManifest:manifest(toolchain),receipts:[preflight,installed,deadline].map(p=>({sha256:hashFile(p).sha256})),realProviderCallsBeforeFreeze:0});
  return f;
}
export async function runTask(session,options) {
  if(!['control','candidate'].includes(options.arm))throw Error('Unknown compatibility arm');
  session.armMode='task';session.arm=options.arm;
  const result=await runNativePhase(session,{...options,enabled:true,strategy:'D'},{spawnProcess:(cmd,args,settings)=>{
    const at=args.indexOf(session.name);if(at<0)throw Error('Missing container');
    const env={...config.environment,COMPAT_REPLAY_PROBE:options.arm==='candidate'?'1':'0'};
    return spawn(cmd,[...args.slice(0,at),...Object.entries(env).flatMap(([k,v])=>['--env',k+'='+v]),...args.slice(at)],{...settings,env:cleanEnvironment()});
  }});
  const {events,stderr,...summary}=result;
  return {...summary,phaseCount:1,continuationApplied:false,nativeCompleted:result.exitCode===0&&!result.timedOut&&!result.parseErrors&&!events.some(e=>e.type==='error')&&events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop')};
}
export function verifyAdmission(root,f,seal) {
  if(root!==realBatch||f.experimentKind!=='compat-replay-development'||f.runId!==runId||f.modelRunsAuthorized!==true||f.runtimeVersion!=='1.18.26'||f.nodeVersion!=='24.19.0'||f.executionImage!==image)throw Error('Unapproved compatibility execution');
  if(JSON.stringify(f.config)!==JSON.stringify(providerConfig(f.model,f.variant))||JSON.stringify(f.attempts)!==JSON.stringify(schedule.map(a=>({...a,source:path.join(realBatch,'inputs',a.task)}))))throw Error('Changed configuration/order');
  if(seal.runId!==runId||seal.sourceCommit!==f.sourceCommit||seal.freezeSha256!==hashFile(path.join(root,'freeze.json')).sha256)throw Error('Changed committed seal');
  for(const [file,digest] of Object.entries(sourceFiles())){
    if(f.files[file]!==digest)throw Error('Unfrozen code: '+file);
    if(sha(command('git',['show',f.sourceCommit+':'+path.relative(repository,file)],repository,{encoding:null}))!==digest)throw Error('Code differs from execution commit');
  }
  for(const t of tasks)for(const arm of ['control','candidate'])if(JSON.stringify(f.inputManifests[t.id+'-'+arm])!==JSON.stringify(manifest(t.source)))throw Error('Changed public input');
  verifyFrozenSchedule(f,runTask,fetch);
}
export async function runPrepared(root,{scriptedFetch,authorizeModelRuns=false,readAuth}={}) {
  if(!authorizeModelRuns&&typeof scriptedFetch!=='function'||scriptedFetch===fetch)throw Error('Explicit model authorization or local scripted provider required');
  const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));let connection;
  if(f.experimentKind==='fixture'){if(authorizeModelRuns||!scriptedFetch)throw Error('Fixture cannot authorize real calls');}
  else {
    if(!authorizeModelRuns||scriptedFetch)throw Error('No transport fallback');
    const published=fs.readFileSync(path.join(repository,executionManifest));
    if(!published.equals(Buffer.from(command('git',['show','HEAD:'+executionManifest],repository))))throw Error('Execution seal must be committed');
    verifyAdmission(root,f,JSON.parse(published));verifyUnstarted(root);await validateExperimentBundle(f.template);
    command('git',['merge-base','--is-ancestor',f.sourceCommit,'HEAD'],repository);
    connection=existingConnection();readAuth??=connection.read;
  }
  if(f.executionImage!==image)throw Error('Unfrozen execution image');
  verifyFrozenSchedule(f,runTask,scriptedFetch??fetch);
  if(f.experimentKind!=='fixture'){await readAuth();privateJSON(path.join(root,'admission-started.json'),{at:new Date().toISOString(),freezeSha256:hashFile(path.join(root,'freeze.json')).sha256});}
  return runComparison({root,fetchImpl:scriptedFetch??fetch,readAuth:readAuth??(()=>{throw Error('Fixture auth forbidden');}),startContainer:async options=>{const start=performance.now(),s=await startContainer(options);try{s.preparationStartedMono=start;s.baseline=command('docker',['exec',s.name,'git','-C','/work/repo','rev-parse','HEAD'],root).trim();return s;}catch(e){s.close();throw e;}},runTaskImplementation:async(s,o)=>({...await runTask(s,o),preparationElapsedMs:Math.max(0,o.deadlineMono-f.budgetMs-s.preparationStartedMono)}),stopWorkload,captureCandidate});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [mode,...args]=process.argv.slice(2);
  if(mode==='prepare'){const [output,bundle,toolchain,preflight,installed,deadline]=args;await validateExperimentBundle(bundle);await existingConnection().readiness();prepare({output,bundle,toolchain,preflight,installed,deadline});}
  else if(mode==='run'&&args[1]==='--authorize-model-runs')console.log(JSON.stringify(await runPrepared(args[0],{authorizeModelRuns:true})));
  else throw Error('Usage: campaign.mjs prepare ABS_OUTPUT ABS_BUNDLE ABS_TOOLCHAIN ABS_PREFLIGHT ABS_INSTALLED ABS_DEADLINE | run ABS_BATCH --authorize-model-runs');
}
