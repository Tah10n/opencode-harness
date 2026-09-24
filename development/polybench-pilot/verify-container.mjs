import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {startContainer} from '../native-task-integrated/container-session.mjs';
const root=path.resolve('local/polybench-pilot');
const output=root+'/'+(process.argv[2]??'container-preflight');
const preparedEnvironment=JSON.parse(fs.readFileSync(root+'/environments.json'))[root+'/author-inputs/serverless__serverless-2434/source'];
const session=await startContainer({source:root+'/author-inputs/serverless__serverless-2434/source',toolchain:path.resolve('../verified-change-harness/local/template-toolchain-20260908'),template:root+'/bundle',output,preparedEnvironment,workMemoryMb:2048,memoryMb:4096,onRequest:()=>{throw Error('No provider requests permitted');}});
try{
 const run=argv=>{const r=session.exec(argv);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 assert.equal(run(['/opt/opencode','--version']),'1.18.26');
 assert.equal(run(['node','--version']),'v24.19.0');
 assert.equal(run(['bash','-lc','node --version']),'v16.20.2');
 assert.equal(run(['git','rev-list','--count','HEAD']),'1');
 assert.notEqual(session.exec(['git','cat-file','-e','cf927bf8a68496f762a55e5222415c808aa6087b']).status,0);
 run(['bash','-lc','test ! -e /testbed/.git && test ! -e /var/run/docker.sock && test ! -e /root/.local/share/opencode/auth.json && test ! -e /input/.git']);
 const inspect=JSON.parse(execFileSync('docker',['inspect',session.name],{encoding:'utf8'}))[0];
 assert.equal(inspect.HostConfig.NetworkMode,'none');assert.equal(inspect.HostConfig.Privileged,false);assert.equal(inspect.HostConfig.ReadonlyRootfs,true);
 assert.deepEqual(inspect.Mounts.map(m=>m.Destination).sort(),['/input','/opt/opencode','/relay.mjs','/template'].sort());
 assert.ok(inspect.Mounts.every(m=>m.RW===false));
 fs.writeFileSync(output+'/verification.json',JSON.stringify({passed:true,providerRequests:0,opencode:'1.18.26',projectNode:'16.20.2',diagnosticNode:'24.19.0',freshGitHistory:true,network:'none',readOnlyRoot:true,mounts:inspect.Mounts.map(m=>({destination:m.Destination,readOnly:!m.RW}))},null,2));
}finally{assert.equal(session.close(),0);}
console.log('Actual offline author container preflight passed');
