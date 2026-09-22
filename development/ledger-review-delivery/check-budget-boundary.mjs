// Read-only protocol preflight. No native conversation or provider is started.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {startContainer} from '../native-task-integrated/container-session.mjs';

const root=path.resolve('local/ledger-review-delivery');
const out=root+'/budget-boundary';
const hash=b=>createHash('sha256').update(b).digest('hex');
fs.mkdirSync(out,{recursive:true,mode:0o700});
assert.ok(!fs.existsSync(out+'/started.json'),'Never repeat the saved preparation attempt');
fs.writeFileSync(out+'/started.json',JSON.stringify({at:new Date().toISOString(),realProviderRequests:0})+'\n',{flag:'wx',mode:0o600});
const prepared=JSON.parse(fs.readFileSync('local/ledger-review-diagnostic/prepared-corrected.json'));
assert.ok(fs.existsSync(prepared.template+'/.gitignore'));
const source=out+'/input';fs.mkdirSync(source);
fs.writeFileSync(source+'/index.cjs','exports.double = value => value * 2;\n');
let session,requests=0;
const receipt={kind:'pre-native-budget-boundary',realProviderRequests:0,nativeSessions:0,scriptedProviderRequests:0,
  originalTaskSha256:hash(fs.readFileSync('development/plain-ledger-native-high/original-task.txt')),
  sourceFiles:Object.fromEntries(['development/native-task-integrated/container-session.mjs','development/native-task-integrated/container-relay.mjs','lib/native-task-plugin.mjs'].map(p=>[p,hash(fs.readFileSync(p))])),
  fullChainPreflight:'not_started',deadlineStarted:false,stages:{A:'not_started',R:'not_started',F:'not_started'}};
try {
  session=await startContainer({source,toolchain:prepared.toolchain,template:prepared.template,
    output:out+'/session',workMemoryMb:1536,memoryMb:3072,onRequest:()=>{requests++;throw Error('Unexpected provider request in no-native preparation');}});
  const version=session.exec(['/opt/opencode','--version']);
  assert.equal(version.status,0);assert.equal(version.stdout.trim(),'1.18.26');
  receipt.openCodeVersion=version.stdout.trim();
  // A=300s, R=120s, transitions/bootstrap=30s is a legal possible schedule.
  // F must retain its 3150s remainder; neither delay nor silent truncation is used.
  receipt.example={totalMs:3600000,elapsedMs:450000,remainingFMs:3150000};
  assert.throws(()=>session.setTaskBudget(receipt.example.remainingFMs),e=>{
    receipt.error={name:e.name,message:e.message};return e.message==='Invalid relay task budget';
  });
  assert.equal(requests,0);
  receipt.result='confirmed_budget_boundary';
} catch(e) {
  receipt.result='check_error';receipt.checkError={name:e.name,message:e.message};throw e;
} finally {
  if(session){receipt.cleanupStatus=session.close();const inspected=spawnSync('docker',['inspect',session.name],{encoding:'utf8'});
    receipt.containerAbsent=inspected.status!==0&&/no such object/i.test(inspected.stderr);}
  receipt.observedRelayRequests=requests;
  receipt.finishedAt=new Date().toISOString();
  fs.writeFileSync(out+'/result.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  fs.writeFileSync('development/ledger-review-delivery/budget-boundary.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
}
assert.equal(receipt.cleanupStatus,0);assert.equal(receipt.containerAbsent,true);
console.log(JSON.stringify(receipt));
