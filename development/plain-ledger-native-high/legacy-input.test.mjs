// Compatibility check from preserved public adapter/parser behavior, not ledger shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {adapterFor,parseAntigravityLines} from '/workspace/packages/connector/lib/readers.mjs';
const range={rangeStart:'2026-07-15',rangeEnd:'2026-08-14'};
for(const record of [
 {id:'private-legacy-event',timestamp:'2026-08-10T12:00:00Z',usage:{input_tokens:10,output_tokens:5,total_tokens:15}},
 {session_id:'private-legacy-event',date:'2026-08-10',usage:{input_tokens:10,output_tokens:5,total_tokens:15}},
])test('Antigravity preserves supported legacy input '+Object.keys(record).join('/'),async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ledger-legacy-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const line=JSON.stringify(record);await fs.writeFile(path.join(root,'capture.jsonl'),line+'\n');
 const parsed=parseAntigravityLines([line]);assert.equal(parsed[0]?.totalTokens,'15');
 const result=await adapterFor('antigravity').collect({dataPath:root},range,{});
 assert.equal(result.completeness,'complete');assert.deepEqual(result.entries,parsed,'supported input must reach public collection totals');
 const repeated=await adapterFor('antigravity').collect({dataPath:root},range,JSON.parse(JSON.stringify(result.nextState)));
 assert.deepEqual(repeated.entries,parsed,'serialized state must retain that accepted input');
});
