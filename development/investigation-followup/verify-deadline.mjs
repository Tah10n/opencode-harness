// Real process/pipe regression: docker-exec close is not workload termination.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {runNativePhase} from '../native-task-abc/native-run.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'investigation-deadline-'));
const budgetMs=300,cancelToleranceMs=250,stopGraceMs=1000;
let descendant,emergency,child;
try {
 const started=performance.now();let stopAt;
 // A surviving workload keeps inherited pipes open after the host client dies.
 const result=await runNativePhase({output:root,name:'scripted'},{config:{},limitMs:budgetMs,stopGraceMs,
  stopWorkload:()=>{stopAt=performance.now();if(descendant)process.kill(descendant,'SIGKILL');return {terminationVerified:true,killed:[descendant]};}
 },{spawnProcess:()=>{
  child=spawn(process.execPath,['-e',`const {spawn}=require('child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore',1,2]});console.log(JSON.stringify({type:'workload',pid:c.pid}));setInterval(()=>{},1000);`],{stdio:['ignore','pipe','pipe']});
  child.stdout.once('data',b=>{descendant=JSON.parse(b.toString()).pid;});
  emergency=setTimeout(()=>{if(descendant)try{process.kill(descendant,'SIGKILL');}catch{}},1500);
  return child;
 }});
 clearTimeout(emergency);
 const cancellationLatencyMs=stopAt-started-budgetMs;
 console.log(JSON.stringify({budgetMs,cancelToleranceMs,stopGraceMs,cancellationLatencyMs,result}));
 assert.ok(cancellationLatencyMs<=cancelToleranceMs,'stopWorkload must start at deadline, before host close');
 assert.equal(result.timedOut,true);assert.equal(result.termination.terminationVerified,true);
 assert.ok(performance.now()-started<budgetMs+stopGraceMs);
}finally {
 clearTimeout(emergency);if(child?.exitCode===null&&child?.signalCode===null)child.kill('SIGKILL');
 if(descendant)try{process.kill(descendant,'SIGKILL');}catch{}
 fs.rmSync(root,{recursive:true,force:true});
}
