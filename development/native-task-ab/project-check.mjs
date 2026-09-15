// Model-free project verification in an ordinary isolated source copy.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {startContainer} from './container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';

export async function projectCheck({source, output, toolchain, command = ['npm','test'], overlay = {}, captureFiles = []}) {
  fs.mkdirSync(output, {recursive: true});
  const started = Date.now(); let session;
  try {
    session = await startContainer({source, output: path.join(output,'container'), toolchain,
      onRequest: () => { throw Error('A model-free project check must not request a model'); }});
    if(Object.keys(overlay).length){
      for(const name of Object.keys(overlay))if(path.isAbsolute(name)||name.split('/').includes('..')||name.startsWith('.git/'))throw Error('Invalid evaluation overlay path');
      const applied=session.exec(['node','-e',`const fs=require('fs'),path=require('path');for(const [name,bytes] of Object.entries(${JSON.stringify(overlay)})){fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,Buffer.from(bytes,'base64'));}`]);
      if(applied.status!==0)throw Error('Evaluation overlay failed: '+applied.stderr);
    }
    const child = spawn('docker',['exec','--workdir','/work/repo',session.name,...command],{stdio:['ignore','pipe','pipe']});
    const log = fs.createWriteStream(path.join(output,'output.txt'),{flags:'wx'});
    child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    const timer=setTimeout(()=>{stopWorkload(session);child.kill('SIGTERM');},300000);
    const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(exit,signal)=>resolve({exit,signal}));});
    clearTimeout(timer);await new Promise(resolve=>log.end(resolve));
    if(captureFiles.length){
      const capture=session.exec(['node','-e',`const fs=require('fs');console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(captureFiles)}.map(n=>[n,fs.readFileSync(n).toString('base64')]))));`]);
      if(capture.status!==0)throw Error('Control files unavailable: '+capture.stderr);
      fs.writeFileSync(path.join(output,'files.json'),capture.stdout);
    }
    const summary={...result,command,elapsedMs:Date.now()-started,termination:stopWorkload(session),realProviderRequests:0};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(summary,null,2)+'\n');return summary;
  } finally {if(session && session.close()!==0)throw Error('Project check cleanup failed');}
}
if(process.argv[1]===new URL(import.meta.url).pathname){
  const [source,output,toolchain,...command]=process.argv.slice(2);
  console.log(JSON.stringify(await projectCheck({source:path.resolve(source),output:path.resolve(output),toolchain:path.resolve(toolchain),...(command.length?{command}:{})})));
}
