import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {manifest} from '../../native-task-integrated/run.mjs';
const local=path.resolve('local/direct-assertion-review-model-pair'),dev='development/direct-assertion-review/model-pair',oldDev='development/plain-ledger-native-high';
const hash=b=>createHash('sha256').update(b).digest('hex'),get=p=>JSON.parse(fs.readFileSync(p)),save=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
fs.mkdirSync(local,{mode:0o700});
const old=get('local/plain-ledger-native-high/prepared.json');
const candidates={AR0:'ca72c444b06b3be096cfa22aa6a82968e807a994',AR1:'8facea83bec3203ed500ee6884278d2df06b8c2b'},templates={},runtimeManifests={},prompts={};
for(const [arm,ref]of Object.entries(candidates)){
 const source=local+'/'+arm+'-runtime',bundle=local+'/'+arm+'-bundle';fs.mkdirSync(source);
 const fd=fs.openSync(local+'/'+arm+'.tar','wx');try{execFileSync('git',['archive','--format=tar',ref],{stdio:['ignore',fd,'pipe']});}finally{fs.closeSync(fd);}
 execFileSync('tar',['-xf',local+'/'+arm+'.tar','-C',source]);
 const {materializeNativeTemplate}=await import(pathToFileURL(source+'/lib/native-template.mjs'));materializeNativeTemplate({repositoryRoot:source,outputDirectory:bundle,task:true});
 const c=get(bundle+'/opencode.json');c.instructions=['/template/core.md'];c.plugin=['file:///template/native-task-plugin.mjs'];fs.writeFileSync(bundle+'/opencode.json',JSON.stringify(c,null,2)+'\n');
 for(const name of ['node_modules','package.json','package-lock.json','rg'])fs.cpSync(old.dependencies+'/'+name,bundle+'/'+name,{recursive:true,verbatimSymlinks:true});
 templates[arm]=bundle;runtimeManifests[bundle]=manifest(bundle);
 const {runWorkflow}=await import(pathToFileURL(bundle+'/native-task-workflow.mjs'));const pp=[];
 await runWorkflow({capture:()=>({status:'captured',snapshotSha256:'fixed',diff:'',task:'PUBLIC_TASK'}),save:()=>{},messages:async()=>[],aborted:()=>false,checkActive:()=>{},terminalReason:()=>null,observe:()=>({reasons:[],limits:[],testChanges:[],checksCurrent:true}),prompt:async(role,text)=>{assert.equal(role,'author');pp.push(text);return {info:{finish:'stop'},parts:[]};}},{strategy:'direct'});
 assert.equal(pp.length,1);prompts[arm]=pp[0];fs.writeFileSync(dev+'/'+arm+'-initial-fixture-prompt.txt',pp[0],{flag:'wx'});
}
const m0=runtimeManifests[templates.AR0],m1=runtimeManifests[templates.AR1];assert.deepEqual(Object.keys(m0),Object.keys(m1));
const differences=Object.keys(m0).filter(k=>JSON.stringify(m0[k])!==JSON.stringify(m1[k]));assert.deepEqual(differences,['native-task-workflow.mjs']);
const block=prompts.AR1.slice(prompts.AR1.indexOf('During self-review,'),prompts.AR1.indexOf('\nOriginal task:'));
assert.equal(block.split(/\s+/).length,204);assert.equal(Buffer.byteLength(block),1505);assert.equal(prompts.AR1.replace('\n'+block,''),prompts.AR0);
const task=fs.readFileSync(oldDev+'/original-task.txt'),env=fs.readFileSync(oldDev+'/environment.txt'),prompt=Buffer.concat([task,env]);
assert.equal(hash(task),'c855e75f5b4705f703f5c4c39e01d05c73505854c32a4ff97dd5d564e82573eb');assert.equal(hash(env),'aa0afe37ca2ec1f3564642a02842d71472b72b88225069be22a4cbbe8fb114cc');assert.equal(hash(prompt),'1873295e7730dd9688759dbd93f98480bbe7a5f9d991f8f4f2b99f1a57f54082');fs.writeFileSync(dev+'/TASK.md',prompt,{flag:'wx'});
const tar='local/plain-ledger-native-high/baseline.tar';assert.equal(hash(fs.readFileSync(tar)),'ea549fcc30d8facef77af8ebebc280910a24537e44ad8c6cfcbdc4888b5dcab1');
const attempts=[],inputManifests={};for(const [i,arm]of ['AR0','AR1'].entries()){
 const source=local+'/'+arm+'-input';fs.mkdirSync(source);execFileSync('tar',['-xf',tar,'-C',source]);assert.ok(!fs.existsSync(source+'/.git'));fs.writeFileSync(source+'/TASK.md',prompt,{flag:'wx'});
 const inventory=manifest(source);assert.deepEqual(inventory,old.inputManifests['account-switch-ledger-P']);inputManifests['account-switch-ledger-'+arm]=inventory;
 attempts.push({slot:i+1,task:'account-switch-ledger',arm,project:'Tah10n/viberacing',source});
}
const receipt={candidates,differences,block:{words:204,bytes:1505,withSeparatorBytes:1506,sha256:hash(block)},promptRemovalExact:true,promptHashes:Object.fromEntries(Object.entries(prompts).map(([k,v])=>[k,hash(v)])),bundleManifests:Object.fromEntries(Object.entries(templates).map(([k,v])=>[k,hash(JSON.stringify(runtimeManifests[v]))])),pathHandling:'Only installation-generated instructions/plugin paths mapped explicitly to identical /template mount; no prompt normalization. UUIDs and runtime paths retained separately.',inputSha256:hash(JSON.stringify(inputManifests['account-switch-ledger-AR0'])),taskSha256:hash(task),environmentSha256:hash(env),fullPromptSha256:hash(prompt),realProviderRequests:0};save(dev+'/preparation.json',receipt);
const f={...old,experimentKind:'assertion-review-pair-preflight',runtimeSha:candidates.AR1,candidates,templates,template:templates.AR1,attempts,inputManifests,runtimeManifests,files:{}};save(local+'/prepared.json',f);
console.log(JSON.stringify(receipt));
