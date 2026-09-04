export const task = `Make store updates transactional and durable without breaking the existing openStore,
Store.open, get, put and increment APIs. Add update(mutator), where mutator receives a private
mutable draft of the latest committed key/value state and may return a Promise. Serialize
updates per Store instance. The Promise returned by update resolves to the mutator's return
value only after save succeeds. A thrown/rejected mutator must not call save; failed save or
mutator must preserve the original error object, leave committed state unchanged, and not
prevent later queued updates. Reads while an update is pending see the previously committed
state. A queued mutator takes its starting snapshot when its turn begins, not when enqueued.
put must use the same transaction queue and still resolve to its value. increment must use
update so concurrent increments are not lost. Input values, get results and mutator drafts
must not alias committed data after completion; supported values are JSON-compatible values.
Keys may be any strings, including __proto__ and constructor, with ordinary own-key semantics.
The injectable adapter contract remains load() and save(state). File-adapter saves write a
temporary file then rename it over the main file. A rename failure leaves the old main file
intact, attempts temporary-file cleanup, and preserves the rename error even if cleanup also
fails. Loading uses only the main file and ignores an orphan temporary file from a previous
interruption. Keep exports from src/index.mjs compatible.`;

export const files = {
  "src/file-adapter.mjs": `import * as fs from 'node:fs/promises';
export function createFileAdapter(file, io = fs) {
  return {
    async load() { try { return JSON.parse(await io.readFile(file,'utf8')); } catch(error) { if(error.code==='ENOENT')return {};throw error; } },
    async save(state) { await io.writeFile(file+'.tmp',JSON.stringify(state)); await io.rename(file+'.tmp',file); },
  };
}
`,
  "src/store.mjs": `import { createFileAdapter } from './file-adapter.mjs';
export class Store {
  constructor(adapter,state) { this.adapter=adapter;this.state=state; }
  static async open(file,adapter=createFileAdapter(file)) { return new Store(adapter,await adapter.load()); }
  get(key) { return this.state[key]; }
  async put(key,value) { this.state[key]=value;await this.adapter.save(this.state);return value; }
}
`,
  "src/service.mjs": `export async function increment(store,key) {
  const next=(store.get(key)??0)+1;
  await store.put(key,next);
  return next;
}
`,
  "src/index.mjs": `import { Store } from './store.mjs';
export { Store } from './store.mjs';
export { createFileAdapter } from './file-adapter.mjs';
export { increment } from './service.mjs';
export function openStore(file,adapter) { return Store.open(file,adapter); }
`,
  "test/public.test.mjs": `import test from 'node:test';import assert from 'node:assert/strict';
import {openStore,increment} from '../src/index.mjs';
test('existing adapter and consumer',async()=>{let disk={};const adapter={load:async()=>structuredClone(disk),save:async value=>{disk=structuredClone(value)}};
 const store=await openStore('unused',adapter);assert.equal(await store.put('count',1),1);assert.equal(await increment(store,'count'),2);
 const reopened=await openStore('unused',adapter);assert.equal(reopened.get('count'),2);
});
`,
  "README.md": "# Durable store\nStore.open and openStore accept an optional injected load/save adapter. get is synchronous; put and increment return Promises. src/index.mjs is the public export surface.\n",
};
