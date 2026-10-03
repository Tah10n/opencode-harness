// Model-free retained product and evaluation checks. No credential discovery.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const checks=['template','review','task','command-hints','project-feedback','preservation-nudge','preservation-hooks','task-investigation','task-investigation-delivery','stateful','sensitivity','sensitivity-dependencies','type-compat','type-compat-hooks'];
const env={...process.env,HARNESS_TASK_TYPE_COMPAT_COMPILER:path.join(root,'node_modules/typescript/lib/typescript.js')};
for(const file of [...checks.map(n=>'scripts/verify-native-'+n+'.mjs'),'scripts/verify-large-git.mjs','scripts/verify-boundary.mjs','evaluation/support/verify-input-admission.mjs','evaluation/support/verify-scheduler.mjs','evaluation/support/verify-recording.mjs','evaluation/polybench/verify.py','evaluation/feedback-development/verify.mjs']){
 const result=spawnSync(file.endsWith('.py')?'python3':process.execPath,[file],{cwd:root,env,encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024});
 if(result.status!==0){process.stderr.write(result.stdout??'');process.stderr.write(result.stderr??'');throw result.error??Error(file+' failed ('+result.status+')');}
 console.log('PASS '+file);
}
