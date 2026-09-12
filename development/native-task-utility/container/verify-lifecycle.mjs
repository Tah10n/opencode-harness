// Model-free integration check for the isolated process lifecycle.
// Usage: node development/native-task-utility/container/verify-lifecycle.mjs /absolute/opencode-toolchain
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startContainer} from './container-session.mjs';
import {stopWorkload} from './stop-workload.mjs';

const toolchain=process.argv[2];
assert.ok(toolchain&&path.isAbsolute(toolchain),'An absolute existing toolchain directory is required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-container-init-'));
const source=path.join(root,'source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'README.md'),'Temporary process-lifecycle fixture.\n');
let session;
try {
  session=await startContainer({source,toolchain,output:path.join(root,'session'),onRequest:()=>{throw Error('No provider calls allowed');}});
  const execute=script=>{
    const result=session.exec(['node','-e',script]);
    assert.equal(result.status,0,result.stdout+result.stderr);
    return result.stdout.trim();
  };
  const detached=body=>Number(execute(`const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(body)}],{detached:true,stdio:'ignore'});console.log(child.pid);child.unref();`));
  const gone=pids=>execute(`const pids=${JSON.stringify(pids)},until=Date.now()+5000;while(Date.now()<until){const live=pids.filter(pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}});if(!live.length)process.exit(0);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}throw Error('Exited task processes remain observable');`);

  // Once its parent exits, an orphan must disappear, including kill(pid, 0).
  const orphan=detached('setTimeout(()=>{},50)');
  assert.ok(Number.isSafeInteger(orphan)&&orphan>1);gone([orphan]);
  assert.throws(()=>stopWorkload({...session,relayPid:undefined}),/identity unavailable/);

  // Neither a relay-like title nor a fake state inside comm exempts a workload.
  const workloads=['node /relay.mjs','worker) Z'].map(title=>detached(`process.title=${JSON.stringify(title)};setInterval(()=>{},1000);`));
  assert.ok(workloads.every(pid=>Number.isSafeInteger(pid)&&pid>1&&pid!==session.relayPid));
  // Wait until both titles are actually visible, so the parser regression is exercised.
  execute(`const fs=require('node:fs'),pids=${JSON.stringify(workloads)},until=Date.now()+5000;while(Date.now()<until){if(pids.every((pid,index)=>fs.readFileSync('/proc/'+pid+'/comm','utf8').trim()===['node /relay.mjs','worker) Z'][index]))process.exit(0);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}throw Error('Workload titles were not installed');`);
  const termination=stopWorkload(session);
  assert.ok(termination.terminationVerified);
  assert.ok(workloads.every(pid=>termination.killed.includes(pid)));
  assert.ok(!termination.killed.includes(session.relayPid));
  gone(workloads);
  execute(`process.kill(${session.relayPid},0);`);
  console.log(JSON.stringify({passed:true,orphanReaped:true,disguisedWorkloadsStopped:true,unknownRelayRejected:true,relayPreserved:true,realProviderRequests:0}));
} finally {
  try {if(session)assert.equal(session.close(),0,'Container cleanup failed');}
  finally {fs.rmSync(root,{recursive:true,force:true});}
}
