import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {startContainer} from '../native-task-integrated/container-session.mjs';
const root=path.resolve('local/native-type-compat-offline-subscribe/batch'),dev=path.resolve('development/native-type-compat-comparison'),results=[];
for(const task of ['A'])for(const label of ['baseline','reference','alternative','missing','erased-types','legacy-break','runtime-break']){
 let s;const output=root+'/calibration-verified-'+task+'-'+label;
 try{s=await startContainer({source:label==='baseline'?root+'/inputs/'+task:path.resolve('local/native-type-compat-comparison/batch')+(task==='B'?'/waitfor-calibration/':'/calibration/')+task+'/'+label,toolchain:path.resolve('../verified-change-harness/local/template-toolchain-20260908'),template:root+'/bundle',output,workMemoryMb:1536,memoryMb:3072,onRequest:()=>{throw Error('No provider in evaluator');}});
 const commands=[];const run=(name,args)=>{const r=s.exec(args);fs.writeFileSync(output+'/'+name+'.log',r.stdout+'\n'+r.stderr);commands.push({name,status:r.status,error:r.error?.message??null});return r;};
 if(['baseline','reference','alternative'].includes(label))for(const [i,c]of ['npm test','npm run test-esm','npm run rollup'].entries())run('project-'+i,['/bin/bash','-c',c]);
 for(const [file,to]of [[task+'.cjs','acceptance.cjs'],[task+'.types.ts','acceptance.types.ts'],['legacy.types.ts','legacy.types.ts']])assert.equal(s.exec(['node','-e',`require('fs').writeFileSync(${JSON.stringify(to)},${JSON.stringify(fs.readFileSync(dev+'/evaluation/'+file,'utf8'))})`]).status,0);
 run('new-runtime',['node','acceptance.cjs']);
 for(const name of ['acceptance','legacy'])run(name+'-types',['node','/template/node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--target','es2020','--module','commonjs','--moduleResolution','node','--ignoreDeprecations','6.0',name+'.types.ts']);
 const accepted=commands.every(c=>c.status===0);const r={task,label,accepted,commands};results.push(r);fs.writeFileSync(root+'/calibration-progress.json',JSON.stringify(results,null,2));console.log(JSON.stringify(r));
 if(['reference','alternative'].includes(label))assert.equal(accepted,true);
 else assert.equal(accepted,false);
 if(label==='baseline')assert.ok(commands.filter(c=>c.name.startsWith('project-')||c.name==='legacy-types').every(c=>c.status===0));
 if(label==='erased-types')assert.notEqual(commands.find(c=>c.name==='acceptance-types').status,0);
 if(label==='legacy-break')assert.notEqual(commands.find(c=>c.name==='legacy-types').status,0);
 if(label==='runtime-break')assert.notEqual(commands.find(c=>c.name==='new-runtime').status,0);
 }finally{if(s)assert.equal(s.close(),0);}
}
fs.writeFileSync(root+'/verified-calibration.json',JSON.stringify({passed:true,results,providerRequests:0},null,2),{flag:'wx'});
