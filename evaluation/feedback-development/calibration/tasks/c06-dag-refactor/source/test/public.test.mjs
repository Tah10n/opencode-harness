import assert from 'node:assert/strict';import {test,mock} from 'node:test';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {preview,runJobs} from '../src/index.mjs';
test('resource packing and execution order',async()=>{const jobs=[{id:'b',seconds:2},{id:'a',seconds:4},{id:'c',needs:['a','b'],seconds:3}];assert.deepEqual(preview(jobs),{waves:[['a','b'],['c']],order:['a','b','c'],estimated:7});assert.deepEqual((await runJobs(jobs,async id=>id.toUpperCase())).results,[{id:'a',value:'A'},{id:'b',value:'B'},{id:'c',value:'C'}]);});
test('both entrypoints delegate to exported planner',()=>{
 const root=new URL('../',import.meta.url).pathname;
 const script=`import {mock} from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const root=${JSON.stringify(root)};let calls=0;mock.module(pathToFileURL(root+'src/planner.mjs').href,{namedExports:{planJobs:(jobs,options)=>{calls++;assert.deepEqual(jobs,[]);return {waves:[['substitute']],order:['substitute'],estimated:99};}}});const {preview}=await import(pathToFileURL(root+'src/preview.mjs').href);const {runJobs}=await import(pathToFileURL(root+'src/run.mjs').href);assert.equal(preview([]).estimated,99);assert.deepEqual((await runJobs([],async id=>id)).results,[{id:'substitute',value:'substitute'}]);assert.equal(calls,2);`;
 const r=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',script],{encoding:'utf8',timeout:2000});assert.equal(r.status,0,r.stderr);
});
