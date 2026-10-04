// CI recovery before its existing deletion step. Never launches an author/provider.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {privateJSON} from '../support/output-files.mjs';

export function recoverRetained(roots,diagnostics) {
  const records=[];
  const visit=dir=>{
    if(!fs.existsSync(dir))return;
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())visit(file);
      else if(entry.isFile()&&entry.name==='retained-resource.json')records.push(file);
    }
  };
  roots.forEach(visit);
  const failures=[];
  for(const file of records) {
    let saved,container;
    try {
      saved=JSON.parse(fs.readFileSync(file));container=JSON.parse(fs.readFileSync(path.join(path.dirname(file),'container.json')));
      if(!/^template-dev-[a-f0-9-]{36}$/.test(saved.name)||!/^([a-f0-9]{64})$/.test(saved.containerID)||container.name!==saved.name)throw Error('Untrusted retained container identity');
      const inventory=spawnSync('docker',['ps','-a','--no-trunc','--format','{{json .}}'],{encoding:'utf8',timeout:10000});
      if(inventory.status!==0||inventory.error||inventory.signal)throw Error('Container inventory unavailable');
      const matches=inventory.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(row=>row.Names===saved.name||row.ID===saved.containerID);
      if(!matches.length)continue; // Confirmed absent before deleting recovery metadata.
      if(matches.length!==1||matches[0].ID!==saved.containerID||matches[0].Names!==saved.name)throw Error('Retained container identity changed');
      const out=path.dirname(path.dirname(file));
      const recovery=spawnSync(process.execPath,[fileURLToPath(new URL('../support/recover.mjs',import.meta.url)),out],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
      if(recovery.status!==0||recovery.error||recovery.signal)throw Error('Existing retained recovery failed');
      const after=spawnSync('docker',['ps','-a','--no-trunc','--format','{{json .}}'],{encoding:'utf8',timeout:10000});
      if(after.status!==0||after.error||after.signal||after.stdout.includes(saved.containerID)||after.stdout.includes(saved.name))throw Error('Recovered container removal unproven');
    }catch(error){
      const known=['Untrusted retained container identity','Container inventory unavailable','Retained container identity changed','Existing retained recovery failed','Recovered container removal unproven'];
      const reason=known.includes(error.message)?error.message:'Retained metadata unreadable or incomplete';
      failures.push({reason,...(saved&&/^template-dev-[a-f0-9-]{36}$/.test(saved.name)?{name:saved.name}:{}),...(saved&&/^[a-f0-9]{64}$/.test(saved.containerID)?{containerID:saved.containerID}:{}),...(Number.isSafeInteger(saved?.relayPid)?{relayPid:saved.relayPid}:{}),...(container&&/^sha256:[a-f0-9]{64}$/.test(container.image)?{image:container.image}:{})});
    }
  }
  if(failures.length) {
    fs.mkdirSync(path.dirname(diagnostics),{recursive:true});
    privateJSON(diagnostics,{cleanupVerified:false,retainedMetadataPreserved:true,realProviderRequests:0,failures});
    throw Error('Retained resources unrecovered; keep result/assets directories');
  }
  return {retainedRecords:records.length,cleanupMayProceed:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [diagnostics,...roots]=process.argv.slice(2);
  if(!diagnostics||!roots.length||![diagnostics,...roots].every(p=>path.isAbsolute(p)))throw Error('Absolute safe diagnostics file and owned result roots required');
  console.log(JSON.stringify(recoverRetained(roots,diagnostics)));
}
