import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const load=n=>import(pathToFileURL(path.join(process.env.FEEDBACK_PROJECT_ROOT,n)).href);

import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const api=await load('src/index.mjs');
test('fd14.shared-planner-delegation',()=>{
 const root=process.env.FEEDBACK_PROJECT_ROOT;assert.ok(fs.existsSync(path.join(root,'src/planner.mjs')));assert.equal(typeof api.planJobs,'function');
 const script=`import {mock} from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const root=${JSON.stringify(root)},jobs=[{id:'caller'}],options={capacity:4};let calls=0;mock.module(pathToFileURL(root+'/src/planner.mjs').href,{namedExports:{planJobs:(j,o)=>{assert.equal(j,jobs);assert.equal(o,options);calls++;return {waves:[['x','y'],['z']],order:['x','y','z'],estimated:42};}}});const {preview}=await import(pathToFileURL(root+'/src/preview.mjs').href);const {runJobs}=await import(pathToFileURL(root+'/src/run.mjs').href);assert.equal(preview(jobs,options).estimated,42);const invoked=[];const r=await runJobs(jobs,id=>{invoked.push(id);return id;},options);assert.deepEqual(r.results,[{id:'x',value:'x'},{id:'y',value:'y'},{id:'z',value:'z'}]);assert.deepEqual(invoked,['x','y','z']);assert.equal(calls,2);`;
 const r=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',script],{encoding:'utf8',timeout:2000});assert.equal(r.status,0,r.stderr);
});
test('fd14.legacy-planning-and-validation',()=>{
 const jobs=[{id:'c',needs:['a','b'],slots:2,seconds:2},{id:'b',slots:2,seconds:3},{id:'a',seconds:4},{id:'d',needs:['c','c'],seconds:1}],before=structuredClone(jobs);
 const expected={waves:[['a'],['b'],['c'],['d']],order:['a','b','c','d'],estimated:10};assert.deepEqual(api.preview(jobs),expected);assert.deepEqual(jobs,before);assert.equal(api.formatPreview(expected),'wave 1: a\nwave 2: b\nwave 3: c\nwave 4: d');assert.deepEqual(api.preview([]),{waves:[],order:[],estimated:0});
 for(const bad of [[{id:'a',needs:['missing']}],[{id:'a'},{id:'a'}],[{id:'a',needs:['b']},{id:'b',needs:['a']}]])assert.throws(()=>api.preview(bad));for(const capacity of [0,9,1.5,'2'])assert.throws(()=>api.preview([],{capacity}),RangeError);
 for(const bad of [{id:'a',slots:3},{id:'a',seconds:NaN},{id:'a',seconds:0}])assert.throws(()=>api.preview([bad]),RangeError);assert.throws(()=>api.preview([{id:'',needs:[]}]),TypeError);
});
test('fd14.legacy-wave-settlement',async()=>{
 const jobs=[{id:'a'},{id:'b'},{id:'c',needs:['a','b']}],calls=[];let release,entered;const hold=new Promise(r=>release=r),seen=new Promise(r=>entered=r);let settled=false;
 const running=api.runJobs(jobs,async id=>{calls.push(id);if(id==='a'){entered();await hold;return 1;}if(id==='b')throw Error('b failed');return 3;}).finally(()=>settled=true);
 const rejected=assert.rejects(running,/b failed/);await seen;for(let i=0;i<6;i++)await Promise.resolve();assert.equal(settled,false);assert.deepEqual(calls,['a','b']);release();await rejected;assert.deepEqual(calls,['a','b']);
 const r=await api.runJobs(jobs,id=>id);assert.deepEqual(r.results,[{id:'a',value:'a'},{id:'b',value:'b'},{id:'c',value:'c'}]);await assert.rejects(api.runJobs([{id:'x'}],()=>{throw Error('sync');}),/sync/);
});
