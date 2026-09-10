import {test} from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';const root=process.env.PILOT_SOURCE;
const m0=await import(path.join(root,"src/tokens.mjs"));const m1=await import(path.join(root,"src/slug.mjs"));
test("token policy and truncation through consumer",()=>{assert.deepEqual(m0.tokens('A__B café 😀42'),['a','b','caf','42']);assert.equal(m1.slug('abc def',4),'abc');assert.equal(m1.slug('abc def',5),'abc-d');});
test("empty fallback and repeat ownership",()=>{assert.equal(m1.slug('é😀'),'untitled');assert.equal(m1.slug('x',0),'untitled');const t=m0.tokens('A B');t.push('z');assert.deepEqual(m0.tokens('A B'),['a','b']);});
test("default bound",()=>{assert.equal(m1.slug('a'.repeat(50)).length,40);assert.equal(m1.slug(' X --- Y '),'x-y');});