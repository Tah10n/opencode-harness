// Local freeze only. Creates fresh public project sources without old Git objects.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {manifest as tree} from '../native-task-integrated/run.mjs';
import {image} from '../native-task-integrated/container-session.mjs';

const dev='development/investigation-direct-ledger-pair';
const local=path.resolve('local/investigation-direct-ledger-pair');
const old='development/plain-ledger-native-high';
const bundle=path.resolve('local/native-investigation-ledger-pair/bundle');
const toolchain=path.resolve('../verified-change-harness/local/template-toolchain-20260908');
const runtimeSha='1b8c7acbbe59db26462ae0818588274ae67ac683';
const baseline='2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=file=>sha(fs.readFileSync(file));
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
if(execFileSync('git',['rev-parse',runtimeSha+'^{commit}'],{encoding:'utf8'}).trim()!==runtimeSha)
  throw Error('Runtime candidate commit unavailable');
const archive=path.resolve('local/plain-ledger-native-high/baseline.tar');
const task=fs.readFileSync(old+'/original-task.txt'),environment=fs.readFileSync(old+'/environment.txt');
if(hash(archive)!=='ea549fcc30d8facef77af8ebebc280910a24537e44ad8c6cfcbdc4888b5dcab1'||
   sha(task)!=='c855e75f5b4705f703f5c4c39e01d05c73505854c32a4ff97dd5d564e82573eb'||
   sha(environment)!=='aa0afe37ca2ec1f3564642a02842d71472b72b88225069be22a4cbbe8fb114cc')
  throw Error('Original public source, task or environment bytes changed');
for(const name of fs.readdirSync(bundle).filter(n=>n.endsWith('.mjs')))
  if(hash(path.join(bundle,name))!==hash(path.join('lib',name)))throw Error('Installed runtime differs: '+name);
const bundleConfig=JSON.parse(fs.readFileSync(path.join(bundle,'opencode.json')));
if(bundleConfig.plugin?.[0]!=='file:///template/native-task-plugin.mjs'||
   bundleConfig.instructions?.[0]!=='/template/core.md')throw Error('Installed container paths differ');
const sources={};fs.mkdirSync(local,{recursive:true,mode:0o700});
for(const arm of ['I0','I1']){
  const source=path.join(local,'source-'+arm);fs.mkdirSync(source,{mode:0o700});
  execFileSync('tar',['-xf',archive,'-C',source]);
  if(fs.existsSync(path.join(source,'.git')))throw Error('Old Git history reached model input');
  fs.writeFileSync(path.join(source,'TASK.md'),Buffer.concat([task,environment]),{flag:'wx'});
  sources[arm]=source;
}
const a=tree(sources.I0),b=tree(sources.I1);
if(JSON.stringify(a)!==JSON.stringify(b)||Object.keys(a).length!==259)
  throw Error('Independent source inventories differ');
const inputHash=sha(JSON.stringify(a)),bundleInventory=tree(bundle);
const config=JSON.parse(fs.readFileSync('local/native-investigation-ledger-pair/experiment-config.json'));
config.permission={...config.permission,external_directory:{'*':'deny'},webfetch:'deny'};
config.agent={build:{permission:{webfetch:'deny'}}};
const files=[dev+'/PLAN.md',dev+'/run.mjs',dev+'/prepare.mjs',dev+'/full-snapshot-check.mjs',dev+'/preflight.json',
  'development/native-task-ab/run-comparison.mjs','development/native-task-ab/native-run.mjs',
  old+'/original-task.txt',old+'/environment.txt',
  ...['account-switch-ledger','ledger-lifecycle','legacy-input','kimi-migration','migration-contract','cli-persistence'].map(n=>old+'/'+n+'.test.mjs'),
  'development/ledger-review-delivery/persisted-privacy-check/test-only.patch',
  'development/ledger-review-delivery/persisted-privacy-check/claude-persisted-privacy.test.mjs',
  'development/ledger-review-delivery/persisted-privacy-check/calibration/legacy-state.json'];
const frozen={version:1,experimentKind:'investigation-direct-ledger-pair',runtimeSha,candidateSha:runtimeSha,image,
  model:'openai/gpt-5.6-luna',variant:'high',budgetMs:3600000,strategy:'direct',preflightPassed:true,
  streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,toolchain,template:bundle,dependencies:bundle,config,
  attempts:['I0','I1'].map((arm,i)=>({slot:i+1,task:'account-switch-ledger',arm,project:'Tah10n/viberacing',source:sources[arm]})),
  inputManifests:{'account-switch-ledger-I0':a,'account-switch-ledger-I1':b},
  runtimeManifests:{[bundle]:bundleInventory},files:Object.fromEntries(files.map(file=>[file,hash(file)]))};
const batch=path.join(local,'batch');fs.mkdirSync(batch,{mode:0o700});save(path.join(batch,'freeze.json'),frozen);
save(path.join(dev,'manifest.json'),{version:1,stage:'frozen_before_model_requests',runtimeSha,baseline,
  freezeSha256:hash(path.join(batch,'freeze.json')),sourceManifestSha256:inputHash,
  originalTaskSha256:sha(task),environmentSha256:sha(environment),promptSha256:hash(path.join(sources.I0,'TASK.md')),
  bundleManifestSha256:sha(JSON.stringify(bundleInventory)),preflightReceiptSha256:hash(dev+'/preflight.json'),
  installedResultSha256:hash('local/native-investigation-ledger-pair/ledger-snapshot-neutral-final-result.json'),
  installedInvestigationSha256:hash('local/native-investigation-ledger-pair/ledger-snapshot-neutral-final-investigation.json'),
  preflight:'full baseline and scripted installed, zero real provider',
  slots:[{slot:1,arm:'I0',status:'not_started'},{slot:2,arm:'I1',status:'not_started'}],
  privacyTestSha256:hash('development/ledger-review-delivery/persisted-privacy-check/claude-persisted-privacy.test.mjs'),
  legacyStateSha256:hash('development/ledger-review-delivery/persisted-privacy-check/calibration/legacy-state.json')});
console.log(JSON.stringify({runtimeSha,files:Object.keys(a).length,promptSha256:hash(path.join(sources.I0,'TASK.md')),
  freezeSha256:hash(path.join(batch,'freeze.json')),slots:['I0','I1'],realProviderRequests:0}));
