import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=process.env.FEEDBACK_PROJECT_ROOT;
const load=name=>import(pathToFileURL(path.join(project,name)).href);
import {spawnSync} from 'node:child_process';
const {textReport}=await load('src/text.mjs');const {jsonReport}=await load('src/json.mjs');
test('fd08.shared-normalizer-delegation',()=>{
 const shared=path.join(project,'src/options.mjs');assert.ok(fs.existsSync(shared),'The requested shared module is missing');
 const script=`import {mock} from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
 const root=${JSON.stringify(project)},url=pathToFileURL(root+'/src/options.mjs').href, exports=await import(url);let calls=0;
 const replace=value=>typeof value==='function'?()=>{calls++;return {attempts:7,timeout:1234};}:value;
 const named=Object.fromEntries(Object.entries(exports).filter(([name])=>name!=='default').map(([name,value])=>[name,replace(value)]));
 mock.module(url,{namedExports:named,...('default' in exports?{defaultExport:replace(exports.default)}:{})});
 const {textReport}=await import(pathToFileURL(root+'/src/text.mjs').href);const {jsonReport}=await import(pathToFileURL(root+'/src/json.mjs').href);
 assert.equal(textReport({attempts:0,timeout:-1}),'attempts=7; timeout=1234');
 assert.deepEqual(jsonReport({attempts:0,timeout:-1}),{attempts:7,timeout:1234});assert.equal(calls,2);`;
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',script],{encoding:'utf8',timeout:3000});
 assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);
});
test('fd08.defaults-values-and-no-mutation',()=>{
 assert.equal(textReport(),'attempts=3; timeout=250');assert.deepEqual(jsonReport(),{attempts:3,timeout:250});
 const options={attempts:10,timeout:0},before={...options};
 assert.equal(textReport(options),'attempts=10; timeout=0');assert.deepEqual(jsonReport(options),options);assert.deepEqual(options,before);
 assert.deepEqual(jsonReport({timeout:1.5}),{attempts:3,timeout:1.5});
});
test('fd08.validation-preserved',()=>{
 for(const fn of [textReport,jsonReport])for(const bad of [{attempts:0},{attempts:11},{attempts:1.5},{attempts:'2'},{timeout:-1},{timeout:NaN},{timeout:Infinity}])assert.throws(()=>fn(bad),RangeError);
});
