// Existing pinned toolchain, tracked-source export, local-only provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {captureOutputs,outputRoot} from '../native-output-retention/output-files.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const image='sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6';
const tool=path.resolve(root,'../verified-change-harness/local/template-toolchain-20260908/package/bin/opencode');
const dependencies=root+'/local/native-task-integrated/plain-dependencies';
const name='direct-assertion-'+Date.now(),output=root+'/local/direct-assertion-review/'+name;
fs.mkdirSync(output,{recursive:true,mode:0o700});
const command=(bin,args,options={})=>{const r=spawnSync(bin,args,{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr);return r.stdout?.trim();};
const docker=args=>command('docker',args);
// No host .git, credentials, private captures or unrelated directories mounted.
const source=output+'/source';fs.mkdirSync(source);
const fd=fs.openSync(output+'/source.tar','w');try{command('git',['archive','--format=tar','HEAD'],{stdio:['ignore',fd,'pipe']});}finally{fs.closeSync(fd);}
command('tar',['-xf',output+'/source.tar','-C',source]);
fs.copyFileSync(root+'/lib/native-task-workflow.mjs',source+'/lib/native-task-workflow.mjs');
fs.cpSync(root+'/development/direct-assertion-review',source+'/development/direct-assertion-review',{recursive:true});
fs.mkdirSync(source+'/local/native-task-integrated/plain-dependencies',{recursive:true});
const id=docker(['run','--detach','--name',name,'--init','--pull=never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','512','--memory','3072m','--cpus','2','--user','node','--tmpfs','/tmp:rw,exec,nosuid,size=512m','--tmpfs','/work:rw,exec,nosuid,uid=1000,gid=1000,mode=0700,size=1536m','--env','HOME=/work','--env','XDG_DATA_HOME=/work/data','--mount',`type=bind,source=${source},target=/repo,readonly`,'--mount',`type=bind,source=${dependencies},target=/repo/local/native-task-integrated/plain-dependencies,readonly`,'--mount',`type=bind,source=${tool},target=/opt/opencode,readonly`,'--workdir','/repo',image,'sleep','1800']);
const checks=[];
for(const entry of ['development/direct-assertion-review/verify.mjs','scripts/verify-native-task.mjs','scripts/verify-native-template.mjs','scripts/verify-native-review.mjs']) {
  const start=Date.now(),r=spawnSync('docker',['exec',name,'timeout','180','node',entry],{encoding:'utf8',timeout:190000,maxBuffer:8*1024*1024});
  const file=path.basename(entry)+'.log';fs.writeFileSync(output+'/'+file,r.stdout+'\n'+r.stderr);
  checks.push({entry,exit:r.status,signal:r.signal,durationMs:Date.now()-start,log:file});
  fs.writeFileSync(output+'/checks.json',JSON.stringify(checks,null,2)+'\n');
  console.log(JSON.stringify(checks.at(-1)));
  if(r.status!==0){console.error('Check failed; retained source',name,output);process.exit(1);}
}
const started=Date.now();
const child=spawn('docker',['exec',name,'node','/repo/development/direct-assertion-review/installed.mjs'],{stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',x=>{stdout+=x;});child.stderr.on('data',x=>{stderr+=x;process.stderr.write(x);});
const timer=setTimeout(()=>child.kill('SIGTERM'),600000);
const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);}).finally(()=>clearTimeout(timer));
fs.writeFileSync(output+'/installed.log',stdout+'\n'+stderr);
fs.writeFileSync(output+'/container.json',JSON.stringify({name,id,status,durationMs:Date.now()-started}));
const copied=spawnSync('docker',['exec',name,'node','-e',"const fs=require('fs');console.log(JSON.stringify(Object.fromEntries(fs.readdirSync('/work/evidence').map(n=>[n,fs.readFileSync('/work/evidence/'+n).toString('base64')]))))"],{encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});
if(copied.status===0)for(const [n,bytes] of Object.entries(JSON.parse(copied.stdout))){assert.ok(/^[\w.-]+$/.test(n));fs.writeFileSync(output+'/'+n,Buffer.from(bytes,'base64'),{mode:0o600});}
if(copied.status!==0||status!==0){console.error('Installed attempt failed; retained source:',name,output);process.exitCode=1;}
else {
  const captured=captureOutputs({name,evidenceIdentity:{id,name,root:outputRoot,node:'node'}},output);
  assert.equal(captured.status,0,JSON.stringify(captured.manifest));
  const summary=JSON.parse(stdout.trim().split('\n').at(-1));
  summary.retention=captured.manifest;summary.checks=checks;summary.durationMs=Date.now()-started;
  // Termination verified by the installed path before source removal.
  docker(['rm','--force',name]);
  summary.sourceRemoved=true;
  fs.writeFileSync(output+'/installed.json',JSON.stringify(summary,null,2)+'\n');
  fs.rmSync(source,{recursive:true,force:true});fs.unlinkSync(output+'/source.tar');
  console.log(JSON.stringify({output,sourceRemoved:true,requests:summary.results.map(r=>({mode:r.mode,requests:r.requests,status:r.status}))}));
}
