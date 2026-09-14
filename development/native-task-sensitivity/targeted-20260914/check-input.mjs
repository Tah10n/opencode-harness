// Offline input admission / post-author verification; never mounted for a model.
import fs from 'node:fs';import path from 'node:path';
import {startContainer} from '../../native-task-ab/container-session.mjs';import {stopWorkload} from '../../native-task-utility/container/stop-workload.mjs';
const [rootArg,id,selectedIndex]=process.argv.slice(2),root=path.resolve(rootArg),out=root+'/checks/'+id;
fs.mkdirSync(out,{recursive:true});let session;
try{
 session=await startContainer({source:root+'/inputs/'+id,toolchain:JSON.parse(fs.readFileSync(root+'/preparation.json')).toolchain,template:root+'/bundle',output:out+'/session',onRequest(){throw Error('No provider in evaluator');}});
 const seed=fs.readFileSync(root+'/admission/'+id+'/input.patch','utf8');
 const exec=code=>{const r=session.exec(['node','-e',code]);if(r.status!==0)throw Error(r.stdout+r.stderr);return r.stdout;};
 exec(`const r=require('child_process').spawnSync('git',['apply','-'],{input:${JSON.stringify(seed)},encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);`);
 const checks=id==='case-b'?['npm test']:['npm test'];const results=[];
 for(const command of checks){const r=session.exec(['sh','-c',command]);fs.writeFileSync(out+'/'+command.replaceAll(/[^\w]/g,'_')+'.txt',r.stdout+r.stderr);results.push({command,exit:r.status});}
 const report=JSON.parse(fs.readFileSync(root+'/admission/'+id+'/report.json')),m=report.variants[Number(selectedIndex)];if(m.status!=='passed'||report.baseline.status!=='passed'||!report.terminationVerified)throw Error('Requires current survivor');
 const scenario=id==='case-b'?`import assert from 'node:assert/strict';import QuickLRU from './index.js';const cache=new QuickLRU({maxSize:4});const value={v:1};cache.set('key',value);let calls=0;const got=cache.getOrInsertComputed('key',()=>{calls++;return {v:2};});assert.equal(got,value,'unexpired hit retains object identity');assert.equal(calls,0,'unexpired hit must not invoke factory');`:`import assert from 'node:assert/strict';import Denque from './index.js';${id==='case-a'?"let calls=0;const q=new Denque();const removed=q.removeWhere(()=>{calls++;return false;});assert.equal(calls,0,'predicate only visits initially present values');assert.equal(removed,0);assert.deepEqual(q.toArray(),[]);":"const q=new Denque([1]);assert.throws(()=>q.removeWhere(null),Error);assert.deepEqual(q.toArray(),[1]);"}`;
 exec(`require('fs').writeFileSync('/work/repo/evaluator.mjs',${JSON.stringify(scenario)})`);
 const baseline=session.exec(['node','evaluator.mjs']);
 exec(`const fs=require('fs');const m=${JSON.stringify(m)},file='/work/repo/'+m.fileName,s=fs.readFileSync(file,'utf8'),offset=l=>s.split('\\n').slice(0,l.line-1).reduce((n,x)=>n+x.length+1,0)+l.column,a=offset(m.location.start),b=offset(m.location.end);if(s.slice(a,b)!==m.original)throw Error('Wrong fragment');fs.writeFileSync(file,s.slice(0,a)+m.replacement+s.slice(b));`);
 const mutant=session.exec(['node','evaluator.mjs']);fs.writeFileSync(out+'/evaluator-baseline.txt',baseline.stdout+baseline.stderr);fs.writeFileSync(out+'/evaluator-mutant.txt',mutant.stdout+mutant.stderr);
 const result={checks,results,selected:m,scenario,baselineExit:baseline.status,mutantExit:mutant.status,termination:stopWorkload(session),realProviderRequests:0};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({id,results,baselineExit:baseline.status,mutantExit:mutant.status,termination:result.termination}));
 if(results.some(r=>r.exit!==0)||baseline.status!==0||(id!=='case-c'&&mutant.status===0)||(id==='case-c'&&mutant.status!==0))throw Error('Input acceptance failed');
}finally{if(session&&session.close()!==0)throw Error('Cleanup failed');}
