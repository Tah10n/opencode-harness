import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {startContainer} from '../native-task-ab/container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {implementations} from './calibration-implementations.mjs';
const root=path.resolve(process.argv[2]),toolchain=JSON.parse(fs.readFileSync('local/native-sensitivity/targeted-20260914/freeze.json')).toolchain;
const results=[];
for(const [task,variants]of Object.entries(implementations)){
 let session;
 try{
  session=await startContainer({source:root+'/inputs/'+task,toolchain,output:root+'/calibration-'+task,onRequest(){throw Error('Offline calibration only');},workMemoryMb:1536,memoryMb:3072});
  const write=(name,text)=>{const r=session.exec(['node','-e',`require('fs').writeFileSync(${JSON.stringify(name)},${JSON.stringify(text)})`]);assert.equal(r.status,0,r.stderr);};
  write('/work/evaluate.mjs',fs.readFileSync('development/native-task-investigation/evaluate-behavior.mjs','utf8'));
  const original=session.exec(['cat','/work/repo/index.js']).stdout;
  const ordinary=session.exec(['npm','test']);fs.writeFileSync(root+'/baseline-'+task+'.txt',ordinary.stdout+ordinary.stderr);assert.equal(ordinary.status,0,task+' initial project suite');
  for(const [label,body]of [['reference',variants.reference],['alternative',variants.alternative],...variants.wrong.map((v,i)=>['wrong-'+i,v])]){
   assert.ok(original.includes(variants.anchor));write('/work/repo/index.js',original.replace(variants.anchor,body+variants.anchor));
   const r=session.exec(['node','/work/evaluate.mjs',task,'/work/repo']);results.push({task,label,exit:r.status,output:r.stdout+r.stderr});
   if(label.startsWith('wrong'))assert.notEqual(r.status,0,task+' '+label+' must fail substantively');else assert.equal(r.status,0,r.stdout+r.stderr);
   console.log(JSON.stringify({task,label,exit:r.status}));
  }
  assert.equal(stopWorkload(session).terminationVerified,true);
 }finally{if(session)assert.equal(session.close(),0);}
}
fs.writeFileSync(root+'/calibration.json',JSON.stringify({realProviderRequests:0,results},null,2));
