// Reuse a prior scripted fixture only; no benchmark-input mutation/model request.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const root='local/polybench-pilot/recorder-fixture';
if(fs.existsSync(root+'/preflight.json')){
 if(JSON.parse(fs.readFileSync(root+'/preflight.json')).passed!==true)throw Error('Existing supported fixture did not pass');
}else{
 if(fs.existsSync(root))throw Error('Partial supported fixture preserved; inspect it');
 fs.mkdirSync(root,{recursive:true});
 fs.cpSync('local/native-type-compat-offline-subscribe/batch/inputs',root+'/inputs',{recursive:true,verbatimSymlinks:true});
 fs.cpSync('local/polybench-pilot/bundle',root+'/bundle',{recursive:true,verbatimSymlinks:true});
 fs.copyFileSync('local/native-type-compat-offline-subscribe/batch/experiment-config.json',root+'/experiment-config.json');
 execFileSync('node',['development/polybench-pilot/supported-preflight.mjs'],{stdio:'inherit'});
}
