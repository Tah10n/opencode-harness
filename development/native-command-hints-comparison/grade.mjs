// Apply unchanged patches under neutral IDs; fixed task-specific checks only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {startContainer} from '../native-task-integrated/container-session.mjs';
const root=path.resolve('local/native-command-hints-comparison/batch'),dev=path.resolve('development/native-command-hints-comparison');
const neutral=JSON.parse(fs.readFileSync(root+'/neutral/inputs.json')),results=[];
for(const row of neutral){
 const {id,task,patch}=row,output=root+'/grading-'+id;let s;
 try{s=await startContainer({source:root+'/inputs/'+task,toolchain:path.resolve('../verified-change-harness/local/template-toolchain-20260908'),template:root+'/bundle',output,workMemoryMb:1536,memoryMb:3072,onRequest:()=>{throw Error('No provider in evaluator');}});
 const commands=[];const run=(name,args)=>{const r=s.exec(args);fs.writeFileSync(output+'/'+name+'.log',r.stdout+'\n'+r.stderr);commands.push({name,status:r.status,error:r.error?.message??null});return r;};
 const bytes=fs.readFileSync(patch,'utf8');assert.equal(s.exec(['node','-e',`require('fs').writeFileSync('/work/submission.patch',${JSON.stringify(bytes)})`]).status,0);
 const apply=bytes.length?run('apply',['git','apply','--index','--binary','/work/submission.patch']):{status:0};
 if(apply.status!==0){results.push({id,task,applicable:false,commands});continue;}
 const changed=run('changed',['git','diff','--cached','--name-status']).stdout;
 const project=task==='A'?['npm test','npm run build']:['npm test','npm run test-esm','npm run rollup'];
 for(let i=0;i<project.length;i++)run('project-'+i,['/bin/bash','-c',project[i]]);
 const fixture=fs.readFileSync(dev+'/evaluation/'+(task==='A'?'A.test.ts':'B.cjs'),'utf8'),target=task==='A'?'test/acceptance-without-query.test.ts':'acceptance-subscription.cjs';
 assert.equal(s.exec(['node','-e',`require('fs').writeFileSync(${JSON.stringify(target)},${JSON.stringify(fixture)},{flag:"wx"})`]).status,0);
 run('independent-behavior',task==='A'?['node_modules/.bin/vitest','run','test/acceptance-without-query.test.ts']:['node','acceptance-subscription.cjs']);
 const types=fs.readFileSync(dev+'/evaluation/'+task+'.types.ts','utf8');assert.equal(s.exec(['node','-e',`require('fs').writeFileSync('acceptance-types.ts',${JSON.stringify(types)},{flag:"wx"})`]).status,0);
 run('independent-types',['node','/template/node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict',...(task==='A'?['--skipLibCheck','--target','es2020','--module','esnext','--moduleResolution','bundler']:['--target','es2020','--module','commonjs','--moduleResolution','node','--ignoreDeprecations','6.0']),'acceptance-types.ts']);
 if(task==='A')run('package-consumer',['node','--input-type=module','-e',"import assert from 'node:assert/strict';import {createRequire} from 'node:module';import * as esm from './dist/index.mjs';const cjs=createRequire(import.meta.url)('./dist/index.cjs');for(const api of [esm,cjs])assert.equal(api.withoutQuery('/p?a=1&b=%2f#f','a'),'/p?b=%2f#f');"]);
 // Mechanical acceptance is not Q until source/test/type/docs review is complete.
 const result={id,task,applicable:true,changed,checksPassed:commands.every(c=>c.status===0),commands};results.push(result);fs.writeFileSync(output+'/checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }finally{if(s)assert.equal(s.close(),0);}
}
fs.writeFileSync(root+'/grading-checks.json',JSON.stringify(results,null,2)+'\n',{flag:'wx'});
