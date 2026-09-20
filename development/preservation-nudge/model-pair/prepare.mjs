// Local, model-free preparation of one immutable installed candidate and exact pilot input.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {manifest} from '../../native-task-integrated/run.mjs';
const local=path.resolve('local/preservation-nudge-model-pair'),pilot=path.resolve('local/polybench-pilot'),dev=path.resolve('development/preservation-nudge/model-pair');
const sha=x=>createHash('sha256').update(x).digest('hex'),get=p=>JSON.parse(fs.readFileSync(p)),save=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const candidate='fba1960cad4e2cf25831af1be8a21bea0361947d',id='sveltejs__svelte-1190';
const task=get('development/polybench-pilot/frozen-manifest.json').tasks.find(x=>x.instance_id===id),source=pilot+'/author-inputs/'+id+'/source';
assert.equal(sha(fs.readFileSync(source+'/TASK.md')),task.promptSha256);assert.ok(fs.readFileSync(source+'/TASK.md').equals(fs.readFileSync('development/polybench-pilot/prompts/'+id+'.md')));
for(const [name,h]of Object.entries(task.archives))assert.equal(sha(fs.readFileSync(pilot+'/author-inputs/'+id+'/'+name)),h);
assert.equal(sha(fs.readFileSync(pilot+'/'+id+'.csv')),task.originalRowCsvSha256);
fs.copyFileSync(source+'/TASK.md',dev+'/TASK.md');
if(!fs.existsSync(local+'/candidate'))execFileSync('git',['worktree','add','--detach',local+'/candidate',candidate],{stdio:'inherit'});
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:local+'/candidate',encoding:'utf8'}).trim(),candidate);
assert.equal(execFileSync('git',['status','--porcelain'],{cwd:local+'/candidate',encoding:'utf8'}).trim(),'');
if(!fs.existsSync(local+'/bundle')){
 const {materializeNativeTemplate}=await import(pathToFileURL(local+'/candidate/lib/native-template.mjs'));
 materializeNativeTemplate({repositoryRoot:local+'/candidate',outputDirectory:local+'/bundle',task:true});
 const c=get(local+'/bundle/opencode.json');c.instructions=['/template/core.md'];c.plugin=['file:///template/native-task-plugin.mjs'];save(local+'/bundle/opencode.json',c);
 for(const name of ['node_modules','package.json','package-lock.json','rg'])fs.cpSync(pilot+'/bundle/'+name,local+'/bundle/'+name,{recursive:true,verbatimSymlinks:true});
}
for(const name of ['native-task-plugin.mjs','native-task-observations.mjs','native-preservation-nudge.mjs'])assert.equal(sha(fs.readFileSync(local+'/bundle/'+name)),sha(fs.readFileSync(local+'/candidate/lib/'+name)));
const old=get(pilot+'/batch/freeze.json'),attempts=['OFF','ON'].map((arm,i)=>({slot:i+1,task:id,arm,project:'sveltejs/svelte',source}));
const sourceManifest=manifest(source);assert.deepEqual(sourceManifest,old.inputManifests[id+'-H0']);
const runtimeManifests={[local+'/bundle']:manifest(local+'/bundle')},inputManifests=Object.fromEntries(attempts.map(a=>[id+'-'+a.arm,sourceManifest]));
const base={version:1,experimentKind:'preservation-pair-preflight',runtimeSha:candidate,model:old.model,variant:old.variant,budgetMs:1800000,strategy:'direct',preflightPassed:true,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,toolchain:old.toolchain,template:local+'/bundle',dependencies:old.dependencies,config:old.config,attempts,environments:{[source]:old.environments[source]},inputManifests,runtimeManifests,files:{}};
save(local+'/prepared.json',base);save(local+'/input-receipt.json',{candidate,task,sourceManifestSha256:sha(JSON.stringify(sourceManifest)),bundleManifestSha256:sha(JSON.stringify(runtimeManifests)),promptBytes:fs.statSync(source+'/TASK.md').size,promptUnchanged:true,environmentBlockUnchanged:true,realProviderRequests:0});
console.log('Exact inputs and complete candidate bundle prepared; model requests: 0');
