// Execute the already frozen rubric, unchanged patches and independent consumers.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {startContainer} from '../../native-task-integrated/container-session.mjs';
const root=path.resolve('local/native-type-compat-offline-subscribe/repeatability'),dev=path.resolve('development/native-type-compat-comparison'),rows=JSON.parse(fs.readFileSync(root+'/neutral/inputs.json')),results=[];
assert.ok(fs.existsSync(root+'/outcome.json'));
for(const {id,task,patch}of rows){let s;const output=root+'/grading-'+id;try{
 s=await startContainer({source:root+'/inputs/'+task,toolchain:path.resolve('../verified-change-harness/local/template-toolchain-20260908'),template:root+'/bundle',output,workMemoryMb:1536,memoryMb:3072,onRequest:()=>{throw Error('No provider in evaluator');}});
 const commands=[],run=(name,args)=>{const r=s.exec(args);fs.writeFileSync(output+'/'+name+'.log',r.stdout+'\n'+r.stderr);commands.push({name,status:r.status,error:r.error?.message??null});return r;};
 const bytes=fs.readFileSync(patch,'utf8');assert.equal(s.exec(['node','-e',`require('fs').writeFileSync('/work/submission.patch',${JSON.stringify(bytes)})`]).status,0);
 const apply=bytes.length?run('apply',['git','apply','--index','--binary','/work/submission.patch']):{status:0};if(apply.status!==0){results.push({id,task,applicable:false,commands});continue;}
 const changed=run('changed',['git','diff','--cached','--name-status']).stdout;
 for(const [i,c]of ['npm test','npm run test-esm','npm run rollup'].entries())run('project-'+i,['/bin/bash','-c',c]);
 for(const [file,to]of [[task+'.cjs','independent-evaluation.cjs'],[task+'.types.ts','independent-evaluation.types.ts'],['legacy.types.ts','independent-legacy.types.ts']])assert.equal(s.exec(['node','-e',`require('fs').writeFileSync(${JSON.stringify(to)},${JSON.stringify(fs.readFileSync(dev+'/evaluation/'+file,'utf8'))},{flag:'wx'})`]).status,0);
 run('new-runtime',['node','independent-evaluation.cjs']);for(const name of ['evaluation','legacy'])run(name+'-types',['node','/template/node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--target','es2020','--module','commonjs','--moduleResolution','node','--ignoreDeprecations','6.0','independent-'+name+'.types.ts']);
 const result={id,task,applicable:true,changed,checksPassed:commands.every(c=>c.status===0),commands};results.push(result);fs.writeFileSync(output+'/checks.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(s)assert.equal(s.close(),0);}}
fs.writeFileSync(root+'/grading-checks.json',JSON.stringify(results,null,2),{flag:'wx'});
