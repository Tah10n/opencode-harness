// Model-free preparation using the existing materializer and container adapters.
import fs from 'node:fs';
import path from 'node:path';
import {materializeNativeTemplate} from '../../../lib/native-template.mjs';
const root=path.resolve(process.argv[2]);
if(fs.existsSync(root))throw Error('Do not replace preparation');
fs.mkdirSync(root,{recursive:true});
materializeNativeTemplate({repositoryRoot:process.cwd(),outputDirectory:root+'/bundle',task:true});
const old=path.resolve('local/native-sensitivity/replay-20260914');
for(const n of ['node_modules','package-lock.json','rg'])fs.cpSync(old+'/bundle/'+n,root+'/bundle/'+n,{recursive:true,verbatimSymlinks:true});
fs.cpSync('profiles/native/sensitivity/node_modules',root+'/bundle/sensitivity/node_modules',{recursive:true,verbatimSymlinks:true});
const config=JSON.parse(fs.readFileSync(root+'/bundle/opencode.json'));config.instructions=['/template/core.md'];config.plugin=['file:///template/native-task-plugin.mjs'];fs.writeFileSync(root+'/bundle/opencode.json',JSON.stringify(config,null,2)+'\n');
fs.copyFileSync(old+'/experiment-config.json',root+'/experiment-config.json');
fs.writeFileSync(root+'/preparation.json',JSON.stringify({startedAt:new Date().toISOString(),runtimeSha:'46572619e8a9d567f680667bdf6083a2e82be406',toolchain:JSON.parse(fs.readFileSync('local/native-task-h00-transfer/freeze.json')).toolchain,realProviderRequests:0},null,2));
console.log(root);
