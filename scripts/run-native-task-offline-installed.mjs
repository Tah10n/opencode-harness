// Existing image and toolchain only; no pulls, builds, credentials, provider relay or installs.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tool=path.resolve(root,'../verified-change-harness/local/template-toolchain-20260908/package/bin/opencode');
assert.ok(fs.existsSync(tool));
const image='sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6';
const container='offline-'+Date.now();
const child=spawn('docker',['run','--name',container,'--rm','--init','--pull=never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','512','--memory','3072m','--cpus','2','--user','node','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--tmpfs','/work:rw,exec,nosuid,uid=1000,gid=1000,mode=0700,size=1536m','--mount',`type=bind,source=${root},target=/repo,readonly`,'--mount',`type=bind,source=${tool},target=/opt/opencode,readonly`,image,'sh','-c','OPENCODE_BIN=/opt/opencode TMPDIR=/work node /repo/scripts/verify-native-template-config.mjs --offline && OPENCODE_BIN=/opt/opencode TMPDIR=/work node /repo/scripts/verify-native-template-config.mjs --review && node /repo/scripts/verify-native-task-offline-installed.mjs'],{stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',x=>{stdout+=x;if(x.toString().includes('"progress":'))process.stdout.write(x.toString().split("\n").filter(l=>l.startsWith('{"progress":')).join("\n")+"\n");});child.stderr.on('data',x=>{stderr+=x;process.stderr.write(x);});
const timer=setTimeout(()=>spawnSync('docker',['rm','--force',container],{timeout:15000}),900000);
const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);}).finally(()=>clearTimeout(timer));
const output=path.join(root,'local/native-task-offline-integration');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'installed.log'),stdout+'\n'+stderr);
for(const line of stdout.trim().split('\n')){let record;try{record=JSON.parse(line);}catch{continue;}if(record.privatePatch){fs.writeFileSync(path.join(output,record.privatePatch.mode+'.patch'),record.privatePatch.patch);}if(record.privateRequest){const r=record.privateRequest;fs.writeFileSync(path.join(output,r.mode+'-request-'+r.request+'.json'),Buffer.from(r.base64,'base64'));}}
assert.equal(status,0);
const summary=JSON.parse(stdout.trim().split('\n').at(-1));fs.writeFileSync(path.join(output,'installed.json'),JSON.stringify(summary,null,2)+'\n');
