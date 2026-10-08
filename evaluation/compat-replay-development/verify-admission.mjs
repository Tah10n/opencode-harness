// Integration regressions on prepare()/runPrepared(); no real toolchain or auth.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sourceManifest,requiredSteps,preparationCommands} from './readiness.mjs';
import {repository} from './suite.mjs';
const self=fileURLToPath(import.meta.url),rows=[];
if(process.argv[2]!=='--child'){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'compat-admission-'));
  try{
    const root=path.join(temp,'repo');
    const run=(bin,args,options={})=>{const r=spawnSync(bin,args,{encoding:'utf8',...options});assert.equal(r.status,0,r.stderr);return r;};
    run('git',['clone','--quiet','--no-hardlinks',repository,root]);
    for(const name of Object.keys(sourceManifest())){const dest=path.join(root,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(repository,name),dest);}
    run('git',['add','.'],{cwd:root});run('git',['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','--allow-empty','-qm','Readiness fixture inputs'],{cwd:root});
    const bin=path.join(temp,'bin');fs.mkdirSync(bin);
    const docker=`#!${process.execPath}\nif(process.argv[2]==='version')console.log('test/test');else if(process.argv[2]==='image')console.log(JSON.stringify([{Id:'sha256:'+'1'.repeat(64),Architecture:'arm64',Os:'linux'}]));else {require('fs').appendFileSync(${JSON.stringify(temp+'/participants')},'attempt\\n');process.exit(1);}`;
    fs.writeFileSync(bin+'/docker',docker,{mode:0o755});fs.writeFileSync(bin+'/opencode',`#!${process.execPath}\nconsole.log('1.18.26')`,{mode:0o755});
    const result=run(process.execPath,[path.join(root,path.relative(repository,self)),'--child',temp],{cwd:root,env:{...process.env,PATH:bin+path.delimiter+process.env.PATH},timeout:120000});
    console.log(result.stdout.trim());
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}else{
  // This isolated subprocess models pinned tools; CI itself may use a newer Node 24.
  Object.defineProperty(process,'version',{value:'v24.19.0'});
  const temp=process.argv[3],{prepare,runPrepared}=await import('./campaign.mjs'),{snapshot,verifyReadiness}=await import('./readiness.mjs'),{hashFile}=await import('../support/output-files.mjs'),{campaignFor}=await import('./suite.mjs');
  const work=path.join(repository,'local/regression');fs.mkdirSync(work,{recursive:true});
  const bundle=work+'/bundle',toolchain=work+'/toolchain',hostOpenCode=temp+'/bin/opencode',executionImage='sha256:'+'1'.repeat(64);
  for(const d of [bundle,toolchain,repository+'/node_modules',repository+'/profiles/native/sensitivity/node_modules'])fs.mkdirSync(d,{recursive:true});
  fs.writeFileSync(bundle+'/plugin.mjs','fixture bundle');fs.writeFileSync(toolchain+'/binary','fixture binary');
  const {executeStep}=await import('./prepare-ready.mjs');const steps=[];
  for(const name of requiredSteps)steps.push(await executeStep({name,argv:[process.execPath,'-e','process.exit(0)'],output:work}));
  const sourceCommit=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),inputs=snapshot({bundle,toolchain,hostOpenCode,executionImage});
  const required={ 'Native product and model-free evaluation':['Run npm run verify','Actual installed local-provider checks'],'Evaluation container boundary':['Verify real isolation, descendant stop and private capture','Experimental compatibility replay and native corrective delivery','Complete compatibility scripted schedule'],'Harness verification':['Require actually executed checks']};
  const jobs=Object.entries(required).map(([name,names],i)=>({id:i+1,run_id:1,name,status:'completed',conclusion:'success',completed_at:new Date().toISOString(),steps:names.map(name=>({name,status:'completed',conclusion:'success'}))}));
  const ci={run:{id:1,head_sha:sourceCommit,status:'completed',conclusion:'success',event:'pull_request',repository:{full_name:'Tah10n/opencode-harness'},pull_requests:[{number:36}]},jobs:{jobs},checkouts:jobs.slice(0,2).map(j=>({name:j.name,jobId:j.id,commit:sourceCommit,sourceManifest:inputs.sourceManifest,log:steps[0].log}))};
  const linuxOpenCode=hostOpenCode;steps.forEach((s,i)=>{s.command=preparationCommands(work,sourceCommit,linuxOpenCode)[i];});
  // Run the real CI collector through the real step recorder: their files must not collide.
  const ciWork=work+'/ci-step';fs.mkdirSync(ciWork);
  const apiFixture={...ci,run:{...ci.run,name:'Verify',head_branch:'experiment/compat-replay'}};
  fs.writeFileSync(work+'/github.json',JSON.stringify(apiFixture));
  fs.writeFileSync(temp+'/bin/gh',`#!${process.execPath}\nconst f=JSON.parse(require('fs').readFileSync(${JSON.stringify(work+'/github.json')}));const route=process.argv.at(-1);if(route.endsWith('/logs'))console.log('git log -1 --format=%H\\n'+f.run.head_sha);else console.log(JSON.stringify(route.includes('actions/runs?')?{workflow_runs:[f.run]}:route.includes('/jobs?')?f.jobs:f.run));`,{mode:0o755});
  const remote=spawnSync('git',['remote','set-url','origin',repository],{encoding:'utf8'});assert.equal(remote.status,0,remote.stderr);
  await executeStep({name:'ci',argv:[process.execPath,path.join(repository,'evaluation/compat-replay-development/prepare-ready.mjs'),'ci',sourceCommit,ciWork],output:ciWork});
  const retainedCI=JSON.parse(fs.readFileSync(ciWork+'/ci-metadata.json'));
  const {verifyCI}=await import('./readiness.mjs');verifyCI(retainedCI,sourceCommit);
  assert.equal(JSON.parse(fs.readFileSync(ciWork+'/ci.json')).name,'ci');assert.equal(retainedCI.checkouts.length,2);
  const valid={output:work,linuxOpenCode,revision:1,runId:'compat-replay-development-v2',status:'ready',sourceCommit,executionImage,steps,inputs,ci,completedAt:new Date().toISOString()};
  const readiness=work+'/readiness.json',root=work+'/direct',real=campaignFor(valid.runId).realBatch;fs.mkdirSync(root);
  const freeze={runId:valid.runId,experimentKind:'compat-replay-development',readiness,template:bundle,toolchain,hostOpenCode,executionImage};
  const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v));
  write(readiness,valid);verifyReadiness(readiness,{bundle,toolchain,hostOpenCode,executionImage});
  let authAccesses=0,upstreamRequests=0;globalThis.fetch=async()=>{upstreamRequests++;throw Error('Upstream forbidden');};
  const readAuth=()=>{authAccesses++;throw Error('Auth forbidden');};
  async function negative(name,receipt=valid,options={}){
    if(receipt===null)fs.rmSync(readiness,{force:true});else write(readiness,receipt);
    write(root+'/freeze.json',{...freeze,...options.freeze});
    if(options.marker)write(root+'/admission-started.json',{});
    if(!options.fixtureOnly)assert.throws(()=>prepare({output:real,bundle,toolchain,executionImage,campaign:valid.runId,readiness,hostOpenCode}),/readiness|Readiness|Historical|Previously/);
    await assert.rejects(()=>runPrepared(root,{authorizeModelRuns:true,readAuth,...options.run}));
    const participantAttempts=fs.existsSync(temp+'/participants')?fs.readFileSync(temp+'/participants','utf8').trim().split('\n').length:0;
    assert.deepEqual({authAccesses,upstreamRequests,participantAttempts},{authAccesses:0,upstreamRequests:0,participantAttempts:0});assert.equal(fs.existsSync(real),false);assert.equal(fs.existsSync(root+'/runs'),false);
    if(!options.marker)assert.equal(fs.existsSync(root+'/admission-started.json'),false);
    rows.push({name,authAccesses,upstreamRequests,participantAttempts});
    fs.rmSync(root+'/admission-started.json',{force:true});
  }
  await negative('missing-full-verify',null);
  for(const state of ['missing','running','failed','interrupted']){
    const r=structuredClone(valid),s=r.steps.find(x=>x.name==='verify');
    if(state==='missing')r.steps=r.steps.filter(x=>x.name!=='verify');else if(state==='running')s.status='running';else if(state==='failed')s.exitCode=1;else{s.exitCode=null;s.signal='SIGTERM';}
    await negative('verify-'+state,r);
  }
  for(const [name,file] of [['source','lib/native-task-plugin.mjs'],['verification-script','scripts/verify-all.mjs'],['bundle',path.relative(repository,bundle+'/plugin.mjs')],['toolchain',path.relative(repository,toolchain+'/binary')]]){
    const p=path.join(repository,file),saved=fs.readFileSync(p);try{fs.appendFileSync(p,'\n// changed\n');await negative('changed-'+name);}finally{fs.writeFileSync(p,saved);}
  }
  for(const state of ['pending','skipped','stale']){const r=structuredClone(valid);if(state==='stale')r.ci.run.head_sha='0'.repeat(40);else r.ci.jobs.jobs[0].conclusion=state;await negative('ci-'+state,r);}
  await negative('direct-runPrepared-without-readiness',null,{fixtureOnly:true});
  await negative('fixture-real-authorization',valid,{fixtureOnly:true,freeze:{experimentKind:'fixture'},run:{scriptedFetch:async()=>{upstreamRequests++;}}});
  await negative('fixture-real-transport',valid,{fixtureOnly:true,freeze:{experimentKind:'fixture'},run:{authorizeModelRuns:false,scriptedFetch:fetch}});
  await negative('closed-v1',valid,{fixtureOnly:true,freeze:{runId:'compat-replay-development-v1'}});
  assert.throws(()=>prepare({output:real,bundle,toolchain,campaign:'compat-replay-development-v1'}),/Historical/);
  await negative('already-started',valid,{fixtureOnly:true,marker:true});
  // Actual child exit, signal and timeout cannot create a successful step.
  for(const [name,code,timeoutMs] of [['failed-command','process.exit(4)',1000],['interrupted-command',"process.kill(process.pid,'SIGTERM')",1000],['timed-out-command','setInterval(()=>{},1000)',50]])await assert.rejects(()=>executeStep({name,argv:[process.execPath,'-e',code],output:work,timeoutMs}));
  console.log(JSON.stringify({passed:true,fixtureOnly:true,rows,commandFailureControls:3,ciMetadataPreservedAfterStep:true}));
}
