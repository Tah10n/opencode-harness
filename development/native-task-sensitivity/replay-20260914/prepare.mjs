// Prepare fresh installed bundles and public input copies; no provider requests.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {materializeNativeTemplate} from '../../../lib/native-template.mjs';
const root=path.resolve(process.argv[2]??'local/native-sensitivity/replay-20260914');
if(fs.existsSync(root))throw Error('Never replace an existing preparation');
fs.mkdirSync(root,{recursive:true});
const old=path.resolve('local/native-sensitivity/usage-20260914');
for(const name of ['bundle','baseline']){
 const bundle=path.join(root,name);materializeNativeTemplate({repositoryRoot:process.cwd(),outputDirectory:bundle,task:true});
 for(const n of ['node_modules','package-lock.json','rg'])fs.cpSync(path.join(old,'bundle',n),path.join(bundle,n),{recursive:true,verbatimSymlinks:true});
 fs.cpSync('profiles/native/sensitivity/node_modules',path.join(bundle,'sensitivity/node_modules'),{recursive:true,verbatimSymlinks:true});
 const config=JSON.parse(fs.readFileSync(bundle+'/opencode.json'));config.instructions=['/template/core.md'];config.plugin=['file:///template/native-task-plugin.mjs'];fs.writeFileSync(bundle+'/opencode.json',JSON.stringify(config,null,2)+'\n');
 if(name==='baseline')for(const n of ['native-sensitivity.mjs','native-sensitivity-runner.mjs','native-task-plugin.mjs'])fs.writeFileSync(bundle+'/'+n,execFileSync('git',['show','a91557782f71d4f546743d33d16cea4a571f86d4:lib/'+n]));
}
fs.copyFileSync(old+'/experiment-config.json',root+'/experiment-config.json');
const oldFreeze=JSON.parse(fs.readFileSync(old+'/freeze.json'));
fs.writeFileSync(root+'/preparation.json',JSON.stringify({toolchain:oldFreeze.toolchain,baselineRevision:'a91557782f71d4f546743d33d16cea4a571f86d4',realProviderRequests:0},null,2));
console.log(JSON.stringify({root,toolchain:oldFreeze.toolchain,realProviderRequests:0}));
