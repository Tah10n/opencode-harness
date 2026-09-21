// Existing image/toolchain only; private scripted captures precede source removal.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {captureOutputs,outputRoot,hashFile} from '../../../native-output-retention/output-files.mjs';
const root=path.resolve('local/preservation-nudge-revision-2-model-pair/source-export');
const tool=path.resolve('../verified-change-harness/local/template-toolchain-20260908/package/bin/opencode');
assert.ok(fs.existsSync(tool));
const image='sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6';
const container='preservation-r2-'+Date.now();
const output=path.resolve('local/preservation-nudge-revision-2-model-pair/advisory');fs.mkdirSync(output,{recursive:true,mode:0o700});
const docker=args=>{const r=spawnSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const id=docker(['run','--detach','--name',container,'--init','--pull=never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','512','--memory','3072m','--cpus','2','--user','node','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--tmpfs','/work:rw,exec,nosuid,uid=1000,gid=1000,mode=0700,size=1536m','--env','XDG_DATA_HOME=/work/data','--env','PRESERVATION_MODES=parcel','--mount',`type=bind,source=${root},target=/repo,readonly`,'--mount',`type=bind,source=${tool},target=/opt/opencode,readonly`,image,'sleep','1800']);
const child=spawn('docker',['exec',container,'node','/repo/scripts/verify-native-preservation-installed.mjs'],{stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',x=>{stdout+=x;process.stdout.write(x);});child.stderr.on('data',x=>{stderr+=x;process.stderr.write(x);});
const timer=setTimeout(()=>child.kill('SIGTERM'),600000);
const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);}).finally(()=>clearTimeout(timer));
fs.writeFileSync(output+'/installed.log',stdout+'\n'+stderr);
// Reuse the repaired collector unchanged. Fail closed: leave this named source
// if export is incomplete, with its identity and attempt log for recovery.
fs.writeFileSync(output+'/container.json',JSON.stringify({name:container,id,status}));
const copied=spawnSync('docker',['exec',container,'node','-e',"const fs=require('fs');console.log(JSON.stringify(Object.fromEntries(fs.readdirSync('/work/evidence').map(n=>[n,fs.readFileSync('/work/evidence/'+n).toString('base64')]))))"],{encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});
if(copied.status===0)for(const [name,bytes] of Object.entries(JSON.parse(copied.stdout))){assert.ok(/^[\w.-]+$/.test(name));fs.writeFileSync(output+'/'+name,Buffer.from(bytes,'base64'),{mode:0o600});}
if(copied.status!==0)console.error(copied.stderr);
if(copied.status!==0 || status!==0){console.error('Scripted attempt failed; source retained:',container,output);process.exitCode=1;}
else {
  const captured=captureOutputs({name:container,evidenceIdentity:{id,name:container,root:outputRoot,node:'node'}},output);
  assert.equal(captured.status,0,JSON.stringify(captured.manifest));
  const summary=JSON.parse(stdout.trim().split('\n').at(-1));
  if(summary.results.some(r=>r.mode==='parcel')){
    assert.equal(captured.manifest.files.length,1);
    const entry=captured.manifest.files[0];assert.equal(entry.archiveComplete,true);assert.equal(entry.linkStatus,'linked');
    assert.deepEqual(hashFile(output+'/'+entry.destination),{size:entry.size,sha256:entry.sha256});
    const expected=Buffer.from(Array.from({length:5000},(_,i)=>(i===0?'BEGIN':i===2500?'HIDDEN_MIDDLE':i===4999?'END':'LINE')+':'+i+':'+'x'.repeat(60)+'\n').join(''));
    assert.deepEqual(fs.readFileSync(output+'/'+entry.destination),expected);
    const evidence=JSON.parse(fs.readFileSync(output+'/native-evidence.json'));
    assert.ok(!JSON.stringify(evidence).includes('HIDDEN_MIDDLE:2500:'));
    for(const n of fs.readdirSync(output).filter(n=>/-request-\d+\.json$/.test(n)))assert.ok(!fs.readFileSync(output+'/'+n,'utf8').includes('HIDDEN_MIDDLE:2500:'));
  }
  summary.retention={evidenceComplete:captured.manifest.evidenceComplete,files:captured.manifest.files.map(f=>({size:f.size,sha256:f.sha256,archiveComplete:f.archiveComplete,linkStatus:f.linkStatus})),hiddenTailInRequests:false};
  fs.writeFileSync(output+'/installed.json',JSON.stringify(summary,null,2)+'\n');
  docker(['rm','--force',container]);console.log(JSON.stringify({output,sourceRemoved:true}));
}
