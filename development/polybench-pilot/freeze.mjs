// Final admission freeze: no provider activity; requires all ten complete controls.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {manifest} from '../native-task-integrated/run.mjs';
const local=path.resolve('local/polybench-pilot'),dev=path.resolve('development/polybench-pilot'),root=local+'/batch';
assert.ok(!fs.existsSync(root),'Never replace a frozen or started batch');
execFileSync('python3',[dev+'/verify.py'],{stdio:'inherit'});
const get=file=>JSON.parse(fs.readFileSync(file)),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const selection=get(dev+'/selection.json'),environments=get(local+'/environments.json'),images=get(local+'/images.json');
assert.equal(selection.selected.length,10);assert.equal(selection.slots.length,30);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:local+'/evaluator',encoding:'utf8'}).trim(),'9c836c5d7f3cb991934132b77d29e6941d912a07');
assert.equal(execFileSync('git',['diff','HEAD','--','src'],{cwd:local+'/evaluator',encoding:'utf8'}).trim(),'');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:local+'/runtime-checkout',encoding:'utf8'}).trim(),'e18db1fe10223db52dcc05b3e769bca140367c2b');
assert.equal(execFileSync('git',['diff','HEAD','--','lib','profiles'],{cwd:local+'/runtime-checkout',encoding:'utf8'}).trim(),'');
const tasks=[];const runtimeManifests={},inputManifests={};
fs.mkdirSync(dev+'/prompts',{recursive:true});
for(const row of selection.selected){
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
 const preflight=local+'/preflight-final-'+id+'/verification.json';assert.equal(get(preflight).passed,true);
 assert.equal(get(folder+'/image-isolation.json').passed,true);assert.equal(get(folder+'/image-isolation.json').image,environment.image);assert.equal(get(folder+'/image.json').author_image,environment.image);
 assert.deepEqual(get(local+'/preflight-final-'+id+'/freeze.json').environments[source],environment);
 const lfsAudit=get(folder+'/lfs-audit.json');
 const audit=get(folder+'/audit.json');assert.equal(audit.base_commit,row.base_commit);assert.equal(audit.future_git_objects_present,false);
 if(audit.prepared_extra)assert.equal(audit.prepared_extra.sha256,hash(local+'/extra/'+id+'/prepared.tar'));
 const brokenLinks=audit.dependency_links.filter(link=>!link.exists);
 if(brokenLinks.length){const probe=get(folder+'/original-link-probe.json');assert.equal(probe.exit,0);for(const link of brokenLinks)assert.ok(probe.stdout.split('\n').includes('MISSING '+link.path),'Preparation broke a dependency link');}
 const official=images['polybench_'+row.language.toLowerCase()+'_'+id.toLowerCase()];assert.ok(official.digest.includes('@sha256:'));
 const installed=JSON.parse(execFileSync('docker',['image','inspect',environment.image],{encoding:'utf8'}))[0];assert.equal(installed.Id,environment.image);
 const sourceManifest=manifest(source);assert.deepEqual(get(local+'/preflight-final-'+id+'/freeze.json').inputManifests[id+'-P'],sourceManifest);runtimeManifests[source]=sourceManifest;
 for(const arm of ['P','H0','H1'])inputManifests[id+'-'+arm]=sourceManifest;
 fs.copyFileSync(source+'/TASK.md',dev+'/prompts/'+id+'.md');
 tasks.push({...row,officialImage:official,authorImage:environment.image,projectNode:environment.projectNode,npm:environment.npm,promptSha256:hash(source+'/TASK.md'),originalRowCsvSha256:hash(local+'/'+id+'.csv'),lfsAuditSha256:hash(folder+'/lfs-audit.json'),archives:audit.archives,submodules:audit.submodules,preparedExtra:audit.prepared_extra??null,controls,scriptedPreflightSha256:hash(preflight),isolationSha256:hash(folder+'/image-isolation.json')});
}
assert.equal(get(local+'/recorder-fixture/preflight.json').passed,true);
assert.equal(get(local+'/container-preflight-final/verification.json').passed,true);
for(const dir of ['bundle','plain-dependencies'])runtimeManifests[local+'/'+dir]=manifest(local+'/'+dir);
const files={};for(const name of ['run.mjs','capture.mjs','dependencies.mjs','evaluate.py','evaluate_predictions.py','collect.py','results.py','requirements.lock','selection.json'])files[dev+'/'+name]=hash(dev+'/'+name);
for(const name of ['native-task-ab/run-comparison.mjs','native-task-abc/native-run.mjs','native-task-integrated/container-session.mjs','native-task-integrated/container-relay.mjs','native-task-utility/container/stop-workload.mjs','native-task-ab/extract-candidate.py','native-task-offline/build.json']){const file=path.resolve('development',name);files[file]=hash(file);}
const toolchain=path.resolve('../verified-change-harness/local/template-toolchain-20260908');files[toolchain+'/package/bin/opencode']=hash(toolchain+'/package/bin/opencode');
const attempts=selection.slots.map(s=>({slot:s.slot,task:s.instance_id,arm:s.arm,project:selection.selected.find(r=>r.instance_id===s.instance_id).repo,source:local+'/author-inputs/'+s.instance_id+'/source'}));
const frozen={version:1,experimentKind:'polybench-pilot',runtimeSha:'e18db1fe10223db52dcc05b3e769bca140367c2b',model:'openai/gpt-5.6-luna',variant:'high',budgetMs:1800000,strategy:'direct',preflightPassed:true,controlsPassed:true,authorIsolationPassed:true,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,toolchain,template:local+'/bundle',dependencies:local+'/plain-dependencies',config:get(local+'/experiment-config.json'),attempts,environments,inputManifests,runtimeManifests,files};
fs.mkdirSync(root,{mode:0o700});fs.writeFileSync(root+'/freeze.json',JSON.stringify(frozen));
const published={version:1,stage:'frozen_before_model_requests',runtimeSha:frozen.runtimeSha,evaluatorSha:'9c836c5d7f3cb991934132b77d29e6941d912a07',datasetRevision:selection.dataset_revision,datasetSha256:selection.dataset_sha256,selectedCsvSha256:hash(local+'/selected.csv'),freezeSha256:hash(root+'/freeze.json'),model:frozen.model,opencode:'1.18.26',reasoning:'high',budgetSeconds:1800,flags:{STRATEGY:'direct',CONTEXT:0,CHECKS:0,SENSITIVITY:0,INVESTIGATION:0,COMMAND_HINTS:0,EXTRA_ATTENTION:0,TYPE_COMPAT:{P:'absent',H0:0,H1:1}},compiler:{version:'6.0.3',profile:'returned-callable-strict-v1',maxAnalyses:2,maxSecondsPerAnalysis:60,maxTotalSeconds:120},tasks,slots:selection.slots,realProviderRequestsBeforeFreeze:0};
fs.writeFileSync(dev+'/frozen-manifest.json',JSON.stringify(published,null,2)+'\n');
console.log('Freeze prepared. Commit the safe manifest/adapter locally before writing batch/freeze-commit.json and running.');
