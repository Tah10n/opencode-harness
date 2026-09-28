// Development launcher only: independent stop while its main event loop is busy.
// Same container, UID and stopWorkload contract; no network, new mounts or service.
import {parentPort,workerData} from 'node:worker_threads';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
const {name,relayPid,deadline,deadlineMono,output,graceMs}=workerData;
const mark=()=>({at:new Date().toISOString(),monotonicMs:performance.now()});
let stopped=false;
const stop=(trigger='hard_deadline')=>{
 if(stopped)return;stopped=true;
 const receipt={trigger,deadlineAt:new Date(deadline).toISOString(),deadlineMono,cancellationStarted:mark()};
 try{receipt.termination=stopWorkload({relayPid,exec:argv=>spawnSync('docker',['exec','--workdir','/work/repo',name,...argv],{encoding:'utf8',timeout:graceMs,maxBuffer:1024*1024})});}
 catch(error){receipt.termination={terminationVerified:false,error:error.message};}
 receipt.stopSettled=mark();
 fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
 parentPort.postMessage(receipt);parentPort.close();
};
const timer=setTimeout(()=>stop(),Math.max(0,Math.ceil(Math.min(deadline-Date.now(),deadlineMono-performance.now()))));
parentPort.on('message',message=>{if(message==='disarm'){clearTimeout(timer);parentPort.close();}else if(message==='stop'||message==='cleanup'){clearTimeout(timer);stop(message==='cleanup'?'normal_cleanup':'cancellation');}});
parentPort.postMessage({ready:true});
