// Host-side preparation evidence. No credentials or provider transport here.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {manifest} from '../support/manifest.mjs';
import {hashFile} from '../support/output-files.mjs';
import {command} from '../feedback-development/suite.mjs';
import {repository,campaignFor} from './suite.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const requiredSteps=['dependencies','sensitivity-dependencies','assets','verify','verify-installed','container-boundary','experiment-container','installed-correction-and-deadlines','scripted-schedule','ci'];
export function preparationCommands(output,sourceCommit,linuxOpenCode) {
  const node=process.execPath,here='evaluation/compat-replay-development/',launcher=path.join(repository,here,'prepare-ready.mjs');
  const bundle=path.join(output,'assets/bundle'),toolchain=path.join(output,'assets/toolchain');
  return [
    ['npm','ci','--ignore-scripts'],
    ['npm','ci','--ignore-scripts','--prefix','profiles/native/sensitivity'],
    [node,launcher,'assets',path.join(output,'assets'),linuxOpenCode],
    ['npm','run','verify'],['npm','run','verify:installed'],
    [node,'evaluation/support/verify-output-boundaries.mjs'],
    [node,here+'container-checks.mjs',path.join(output,'preflight'),toolchain],
    [node,here+'installed.mjs',path.join(output,'installed'),bundle,toolchain],
    [node,here+'installed.mjs',path.join(output,'rehearsal'),bundle,toolchain,'--all'],
    [node,launcher,'ci',sourceCommit,output],
  ];
}
// Extend the existing manifests by explicit verification surfaces. No dependency inference.
export function sourceManifest() {
  const out={};
  for(const dir of ['lib','profiles/native','scripts','evaluation','.github'])for(const [name,entry] of Object.entries(manifest(path.join(repository,dir)))){
    if(name.includes('node_modules/')||name.includes('__pycache__/')||name.endsWith('.DS_Store')||/(^|\/)evidence\//.test(name))continue;
    out[dir+'/'+name]=entry;
  }
  for(const name of ['package.json','package-lock.json','AGENTS.md','.gitignore'])out[name]={sha256:hashFile(path.join(repository,name)).sha256,executable:!!(fs.statSync(path.join(repository,name)).mode&0o111)};
  return out;
}
export function verifySourceCommit(sourceCommit,expected) {
  if(!/^[a-f0-9]{40}$/.test(sourceCommit??''))throw Error('Readiness source commit missing');
  if(!same(sourceManifest(),expected))throw Error('Readiness source/verification inputs changed');
  command('git',['merge-base','--is-ancestor',sourceCommit,'HEAD'],repository);
  for(const [name,entry] of Object.entries(expected)){
    const bytes=command('git',['show',sourceCommit+':'+name],repository,{encoding:null});
    if(entry.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('Uncommitted readiness input: '+name);
  }
  // Only the declared v2 evidence files may be added after the checked commit.
  const changed=command('git',['diff','--name-only',sourceCommit,'HEAD'],repository).trim().split('\n').filter(Boolean);
  if(changed.some(n=>!/^evaluation\/compat-replay-development\/evidence\/development-run-v2\/(readiness|execution-freeze|ci|results|technical|history-preservation)\.json$/.test(n)&&n!=='evaluation/compat-replay-development/evidence/development-run-v2/REPORT.md'))throw Error('Non-evidence commit after readiness source');
}
export function toolFacts(hostOpenCode,executionImage) {
  if(!path.isAbsolute(hostOpenCode??'')||!/^sha256:[a-f0-9]{64}$/.test(executionImage??''))throw Error('Pinned host runtime and image required');
  const binaries={node:process.execPath,opencode:hostOpenCode};
  for(const name of ['npm','git','python3','docker'])binaries[name]=command('which',[name],repository).trim();
  const versions={node:process.version,opencode:command(hostOpenCode,['--version'],repository).trim(),npm:command('npm',['--version'],repository).trim(),git:command('git',['--version'],repository).trim(),python:command('python3',['--version'],repository).trim(),docker:command('docker',['version','--format','{{.Client.Version}}/{{.Server.Version}}'],repository).trim()};
  if(versions.node!=='v24.19.0'||versions.opencode!=='1.18.26')throw Error('Unpinned readiness toolchain');
  const imageInfo=JSON.parse(command('docker',['image','inspect',executionImage],repository))[0];
  if(imageInfo.Id!==executionImage)throw Error('Readiness image digest changed');
  return {versions,binaries:Object.fromEntries(Object.entries(binaries).map(([k,p])=>[k,{path:fs.realpathSync(p),sha256:hashFile(fs.realpathSync(p)).sha256}])),image:{id:imageInfo.Id,architecture:imageInfo.Architecture,os:imageInfo.Os}};
}
export function snapshot({bundle,toolchain,hostOpenCode,executionImage}) {
  return {sourceManifest:sourceManifest(),bundleManifest:manifest(bundle),toolchainManifest:manifest(toolchain),dependencies:{root:manifest(path.join(repository,'node_modules')),sensitivity:manifest(path.join(repository,'profiles/native/sensitivity/node_modules'))},tools:toolFacts(hostOpenCode,executionImage)};
}
export function verifyCI(ci,sourceCommit) {
  const run=ci?.run,jobs=ci?.jobs?.jobs;
  if(!run||run.head_sha!==sourceCommit||run.status!=='completed'||run.conclusion!=='success'||run.event!=='pull_request'||run.repository?.full_name!=='Tah10n/opencode-harness'||!run.pull_requests?.some(p=>p.number===36)||!Array.isArray(jobs))throw Error('Readiness requires completed successful PR #36 CI on source commit');
  const required={
    'Native product and model-free evaluation':['Run npm run verify','Actual installed local-provider checks'],
    'Evaluation container boundary':['Verify real isolation, descendant stop and private capture','Experimental compatibility replay and native corrective delivery','Complete compatibility scripted schedule'],
    'Harness verification':['Require actually executed checks'],
  };
  for(const [name,steps] of Object.entries(required)){
    const matching=jobs.filter(j=>j.name===name&&j.run_id===run.id);
    if(matching.length!==1||matching[0].status!=='completed'||matching[0].conclusion!=='success'||!matching[0].completed_at||!steps.every(s=>matching[0].steps.some(x=>x.name===s&&x.status==='completed'&&x.conclusion==='success')))throw Error('Readiness CI job/steps incomplete: '+name);
  }
}
export function verifySteps(r) {
  if(r?.revision!==1||r.runId!=='compat-replay-development-v2'||r.status!=='ready'||!Array.isArray(r.steps)||!same(r.steps.map(s=>s.name),requiredSteps))throw Error('Mandatory readiness missing or incomplete');
  let last=0;
  for(const s of r.steps){
    if(s.status!=='completed'||s.exitCode!==0||s.signal!==null||s.error!==null||!Array.isArray(s.command)||!s.command.length||!Number.isFinite(Date.parse(s.startedAt))||!Number.isFinite(Date.parse(s.finishedAt))||Date.parse(s.startedAt)<last||Date.parse(s.finishedAt)<Date.parse(s.startedAt))throw Error('Mandatory readiness step not successful: '+s.name);
    last=Date.parse(s.finishedAt);
  }
  if(Date.parse(r.completedAt)<last||!Number.isFinite(Date.parse(r.completedAt)))throw Error('Incomplete readiness publication');
}
export function verifyReadiness(file,options) {
  if(!file||!path.isAbsolute(file)||!fs.existsSync(file))throw Error('Mandatory readiness receipt missing');
  const r=JSON.parse(fs.readFileSync(file));verifySteps(r);
  if(!r.output||!path.isAbsolute(r.output)||!r.linuxOpenCode||!same(r.steps.map(s=>s.command),preparationCommands(r.output,r.sourceCommit,r.linuxOpenCode)))throw Error('Readiness commands do not match required preparation');
  if(campaignFor(r.runId).closed||r.executionImage!==options.executionImage)throw Error('Wrong readiness campaign/image');
  for(const s of r.steps)if(!s.log?.path||hashFile(s.log.path).sha256!==s.log.sha256)throw Error('Readiness log changed: '+s.name);
  verifySourceCommit(r.sourceCommit,r.inputs.sourceManifest);
  if(!same(r.inputs,snapshot(options)))throw Error('Readiness bundle/toolchain/dependencies changed');
  verifyCI(r.ci,r.sourceCommit);
  if(r.ci.checkouts?.length!==2||!r.ci.checkouts.every(c=>/^[a-f0-9]{40}$/.test(c.commit)&&same(c.sourceManifest,r.inputs.sourceManifest)&&hashFile(c.log.path).sha256===c.log.sha256&&r.ci.jobs.jobs.some(j=>j.id===c.jobId&&j.name===c.name)))throw Error('Missing verified CI checkout manifest');
  return r;
}
