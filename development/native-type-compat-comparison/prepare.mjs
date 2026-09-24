import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const root=path.resolve('local/native-type-compat-comparison/batch'),dev=path.resolve('development/native-type-compat-comparison');
assert.ok(!fs.existsSync(root));fs.mkdirSync(root,{recursive:true,mode:0o700});
const archive=(repo,ref,to,paths=[])=>{fs.mkdirSync(to,{recursive:true});execFileSync('tar',['-xf','-','-C',to],{input:execFileSync('git',['archive',ref,...paths],{cwd:repo,maxBuffer:32*1024*1024})});};
const candidate='8264ce42ef198580af834dcb09df996ac1274f1d';archive(process.cwd(),candidate,root+'/candidate',['lib','profiles']);
const {materializeNativeTemplate}=await import(pathToFileURL(root+'/candidate/lib/native-template.mjs'));materializeNativeTemplate({repositoryRoot:root+'/candidate',outputDirectory:root+'/bundle',task:true});
const cfg=JSON.parse(fs.readFileSync(root+'/bundle/opencode.json'));cfg.instructions=['/template/core.md'];cfg.plugin=['file:///template/native-task-plugin.mjs'];fs.writeFileSync(root+'/bundle/opencode.json',JSON.stringify(cfg,null,2));
for(const name of ['node_modules','package-lock.json','rg'])fs.cpSync('local/native-task-integrated/plain-dependencies/'+name,root+'/bundle/'+name,{recursive:true,verbatimSymlinks:true});
assert.equal(createHash('sha256').update(fs.readFileSync(root+'/bundle/node_modules/typescript/lib/typescript.js')).digest('hex'),'569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39');
const repo=path.resolve('local/native-task-h00-transfer/sources/eventemitter3'),ref='b0144e940ace8add8f335a8adfbed9284eb419f3',deps=path.resolve('local/native-task-h00-transfer/baseline-inputs/eventemitter3/node_modules');
for(const task of ['A','B']){archive(repo,ref,root+'/inputs/'+task);fs.cpSync(deps,root+'/inputs/'+task+'/node_modules',{recursive:true,verbatimSymlinks:true});fs.copyFileSync(dev+'/tasks/'+task+'.md',root+'/inputs/'+task+'/TASK.md');}
const config=JSON.parse(fs.readFileSync('local/native-task-integrated/experiment-config.json'));
config.permission.external_directory={'*':'deny','/template/node_modules/typescript/lib/*':'allow','/usr/local/bin/*':'allow'};
fs.writeFileSync(root+'/experiment-config.json',JSON.stringify(config,null,2));fs.writeFileSync(root+'/sources.json',JSON.stringify({candidate,A:{project:'primus/eventemitter3',repo,ref,deps},B:{project:'primus/eventemitter3',repo,ref,deps}},null,2));
console.log(JSON.stringify({root,candidate,compilerHashVerified:true,providerRequests:0}));
