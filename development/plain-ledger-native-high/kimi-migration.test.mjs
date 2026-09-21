// Behavioral subset of public PR #50 readers.test.mjs:4313-4367.
// Historical input is unchanged; internal ledger assertions are not acceptance.
// Every continuation additionally crosses a JSON serialization boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {adapterFor} from '/workspace/packages/connector/lib/readers.mjs';
const roundtrip = value => JSON.parse(JSON.stringify(value));
const totals = result => result.entries.map(({date,totalTokens})=>[date,totalTokens]);
test('historical Kimi 0.4.3 accepted state survives append, copy, move and truncation after JSON reload',async t=>{
 const migration=JSON.parse(await fs.readFile(new URL('./migration-0.4.3.json',import.meta.url),'utf8'));
 assert.equal(migration.generatedFrom,'v0.4.3');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'kimi-migration-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const original=path.join(root,'work/session-a/agents/main/wire.jsonl');
 await fs.mkdir(path.dirname(original),{recursive:true});await fs.writeFile(original,migration.kimi.record+'\n');
 const legacy=roundtrip(migration.kimi.state),checkpoint=legacy.files.$SOURCE_FILE;
 delete legacy.files.$SOURCE_FILE;
 const metadata=await fs.stat(original);legacy.files[original]={...checkpoint,modifiedAt:metadata.mtimeMs,ino:metadata.ino};
 const adapter=adapterFor('kimi_code'),source={dataPath:root,collectionMethod:'kimi_wire_jsonl'};
 let result=await adapter.collect(source,migration.range,roundtrip(legacy));
 assert.deepEqual(totals(result),[['2026-08-10','20']]);
 const native=JSON.parse(migration.kimi.record);
 const appended=JSON.stringify({...native,time:Date.parse('2026-08-11T12:00:00Z'),usage:{...native.usage,output:6}});
 await fs.appendFile(original,appended+'\n');result=await adapter.collect(source,migration.range,roundtrip(result.nextState));
 const expected=[['2026-08-10','20'],['2026-08-11','21']];assert.deepEqual(totals(result),expected,'accepted history and new event');
 const copied=path.join(root,'copy/session-a/agents/main/wire.jsonl');await fs.mkdir(path.dirname(copied),{recursive:true});await fs.copyFile(original,copied);
 result=await adapter.collect(source,migration.range,roundtrip(result.nextState));assert.deepEqual(totals(result),expected,'copy is not additional usage');
 await fs.unlink(original);result=await adapter.collect(source,migration.range,roundtrip(result.nextState));assert.deepEqual(totals(result),expected,'move retains accepted usage');
 await fs.writeFile(copied,appended+'\n');result=await adapter.collect(source,migration.range,roundtrip(result.nextState));assert.deepEqual(totals(result),expected,'truncation retains accepted history');
 assert.doesNotMatch(JSON.stringify(result.nextState),/synthetic-model/);
});
