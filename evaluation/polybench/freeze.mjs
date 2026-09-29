// Final admission freeze: no provider activity; requires all ten complete controls.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {manifest} from '../support/manifest.mjs';
import {local,campaign,selectionPath,arms,configPath} from './campaign.mjs';
const dev=path.resolve('evaluation/polybench'),root=local+'/batch';
assert.ok(!fs.existsSync(root),'Never replace a frozen or started batch');
execFileSync('python3',[dev+'/verify.py',...(campaign?['--consolidated-dataset']:[])],{stdio:'inherit'});
const get=file=>JSON.parse(fs.readFileSync(file)),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const selection=get(selectionPath),environments=get(local+'/environments.json'),images=get(local+'/images.json');
assert.equal(selection.selected.length,campaign?20:10);assert.equal(selection.slots.length,campaign?60:30);
execFileSync('python3',['-B','-c','from evaluator_integrity import verify; verify('+JSON.stringify(local+'/evaluator')+')'],{cwd:dev,stdio:'inherit'});
const preparation=campaign?get(local+'/preparation.json'):null;
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:local+'/evaluator',encoding:'utf8'}).trim(),'9c836c5d7f3cb991934132b77d29e6941d912a07');
assert.equal(execFileSync('git',['diff','HEAD','--','src'],{cwd:local+'/evaluator',encoding:'utf8'}).trim(),'');
const runtime=get(local+'/runtime.json');
if(campaign){assert.equal(runtime.model,campaign.model);assert.equal(runtime.variant,campaign.effort);assert.equal(runtime.opencode,campaign.opencode);}
if(campaign){
 for(const bundle of ['bundle','core-bundle']){
  const original=execFileSync('git',['show',runtime.sha+':profiles/native/core.md']);
  assert.ok(original.equals(fs.readFileSync(local+'/'+bundle+'/core.md')));
  for(const file of fs.readdirSync(local+'/'+bundle).filter(n=>n.endsWith('.mjs')))
   assert.ok(execFileSync('git',['show',runtime.sha+':lib/'+file]).equals(fs.readFileSync(local+'/'+bundle+'/'+file)),'Product module changed: '+file);
 }
 const core=get(local+'/core-bundle/opencode.json'),task=get(local+'/bundle/opencode.json');
 assert.equal(core.plugin,undefined);assert.equal(core.command,undefined);
 assert.deepEqual(Object.keys(task.command),['harness-task']);
 assert.ok(!fs.existsSync(local+'/plain-dependencies/core.md')&&!fs.existsSync(local+'/plain-dependencies/opencode.json'));
}
const adapterSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!campaign)assert.equal(adapterSha,runtime.sha);else assert.equal(runtime.sha,campaign.product_sha);
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'');
const tasks=[];const runtimeManifests={},inputManifests={};
fs.mkdirSync(local+'/prompts',{recursive:true});
for(const row of selection.selected){
 if(campaign){const prepared=preparation[row.instance_id];assert.ok(prepared&&['ready','preparation_error'].includes(prepared.status),'Every selected task needs preparation disposition');if(prepared.status==='preparation_error'){tasks.push({...row,preparation:prepared});continue;}}
 const id=row.instance_id,folder=local+'/author-inputs/'+id,source=folder+'/source',environment=environments[source];assert.ok(environment);
 const controls={};
 for(const mode of ['gold','baseline']){
  const base=local+'/controls/'+id+'-'+mode,provenance=get(base+'/provenance.json'),file=base+'/results/'+id+'_result.json',result=get(file);
  assert.deepEqual(provenance.instances,[id]);assert.equal(provenance.evaluator,'9c836c5d7f3cb991934132b77d29e6941d912a07');
  assert.equal(provenance.subset_sha256,hash(local+'/'+id+'.csv'));
  assert.equal(provenance.images['polybench_'+row.language.toLowerCase()+'_'+id.toLowerCase()].digest,images['polybench_'+row.language.toLowerCase()+'_'+id.toLowerCase()].digest);
  assert.equal(result.resolved,mode==='gold');assert.ok(result.passed_tests.length+result.failed_tests.length>0);
  controls[mode]={resultSha256:hash(file),resolved:result.resolved,passed:result.passed_tests.length,failed:result.failed_tests.length};
 }
 const preflight=campaign?local+'/scripted-preflight-final/verification.json':local+'/preflight-final-'+id+'/verification.json';assert.equal(get(preflight).passed,true);
 assert.equal(get(folder+'/image-isolation.json').passed,true);assert.equal(get(folder+'/image-isolation.json').image,environment.image);assert.equal(get(folder+'/image.json').author_image,environment.image);
 if(!campaign)assert.deepEqual(get(local+'/preflight-final-'+id+'/freeze.json').environments[source],environment);
 const lfsAudit=get(folder+'/lfs-audit.json');
 const audit=get(folder+'/audit.json');assert.equal(audit.base_commit,row.base_commit);assert.equal(audit.future_git_objects_present,false);
 if(campaign)assert.equal(get(folder+'/base-preservation.json').passed,true);
 if(campaign){const envAudit=get(folder+'/image-environment.json');assert.equal(envAudit.passed,true);assert.equal(envAudit.image,environment.image);}
 if(audit.prepared_extra)assert.equal(audit.prepared_extra.sha256,hash(local+'/extra/'+id+'/prepared.tar'));
 const brokenLinks=audit.dependency_links.filter(link=>!link.exists);
 if(brokenLinks.length){const probe=get(folder+'/original-link-probe.json');assert.equal(probe.exit,0);for(const link of brokenLinks)assert.ok(probe.stdout.split('\n').includes('MISSING '+link.path),'Preparation broke a dependency link');}
 const official=images['polybench_'+row.language.toLowerCase()+'_'+id.toLowerCase()];assert.ok(official.digest.includes('@sha256:'));
 const installed=JSON.parse(execFileSync('docker',['image','inspect',environment.image],{encoding:'utf8'}))[0];assert.equal(installed.Id,environment.image);
 const sourceManifest=manifest(source);if(!campaign)assert.deepEqual(get(local+'/preflight-final-'+id+'/freeze.json').inputManifests[id+'-P'],sourceManifest);runtimeManifests[source]=sourceManifest;
 for(const arm of arms)inputManifests[id+'-'+arm]=sourceManifest;
 fs.copyFileSync(source+'/TASK.md',local+'/prompts/'+id+'.md');
 tasks.push({...row,officialImage:official,authorImage:environment.image,projectNode:environment.projectNode,npm:environment.npm,promptSha256:hash(source+'/TASK.md'),originalRowCsvSha256:hash(local+'/'+id+'.csv'),lfsAuditSha256:hash(folder+'/lfs-audit.json'),archives:audit.archives,submodules:audit.submodules,preparedExtra:audit.prepared_extra??null,controls,scriptedPreflightSha256:hash(preflight),isolationSha256:hash(folder+'/image-isolation.json')});
}
assert.equal(get(local+'/recorder-fixture/result.json').passed,true);
assert.equal(get(local+'/container-preflight-final/verification.json').passed,true);
if(campaign){assert.equal(get(local+'/capture-shape-check/verification.json').passed,true);assert.equal(get(local+'/scripted-preflight-final/verification.json').official_export_control.patch_applied,true);}
for(const dir of campaign?['bundle','core-bundle','plain-dependencies']:['bundle','plain-dependencies'])runtimeManifests[local+'/'+dir]=manifest(local+'/'+dir);
const files={};for(const name of ['run.mjs','capture.mjs','dependencies.mjs','evaluate.py','evaluate_predictions.py','collect.py','results.py','requirements.lock'])files[dev+'/'+name]=hash(dev+'/'+name);
for(const name of fs.readdirSync(path.resolve('evaluation/support')).filter(n=>n.endsWith('.mjs')||n.endsWith('.py'))){const file=path.resolve('evaluation/support',name);files[file]=hash(file);}
files[path.resolve('fixtures/native-offline/build.json')]=hash('fixtures/native-offline/build.json');
files[selectionPath]=hash(selectionPath);if(configPath)files[configPath]=hash(configPath);
for(const name of fs.readdirSync(dev).filter(n=>/\.(mjs|py)$/.test(n)))files[dev+'/'+name]=hash(dev+'/'+name);
const toolchain=local+'/toolchain';files[toolchain+'/package/bin/opencode']=hash(toolchain+'/package/bin/opencode');
const attempts=selection.slots.map(s=>({slot:s.slot,task:s.instance_id,arm:s.arm,project:selection.selected.find(r=>r.instance_id===s.instance_id).repo,source:local+'/author-inputs/'+s.instance_id+'/source',...(campaign?{preparationStatus:preparation[s.instance_id].status}:{})}));
const frozen={version:1,experimentKind:'polybench',...(campaign?{campaign:campaign.name,preparation,templates:{P:local+'/plain-dependencies',C:local+'/core-bundle',T:local+'/bundle'},recordingProfile:campaign.recording_profile,adapterSha}:{}),runtimeSha:runtime.sha,model:runtime.model,variant:runtime.variant,budgetMs:1800000,strategy:'direct',preflightPassed:true,controlsPassed:true,authorIsolationPassed:true,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,toolchain,template:local+'/bundle',dependencies:local+'/plain-dependencies',config:get(local+'/experiment-config.json'),attempts,environments,inputManifests,runtimeManifests,files};
fs.mkdirSync(root,{mode:0o700});fs.writeFileSync(root+'/freeze.json',JSON.stringify(frozen));
const published={version:1,stage:'frozen_before_model_requests',runtimeSha:frozen.runtimeSha,evaluatorSha:'9c836c5d7f3cb991934132b77d29e6941d912a07',datasetRevision:selection.dataset_revision,datasetSha256:selection.dataset_sha256,selectedCsvSha256:hash(local+'/selected.csv'),freezeSha256:hash(root+'/freeze.json'),model:frozen.model,opencode:'1.18.26',reasoning:runtime.variant,budgetSeconds:1800,flags:{STRATEGY:'direct',CONTEXT:0,CHECKS:0,SENSITIVITY:0,INVESTIGATION:0,COMMAND_HINTS:0,EXTRA_ATTENTION:0,TYPE_COMPAT:{P:'absent',H0:0,H1:1}},compiler:{version:'6.0.3',profile:'returned-callable-strict-v1',maxAnalyses:2,maxSecondsPerAnalysis:60,maxTotalSeconds:120},tasks,slots:selection.slots,realProviderRequestsBeforeFreeze:0};
if(campaign){
 published.campaign=campaign.name;published.productSha=runtime.sha;published.adapterSha=adapterSha;
 published.flags={STRATEGY:'direct',CONTEXT:0,CHECKS:0,TYPE_COMPAT:0,SENSITIVITY:0,INVESTIGATION:{P:'absent',C:'absent',T:1},COMMAND_HINTS:0,EXTRA_ATTENTION:0,PRESERVATION_NUDGE:0};delete published.compiler;
 published.recordingProfile=campaign.recording_profile;
 published.installedHashes=Object.fromEntries(['bundle','core-bundle','plain-dependencies'].map(dir=>[dir,createHash('sha256').update(JSON.stringify(manifest(local+'/'+dir))).digest('hex')]));
 published.configurationSha256=hash(local+'/experiment-config.json');
 published.preparation=preparation;
}
fs.writeFileSync(root+'/manifest.json',JSON.stringify(published,null,2)+'\n');
console.log('Freeze prepared locally. Review batch/manifest.json; running requires --authorize-model-runs.');
