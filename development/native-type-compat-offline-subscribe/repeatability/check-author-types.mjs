// Compile all author-added/changed TS consumers, independently of frozen consumers.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {startContainer} from '../../native-task-integrated/container-session.mjs';
const root=path.resolve('local/native-type-compat-offline-subscribe/repeatability'),results=[];
for(const row of JSON.parse(fs.readFileSync(root+'/neutral/inputs.json'))){let s;try{
 s=await startContainer({source:root+'/inputs/'+row.task,toolchain:path.resolve('../verified-change-harness/local/template-toolchain-20260908'),template:root+'/bundle',output:root+'/author-types-'+row.id,workMemoryMb:1536,memoryMb:3072,onRequest:()=>{throw Error('No provider');}});
 assert.equal(s.exec(['node','-e',`require('fs').writeFileSync('/work/p.patch',${JSON.stringify(fs.readFileSync(row.patch,'utf8'))})`]).status,0);
 const apply=s.exec(['git','apply','--index','--binary','/work/p.patch']);if(apply.status!==0){results.push({id:row.id,applicable:false});continue;}
 const changed=s.exec(['git','diff','--cached','--name-only','--diff-filter=AM','-z']);assert.equal(changed.status,0);
 const files=changed.stdout.split('\0').filter(n=>/\.tsx?$/.test(n)&&!n.endsWith('.d.ts'));
 const r=files.length?s.exec(['node','/template/node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--target','es2020','--module','commonjs','--moduleResolution','node','--ignoreDeprecations','6.0',...files]):{status:null,stdout:'No author TS consumer files',stderr:''};
 fs.writeFileSync(s.output+'/types.log',r.stdout+r.stderr);results.push({id:row.id,files,status:r.status});
 }finally{if(s)assert.equal(s.close(),0);}}
fs.writeFileSync(root+'/author-types.json',JSON.stringify(results,null,2),{flag:'wx'});console.log(JSON.stringify(results));
