import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {manifest} from '../native-task-integrated/run.mjs';
import {image} from '../native-task-integrated/container-session.mjs';
const local=path.resolve('local/plain-ledger-native-high'),dev='development/plain-ledger-native-high';
const sha=b=>createHash('sha256').update(b).digest('hex');
const save=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const archive=fs.readFileSync(local+'/baseline.tar');
assert.equal(sha(archive),'ea549fcc30d8facef77af8ebebc280910a24537e44ad8c6cfcbdc4888b5dcab1');
const task=fs.readFileSync(dev+'/original-task.txt');
assert.equal(sha(task),'c855e75f5b4705f703f5c4c39e01d05c73505854c32a4ff97dd5d564e82573eb');
const source=local+'/author-input';fs.mkdirSync(source,{mode:0o700});
execFileSync('tar',['-xf',local+'/baseline.tar','-C',source]);
assert.ok(!fs.existsSync(source+'/.git'));
assert.deepEqual(manifest(source),manifest(local+'/baseline'));
fs.writeFileSync(source+'/TASK.md',Buffer.concat([task,fs.readFileSync(dev+'/environment.txt')]),{flag:'wx'});
const prior=JSON.parse(fs.readFileSync('local/plain-mui-18141/prepared.json'));
const dependencies=prior.dependencies,dependencyManifest=manifest(dependencies);
assert.deepEqual(dependencyManifest,prior.runtimeManifests[dependencies]);
assert.ok(!fs.existsSync(dependencies+'/core.md'));
const config=structuredClone(prior.config);
config.permission.external_directory={'*':'deny'};
const f={version:1,experimentKind:'plain-ledger-native-high-preflight',runtimeSha:prior.runtimeSha,image,
 model:prior.model,variant:prior.variant,budgetMs:1800000,strategy:'direct',preflightPassed:true,
 streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,toolchain:prior.toolchain,
 template:dependencies,dependencies,config,
 attempts:[{slot:1,task:'account-switch-ledger',arm:'P',project:'Tah10n/viberacing',source}],
 inputManifests:{'account-switch-ledger-P':manifest(source)},runtimeManifests:{[dependencies]:dependencyManifest},files:{}};
save(local+'/prepared.json',f);
save(local+'/input-receipt.json',{baseline:'2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd',archiveSha256:sha(archive),
 originalTaskSha256:sha(task),environmentSha256:sha(fs.readFileSync(dev+'/environment.txt')),
 promptSha256:sha(fs.readFileSync(source+'/TASK.md')),sourceManifestSha256:sha(JSON.stringify(manifest(source))),
 dependenciesManifestSha256:sha(JSON.stringify(dependencyManifest)),gitHistoryAbsent:true,realProviderRequests:0});
console.log('Exact baseline and original task prepared; evaluator excluded.');
