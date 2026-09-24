// Exact saved implementations; no evaluator or findings enter the review inputs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {manifest} from '../native-task-integrated/run.mjs';
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const get=p=>JSON.parse(fs.readFileSync(p));
export const save=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
const root=path.resolve('local/ledger-review-diagnostic'),dev='development/ledger-review-diagnostic',old='local/plain-ledger-native-high';
fs.mkdirSync(root,{mode:0o700});
const prior=get(old+'/prepared.json'),task=fs.readFileSync('development/plain-ledger-native-high/original-task.txt');
assert.equal(hash(task),'c855e75f5b4705f703f5c4c39e01d05c73505854c32a4ff97dd5d564e82573eb');
const baselineTar=old+'/baseline.tar',referenceTar=old+'/reference.tar';
assert.equal(hash(fs.readFileSync(baselineTar)),'ea549fcc30d8facef77af8ebebc280910a24537e44ad8c6cfcbdc4888b5dcab1');
assert.equal(hash(fs.readFileSync(referenceTar)),'15d78b59aa6818fb0c55cd29b4ac30f8fb3c4d5ae808083632a09746bff12348');
const git=(dir,...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',maxBuffer:16*1024*1024});
const init=dir=>{git(dir,'init','-q');git(dir,'add','.');git(dir,'-c','core.hooksPath=/dev/null','-c','user.name=Diagnostic','-c','user.email=diagnostic@localhost','commit','-qm','Baseline');git(dir,'reflog','expire','--expire=all','--all');};
const compat='development/plain-ledger-native-high/reference-compatibility.patch';assert.equal(hash(fs.readFileSync(compat)),get('development/plain-ledger-native-high/reference-compatibility-receipts.json').patchSha256);
const control=root+'/restored-control';fs.mkdirSync(control);execFileSync('tar',['-xf',referenceTar,'-C',control]);init(control);git(control,'apply',path.resolve(compat));
assert.deepEqual(manifest(control),manifest(path.resolve(old+'/reference-compat-fixed')));
const receipts=[];
for(const group of ['calibration-receipts','reference-compatibility-receipts'])for(const r of get('development/plain-ledger-native-high/'+group+'.json').receipts){const b=fs.readFileSync(r.file);assert.equal(hash(b),r.sha256);if(r.bytes!==undefined)assert.equal(b.length,r.bytes);receipts.push({file:r.file,sha256:r.sha256,bytes:b.length,exitCode:r.exitCode});}
const assignments=[],inputManifests={};
for(const [i,arm]of ['candidate-A','candidate-B'].entries()){
 const source=root+'/'+arm;fs.mkdirSync(source);execFileSync('tar',['-xf',baselineTar,'-C',source]);init(source);const base=git(source,'rev-parse','HEAD').trim();
 if(i===0)git(source,'apply',path.resolve('development/direct-assertion-review/model-pair/AR0.patch'));
 else {for(const n of fs.readdirSync(source))if(n!=='.git')fs.rmSync(source+'/'+n,{recursive:true,force:true});for(const n of fs.readdirSync(control))if(n!=='.git')fs.cpSync(control+'/'+n,source+'/'+n,{recursive:true,verbatimSymlinks:true});}
 const index=source+'/.git/review-export-index';const env={...process.env,GIT_INDEX_FILE:index};for(const args of [['read-tree',base],['add','-A']])execFileSync('git',args,{cwd:source,env});
 const patch=execFileSync('git',['diff','--cached','--binary','--full-index',base],{cwd:source,env});fs.writeFileSync(root+'/'+arm+'.patch',patch,{mode:0o600});fs.unlinkSync(index);
 fs.appendFileSync(source+'/.git/info/exclude','\n/TASK.md\n');fs.writeFileSync(source+'/TASK.md',task);inputManifests['account-switch-ledger-'+arm]=manifest(source);
 assignments.push({slot:i+1,task:'account-switch-ledger',arm,project:'Tah10n/viberacing',source,base,patchSha256:hash(patch),patchBytes:patch.length,treeSha256:hash(JSON.stringify(inputManifests['account-switch-ledger-'+arm]))});
}
save(root+'/private-assessment.json',{mapping:{'candidate-A':'unchanged historical AR0','candidate-B':'reference plus saved compatibility patch'},known:get('development/direct-assertion-review/model-pair/AR0-assessment.json').findings,sourceReview:get('development/direct-assertion-review/model-pair/AR0-assessment.json').sourceReview,receipts});
const bundle=root+'/bundle';execFileSync(process.execPath,['scripts/profile-materialize.mjs','--native','--profile','core','--review','--output',bundle]);
const c=get(bundle+'/opencode.json'),originalURL=Buffer.from('file://'+bundle+'/review-context.mjs').toString('base64');assert.ok(c.command['harness-review'].template.includes(originalURL));
c.instructions=['/template/core.md'];c.command['harness-review'].template=c.command['harness-review'].template.replace(originalURL,Buffer.from('file:///template/review-context.mjs').toString('base64'));fs.writeFileSync(bundle+'/opencode.json',JSON.stringify(c,null,2)+'\n');
for(const n of ['node_modules','package.json','package-lock.json','rg'])fs.cpSync(prior.dependencies+'/'+n,bundle+'/'+n,{recursive:true,verbatimSymlinks:true});
fs.writeFileSync(bundle+'/.gitignore','node_modules\npackage.json\npackage-lock.json\n',{flag:'wx'});
const config=structuredClone(prior.config);config.permission.webfetch='deny';
const prepared={version:1,experimentKind:'ledger-review-diagnostic',runtimeSha:'ab7e6e1d153b996c577d96708c1e1fb84f57cbd3',image:prior.image,model:prior.model,variant:prior.variant,budgetMs:600000,strategy:'diagnostic-review',preflightPassed:false,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,toolchain:prior.toolchain,template:bundle,config,attempts:assignments.map(({slot,task,arm,project,source})=>({slot,task,arm,project,source})),inputManifests,runtimeManifests:{[bundle]:manifest(bundle)},files:{}};
save(root+'/prepared.json',prepared);
save(dev+'/provenance.json',{baseline:'2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd',reference:'9e389a6dbc1b0c9813599fb61eceb6958d8c4de4',taskSha256:hash(task),taskBytes:task.length,assignments:assignments.map(({source,...r})=>r),controlMatchesSavedCalibration:true,calibrationReceipts:receipts,privateAssessmentSha256:hash(fs.readFileSync(root+'/private-assessment.json')),bundleSha256:hash(JSON.stringify(manifest(bundle))),installationPathMappingOnly:true,realProviderRequests:0});
console.log('Exact candidates and saved calibration verified; review-only bundle prepared.');
