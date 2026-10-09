import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.env.FEEDBACK_PROJECT_ROOT;const api=await import(pathToFileURL(path.join(root,'src/index.mjs')));
test('fd22.feature',async()=>{assert.match(fs.readFileSync(path.join(root,'src/row.mjs'),'utf8'),/import.*reverseCopy/);const m=await import(pathToFileURL(path.join(root,'src/reverse.mjs')));assert.deepEqual(m.reverseCopy([1,2]),[2,1]);});
test('fd22.preservation',()=>{const a=[[2,5,8],[],[7]];assert.deepEqual(api.mirrorGrid(a),[[8,5,2],[],[7]]);assert.deepEqual(a,[[2,5,8],[],[7]]);});
