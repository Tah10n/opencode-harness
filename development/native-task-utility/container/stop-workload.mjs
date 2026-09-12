// Stop task processes while retaining the exact relay PID reported at trusted startup.
// Docker init remains PID 1; a workload cannot exempt itself by matching a command name.
export function stopWorkload(session) {
 if(!Number.isSafeInteger(session.relayPid)||session.relayPid<=1)throw Error('Init-managed relay identity unavailable');
 const result=session.exec(['node','-e',`const fs=require('fs');const alive=()=>fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x)&&+x!==1&&+x!==${session.relayPid}&&+x!==process.pid).filter(x=>{try{const stat=fs.readFileSync('/proc/'+x+'/stat','utf8'),end=stat.lastIndexOf(') ');if(end<0)throw Error('Unknown process state');return !['Z','X'].includes(stat.slice(end+2)[0]);}catch(e){if(e.code==='ENOENT')return false;throw e;}});let killed=[];for(let n=0;n<100;n++){const pids=alive();if(!pids.length){console.log(JSON.stringify({terminationVerified:true,killed}));process.exit(0);}for(const p of pids){try{process.kill(+p,'SIGKILL');killed.push(+p);}catch(e){if(e.code!=='ESRCH')throw e;}}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}throw Error('Workload processes remain');`]);
 if(result.status!==0)throw Error('Workload termination unverified: '+result.stderr);
 return JSON.parse(result.stdout);
}
