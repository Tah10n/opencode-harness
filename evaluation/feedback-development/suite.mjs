import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {manifest} from '../support/manifest.mjs';
import {hashFile} from '../support/output-files.mjs';

export const directory=import.meta.dirname;
export const repository=path.resolve(directory,'../..');
export const runId='development-run-v3';
export const conditionsHead='779fb00ea8bab16e3e5da6695c76c622e70d26b0';
export const realBatch=path.join(repository,'local/feedback-development-run-v3/batch');
export const executionManifest='evaluation/feedback-development/evidence/development-run-v3/execution-freeze.json';
export const config=JSON.parse(fs.readFileSync(path.join(directory,'config.json')));
export const tasks=fs.readdirSync(path.join(directory,'tasks')).sort().map(id=>({
  ...JSON.parse(fs.readFileSync(path.join(directory,'tasks',id,'task.json'))),
  directory:path.join(directory,'tasks',id), source:path.join(directory,'tasks',id,'source'),
}));
export const schedule=tasks.flatMap((task,index)=>(index%2?['D','direct']:['direct','D']).map(arm=>({slot:index*2+(arm===(index%2?'D':'direct')?1:2),task:task.id,arm})));
export const calibrationTasks=fs.readdirSync(path.join(directory,'calibration/tasks')).sort().map(id=>({
  ...JSON.parse(fs.readFileSync(path.join(directory,'calibration/tasks',id,'task.json'))),
  directory:path.join(directory,'calibration/tasks',id),source:path.join(directory,'calibration/tasks',id,'source'),
}));
export const calibrationOrders=[['P','H0','H1'],['H0','H1','P'],['H1','P','H0'],['P','H1','H0'],['H1','H0','P'],['H0','P','H1']];
export const calibrationSchedule=calibrationTasks.flatMap((t,i)=>calibrationOrders[i].map((arm,j)=>({slot:i*3+j+1,task:t.id,arm})));
export const calibrationConfig={...config,suite:'feedback-calibration-v1',arms:['P','H0','H1'],labels:{P:'Plain OpenCode',H0:'existing direct',H1:'existing D'}};
export function suiteFor(f={}) {
  const calibration=f.experimentKind==='feedback-calibration'||f.suite===calibrationConfig.suite;
  return calibration?{config:calibrationConfig,tasks:calibrationTasks,schedule:calibrationSchedule,runId:'calibration-run-v1',kind:'feedback-calibration',realBatch:path.join(repository,'local/feedback-calibration-20261007/batch'),executionManifest:'evaluation/feedback-development/evidence/calibration-run-v1/execution-freeze.json',conditionsHead:'2bb68a7784623d16a288b695a1d14a05f4b0cc19'}:{config,tasks,schedule,runId,kind:'feedback-development',realBatch,executionManifest,conditionsHead};
}
export function cleanEnvironment(input=process.env) {
  return Object.fromEntries(Object.entries(input).filter(([key])=>!key.startsWith('HARNESS_')&&!key.startsWith('OPENCODE_')));
}
export function command(file,args,cwd,options={}) {
  const result=spawnSync(file,args,{cwd,env:cleanEnvironment(),encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024,...options});
  if(result.error||result.signal||result.status!==0)throw result.error??Error(file+' failed: '+result.stderr);
  return result.stdout;
}
export function prepareSource(task,destination) {
  // An allowlisted public tree, without the harness repository or its history.
  fs.cpSync(task.source,destination,{recursive:true,verbatimSymlinks:true});
  const files=manifest(destination);
  if(Object.keys(files).some(name=>/(^|\/)(\.git|acceptance|gold|wrong)(\/|\.|$)/.test(name)))throw Error('Private input in public source');
  return files;
}
export function applyPatch(source,patch,destination) {
  prepareSource({source},destination);
  command('git',['init','-q'],destination);
  command('git',['add','.'],destination);
  command('git',['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','Public baseline'],destination);
  if(patch.length)command('git',['-c','core.hooksPath=/dev/null','apply','--binary','-'],destination,{input:patch});
  // Reject paths/links escaping the clean delivered tree, without editing it.
  manifest(destination);
}
export function auditFlags() {
  const keys=new Set();
  for(const file of fs.readdirSync(path.join(repository,'lib')).filter(name=>name.endsWith('.mjs')))
    for(const match of fs.readFileSync(path.join(repository,'lib',file),'utf8').matchAll(/HARNESS_[A-Z_]+/g))keys.add(match[0]);
  const inert=['HARNESS_REVIEW_BASE','HARNESS_REVIEW_TASK_FILE','HARNESS_TASK_FILE','HARNESS_TASK_STRATEGY','HARNESS_TASK_TIMEOUT_MS','HARNESS_TASK_DEADLINE_AT','HARNESS_TASK_TYPE_COMPAT_COMPILER','HARNESS_TASK_TYPE_COMPAT_PROFILE','HARNESS_TASK_TYPE_COMPAT_ENTRY','HARNESS_TASK_TYPE_COMPAT_NODE'];
  const known=new Set([...Object.keys(config.environment),...inert]);
  for(const key of keys)if(!known.has(key))throw Error('Unfrozen HARNESS intervention: '+key);
  return [...keys].sort();
}
export function frozenManifest() {
  const files={};
  for(const [name,entry] of Object.entries(manifest(directory))) {
    if(name==='frozen-manifest.json'||name.startsWith('evidence/'))continue;
    files['evaluation/feedback-development/'+name]=entry;
  }
  const product={};
  for(const dir of ['lib','profiles/native'])for(const [name,entry] of Object.entries(manifest(path.join(repository,dir)))) {
    if(name.includes('node_modules/'))continue;
    product[dir+'/'+name]=entry;
  }
  for(const name of ['native-run.mjs','container-session.mjs','container-relay.mjs','deadline-stop.mjs','stop-workload.mjs','scheduler.mjs','input-manifest.mjs','manifest.mjs','provider-recording.mjs','output-files.mjs','Dockerfile'])product['evaluation/support/'+name]={sha256:hashFile(path.join(repository,'evaluation/support',name)).sha256};
  product['evaluation/polybench/capture.mjs']={sha256:hashFile(path.join(repository,'evaluation/polybench/capture.mjs')).sha256};
  return {revision:1,suite:config.suite,kind:'development-screening',productBase:'f23f2cd6f293e4ec496ad119485d7d4bde1f822f',acceptedFeedbackHead:'4659cb2218e10ef93371c2d39a5080f42c389dd9',runtimeVersion:config.runtimeVersion,nodeVersion:config.nodeVersion,model:null,variant:null,environmentImage:null,freezeComplete:false,missing:['explicit model','explicit variant','immutable execution image and installed runtime/dependency hashes'],budgetMs:config.budgetMs,order:schedule,configuration:config,harnessKeys:auditFlags(),product,files};
}
