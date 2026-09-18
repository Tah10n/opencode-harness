// Reuse the existing contained session, with no model traffic or credentials.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {startContainer} from '../native-task-integrated/container-session.mjs';
const root=path.resolve('local/native-command-hints-comparison/batch'),dev=path.resolve('development/native-command-hints-comparison'),results=fs.existsSync(root+'/calibration-progress.json')?JSON.parse(fs.readFileSync(root+'/calibration-progress.json')):[];
for(const task of ['A','B'])for(const label of ['baseline','reference','incomplete']){
 if(results.some(r=>r.task===task&&r.label===label))continue;
 const source=label==='baseline'?root+'/inputs/'+task:root+'/calibration/'+task+'/'+label;
 const output=root+'/calibration-'+task+'-'+label+'-'+Date.now();let s;
 try{s=await startContainer({source,toolchain:path.resolve('../verified-change-harness/local/template-toolchain-20260908'),template:root+'/bundle',output,workMemoryMb:1536,memoryMb:3072,onRequest:()=>{throw Error('No provider allowed during calibration');}});
 const commands=[];const run=(name,args)=>{const r=s.exec(args);fs.writeFileSync(output+'/'+name+'.log',r.stdout+'\n'+r.stderr);commands.push({name,status:r.status,error:r.error?.message??null});return r;};
 if(task==='A'&&label!=='baseline'){
  assert.equal(run('format',['node_modules/.bin/prettier','--write','src/utils.ts','test/without-query.test.ts','test/without-query.test-d.ts']).status,0);
  for(const f of ['src/utils.ts','test/without-query.test.ts','test/without-query.test-d.ts']){const r=s.exec(['cat',f]);assert.equal(r.status,0);fs.writeFileSync(source+'/'+f,r.stdout);}
 }
 const project=task==='A'?['npm test','npm run build']:['npm test','npm run test-esm','npm run rollup'];
 for(let i=0;i<project.length;i++)run('project-'+i,['/bin/bash','-c',project[i]]);
 const fixture=fs.readFileSync(dev+'/evaluation/'+(task==='A'?'A.test.ts':'B.cjs'),'utf8');
 const target=task==='A'?'test/acceptance-without-query.test.ts':'acceptance-subscription.cjs';
 assert.equal(s.exec(['node','-e',`require('fs').writeFileSync(${JSON.stringify(target)},${JSON.stringify(fixture)})`]).status,0);
 const behavior=run('independent-behavior',task==='A'?['node_modules/.bin/vitest','run','test/acceptance-without-query.test.ts']:['node','acceptance-subscription.cjs']);
 if(task==='B'){
 const types=fs.readFileSync(dev+'/evaluation/B.types.ts','utf8');assert.equal(s.exec(['node','-e',`require('fs').writeFileSync('acceptance-types.ts',${JSON.stringify(types)})`]).status,0);
 run('independent-types',['node','/template/node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--target','es2020','--module','commonjs','--moduleResolution','node','--ignoreDeprecations','6.0','acceptance-types.ts']);
 }else {
 const types=fs.readFileSync(dev+'/evaluation/A.types.ts','utf8');assert.equal(s.exec(['node','-e',`require('fs').writeFileSync('acceptance-types.ts',${JSON.stringify(types)})`]).status,0);
 run('independent-types',['node','/template/node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--skipLibCheck','--target','es2020','--module','esnext','--moduleResolution','bundler','acceptance-types.ts']);
 run('package-consumer',['node','--input-type=module','-e',"import assert from 'node:assert/strict';import {createRequire} from 'node:module';import * as esm from './dist/index.mjs';const cjs=createRequire(import.meta.url)('./dist/index.cjs');for(const api of [esm,cjs])assert.equal(api.withoutQuery('/p?a=1&b=%2f#f','a'),'/p?b=%2f#f');"]);
 }
 const accepted=commands.filter(c=>c.name!=='format').every(c=>c.status===0);
 assert.equal(label==='reference'?accepted:behavior.status!==0,true,JSON.stringify(commands));
 if(label==='baseline')assert.ok(commands.filter(c=>c.name.startsWith('project-')).every(c=>c.status===0),'Baseline checks unavailable');
 results.push({task,label,accepted,commands,output});fs.writeFileSync(root+'/calibration-progress.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.at(-1)));
 }finally{if(s)assert.equal(s.close(),0);}
}
fs.writeFileSync(root+'/calibration.json',JSON.stringify({passed:true,results,realProviderRequests:0},null,2)+'\n',{flag:'wx'});
