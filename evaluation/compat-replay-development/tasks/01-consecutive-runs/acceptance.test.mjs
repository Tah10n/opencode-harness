import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.env.FEEDBACK_PROJECT_ROOT;const api=await import(pathToFileURL(path.join(root,'src/index.mjs')));
test('fd21.feature',async()=>{assert.match(fs.readFileSync(path.join(root,'src/runs.mjs'),'utf8'),/import.*appendRun/);const m=await import(pathToFileURL(path.join(root,'src/append.mjs')));const a=[];m.appendRun(a,'x');assert.deepEqual(a,[{value:'x',count:1}]);});
test('fd21.preservation',()=>{const a=['b','a','b'];assert.deepEqual(api.encode(a),a.map(value=>({value,count:1})));assert.equal(api.summary(a),'b:1,a:1,b:1');assert.deepEqual(a,['b','a','b']);});
