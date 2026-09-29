import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {startContainer} from '../support/container-session.mjs';
import {capturePatch} from './capture.mjs';
import {local as root,campaign,selectionPath} from './campaign.mjs';
const selected=JSON.parse(fs.readFileSync(selectionPath)).selected;
const row=campaign?selected.find(r=>fs.existsSync(root+'/author-inputs/'+r.instance_id+'/image.json')):selected.find(r=>r.instance_id==='serverless__serverless-2434');assert.ok(row);
const source=root+'/author-inputs/'+row.instance_id+'/source';
const output=root+'/'+(process.argv[2]??'container-preflight');
const preparedEnvironment=JSON.parse(fs.readFileSync(root+'/environments.json'))[source];
const session=await startContainer({source,toolchain:root+'/toolchain',template:root+'/bundle',output,preparedEnvironment,workMemoryMb:2048,memoryMb:4096,onRequest:()=>{throw Error('No provider requests permitted');}});
try{
 const run=argv=>{const r=session.exec(argv);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 assert.equal(run(['/opt/opencode','--version']),'1.18.26');
 assert.equal(run(['node','--version']),'v24.19.0');
 assert.equal(run(['bash','-c',(preparedEnvironment.startup??'')+'node --version']),preparedEnvironment.projectNode);
 assert.equal(run(['git','rev-list','--count','HEAD']),'1');
 assert.notEqual(session.exec(['git','cat-file','-e',row.base_commit]).status,0);
 run(['bash','-lc','test ! -e /testbed/.git && test ! -e /var/run/docker.sock && test ! -e /root/.local/share/opencode/auth.json && test ! -e /input/.git']);
 const inspect=JSON.parse(execFileSync('docker',['inspect',session.name],{encoding:'utf8'}))[0];
 assert.equal(inspect.HostConfig.NetworkMode,'none');assert.equal(inspect.HostConfig.Privileged,false);assert.equal(inspect.HostConfig.ReadonlyRootfs,true);
 assert.deepEqual(inspect.Mounts.map(m=>m.Destination).sort(),['/input','/opt/opencode','/relay.mjs','/template'].sort());
 assert.ok(inspect.Mounts.every(m=>m.RW===false));
 // Exercise capture independently of a model: new/deleted files and executable
 // mode must survive the exact binary patch and index-tree round trip.
 run(['bash','-c','printf old > capture-delete.txt; printf mode > capture-mode.txt; git add capture-delete.txt capture-mode.txt; git -c user.name=fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit -qm capture-baseline']);
 session.baseline=run(['git','rev-parse','HEAD']);session.arm='P';
 run(['bash','-c','rm capture-delete.txt; chmod +x capture-mode.txt; printf new > capture-new.txt']);
 const patchDirectory=output+'/patch-check';fs.mkdirSync(patchDirectory);
 assert.equal(capturePatch(session,patchDirectory).status,0);
 const patch=fs.readFileSync(patchDirectory+'/model.patch','utf8');
 for(const text of ['deleted file mode 100644','new file mode 100644','old mode 100644\nnew mode 100755'])assert.ok(patch.includes(text));
 assert.equal(JSON.parse(fs.readFileSync(patchDirectory+'/patch-capture.json')).roundtripVerified,true);
 fs.writeFileSync(output+'/verification.json',JSON.stringify({passed:true,providerRequests:0,opencode:'1.18.26',projectNode:preparedEnvironment.projectNode,diagnosticNode:'24.19.0',freshGitHistory:true,network:'none',readOnlyRoot:true,mounts:inspect.Mounts.map(m=>({destination:m.Destination,readOnly:!m.RW}))},null,2));
}finally{assert.equal(session.close(),0);}
console.log('Actual offline author container preflight passed');
