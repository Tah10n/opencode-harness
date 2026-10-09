import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.env.FEEDBACK_PROJECT_ROOT;const api=await import(pathToFileURL(path.join(root,'src/index.mjs')));
test('fd26.feature',async()=>{assert.deepEqual(api.transform([[2,3]],{scale:2,offset:[5,7]}),[[9,13]]);});
test('fd26.preservation',()=>{const p=[[2,4],[1,3]];assert.deepEqual(api.transform(p,{scale:0}),[[0,0],[0,0]]);assert.deepEqual(p,[[2,4],[1,3]]);assert.deepEqual(api.transform(p),p);});
