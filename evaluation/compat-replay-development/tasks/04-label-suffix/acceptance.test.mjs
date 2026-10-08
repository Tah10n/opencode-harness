import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.env.FEEDBACK_PROJECT_ROOT;const api=await import(pathToFileURL(path.join(root,'src/index.mjs')));
test('fd24.feature',async()=>{assert.equal(api.label('abcdef',2,{suffix:'!'}),'ab!');assert.equal(api.label('😀xy',1,{suffix:''}),'😀');});
test('fd24.preservation',()=>{assert.equal(api.label('😀xy',1),'😀…');assert.equal(api.label('😀',1),'😀');assert.equal(api.label('abc',0),'…');});
