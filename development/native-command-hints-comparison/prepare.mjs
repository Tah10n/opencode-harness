// One-off preparation of two public input projections; no provider access.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const root=path.resolve('local/native-command-hints-comparison/batch'),dev=path.resolve('development/native-command-hints-comparison');
assert.ok(!fs.existsSync(root),'Do not overwrite a prepared batch');fs.mkdirSync(root,{recursive:true});
const archive=(repo,ref,to,paths=[])=>{fs.mkdirSync(to,{recursive:true});const bytes=execFileSync('git',['archive',ref,...paths],{cwd:repo,maxBuffer:32*1024*1024});execFileSync('tar',['-xf','-','-C',to],{input:bytes});};
const candidate='c90fc7c78bcdd4d8288550b887f52990bafb11a6';archive(process.cwd(),candidate,root+'/candidate',['lib','profiles']);
const {materializeNativeTemplate}=await import(pathToFileURL(root+'/candidate/lib/native-template.mjs'));
materializeNativeTemplate({repositoryRoot:root+'/candidate',outputDirectory:root+'/bundle',task:true});
const bundleConfig=JSON.parse(fs.readFileSync(root+'/bundle/opencode.json'));bundleConfig.instructions=['/template/core.md'];bundleConfig.plugin=['file:///template/native-task-plugin.mjs'];fs.writeFileSync(root+'/bundle/opencode.json',JSON.stringify(bundleConfig,null,2)+'\n');
const deps=path.resolve('local/native-task-integrated/plain-dependencies');
for(const n of ['node_modules','package-lock.json','rg'])fs.cpSync(deps+'/'+n,root+'/bundle/'+n,{recursive:true,verbatimSymlinks:true});
const projects={A:{project:'unjs/ufo',ref:'f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6',repo:path.resolve('local/native-task-h00-transfer/sources/ufo'),deps:path.resolve('local/native-task-integrated/inputs/url-search-params/node_modules')},B:{project:'primus/eventemitter3',ref:'b0144e940ace8add8f335a8adfbed9284eb419f3',repo:path.resolve('local/native-task-h00-transfer/sources/eventemitter3'),deps:path.resolve('local/native-task-h00-transfer/baseline-inputs/eventemitter3/node_modules')}};
for(const [task,p]of Object.entries(projects)){const input=root+'/inputs/'+task;archive(p.repo,p.ref,input);fs.cpSync(p.deps,input+'/node_modules',{recursive:true,verbatimSymlinks:true});fs.copyFileSync(dev+'/tasks/'+task+'.md',input+'/TASK.md');}
const config=JSON.parse(fs.readFileSync('local/native-task-integrated/experiment-config.json'));config.permission.external_directory='allow';fs.writeFileSync(root+'/experiment-config.json',JSON.stringify(config,null,2)+'\n');fs.writeFileSync(root+'/sources.json',JSON.stringify(projects,null,2)+'\n');
console.log(JSON.stringify({prepared:root,candidate,sourceCommits:Object.fromEntries(Object.entries(projects).map(([k,v])=>[k,v.ref])),realRequests:0}));
