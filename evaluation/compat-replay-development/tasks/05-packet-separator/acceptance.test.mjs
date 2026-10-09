import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.env.FEEDBACK_PROJECT_ROOT;const api=await import(pathToFileURL(path.join(root,'src/index.mjs')));
test('fd25.feature',async()=>{assert.equal(api.packet(['a','','b'],{separator:','}),'a,,b');assert.equal(api.packet(['a','b'],{separator:''}),'ab');});
test('fd25.preservation',()=>{assert.equal(api.packet(['','x','','']),'|x||');assert.equal(api.packet(['','']),'|');});
