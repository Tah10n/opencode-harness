// Behavioral migration inputs produced by the exact public historical baseline.
// Both /baseline and /workspace are evaluator-only mounts, never author mounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {adapterFor as oldAdapter} from '/baseline/packages/connector/lib/readers.mjs';
import {adapterFor} from '/workspace/packages/connector/lib/readers.mjs';
const range={rangeStart:'2026-07-15',rangeEnd:'2026-08-14'},reload=x=>JSON.parse(JSON.stringify(x));
const totals=r=>r.entries.map(e=>[e.date,e.totalTokens]);
const cases=[
 ['claude_code','session.jsonl',(id,d,i,o)=>({type:'assistant',timestamp:d+'T12:00:00Z',message:{role:'assistant',id,usage:{input_tokens:i,output_tokens:o}}})],
 ['gemini_cli','session-usage.jsonl',(id,d,i,o)=>({type:'gemini',id,timestamp:d+'T12:00:00Z',usageMetadata:{input:i,output:o,total:i+o}})],
 ['qwen_code','token-usage-session.jsonl',(id,d,i,o)=>({schemaVersion:1,id,timestamp:d+'T12:00:00Z',inputTokens:i,outputTokens:o,totalTokens:i+o,cachedTokens:0,thoughtsTokens:0})],
 ['antigravity','capture.jsonl',(id,d,i,o)=>({id,date:d,usage:{input_tokens:i,output_tokens:o,total_tokens:i+o}})],
];
for(const [agent,name,record] of cases)test(`${agent}: accepted legacy state survives source replacement and JSON reload`,async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'migration-contract-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,name),source={dataPath:root};
 await fs.writeFile(file,JSON.stringify(record('private-old','2026-08-10',10,5))+'\n');
 const old=await oldAdapter(agent).collect(source,range,{});assert.deepEqual(totals(old),[['2026-08-10','15']],'historical fixture must be valid');
 const input=reload(old.nextState);await fs.unlink(file);
 await fs.writeFile(file,JSON.stringify(record('private-new','2026-08-11',4,3))+'\n');
 let result=await adapterFor(agent).collect(source,range,input);
 const expected=[['2026-08-10','15'],['2026-08-11','7']];assert.deepEqual(totals(result),expected);
 result=await adapterFor(agent).collect(source,range,reload(result.nextState));assert.deepEqual(totals(result),expected);
 assert.doesNotMatch(JSON.stringify(result.nextState),/private-old|private-new/);
});
test('Kimi legacy StatusUpdate keeps accepted usage through replacement and reload',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'kimi-legacy-contract-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,'wire.jsonl'),source={dataPath:root,collectionMethod:'kimi_legacy_wire_jsonl'},adapter=adapterFor('kimi_code');
 const record=(id,d,i,o)=>({timestamp:d+'T12:00:00Z',message:{type:'StatusUpdate',payload:{message_id:id,token_usage:{input_other:i,output:o}}}});
 await fs.writeFile(file,JSON.stringify(record('private-old','2026-08-10',10,5))+'\n');let result=await adapter.collect(source,range,{});assert.deepEqual(totals(result),[['2026-08-10','15']]);
 await fs.writeFile(file,JSON.stringify(record('private-new','2026-08-11',4,3))+'\n');result=await adapter.collect(source,range,reload(result.nextState));
 assert.deepEqual(totals(result),[['2026-08-10','15'],['2026-08-11','7']]);
});
async function database(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'cutover-contract-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'opencode.db'),db=new DatabaseSync(file);t.after(()=>db.close());db.exec('CREATE TABLE message (id TEXT, time_created INTEGER, data TEXT)');return {source:{dataPath:file},db,insert:(id,d,i,o)=>db.prepare('INSERT INTO message VALUES (?,?,?)').run(id,Date.parse(d+'T12:00:00Z'),JSON.stringify({role:'assistant',tokens:{input:i,output:o,total:i+o}}))};}
test('OpenCode legacy baseline without exact-ID cutover remains fail closed',async t=>{
 const {source}=await database(t);
 await assert.rejects(adapterFor('opencode').collect(source,range,{serverBaseline:{acceptedAt:'2026-08-10T23:59:59.000Z',acceptedSequence:'7',entries:[{date:'2026-08-10',totalTokens:'100'}]}}),e=>e?.diagnosticCode==='opencode_cutover_required');
});
test('OpenCode confirmed cutover retains accepted baseline and counts race/new IDs once',async t=>{
 const {source,db,insert}=await database(t);insert('private-accepted','2026-08-10',60,40);insert('private-race','2026-08-11',4,3);
 const hash=createHash('sha256').update('private-accepted').digest('hex');
 const old={serverBaseline:{acceptedAt:'2026-08-10T23:59:59.000Z',acceptedSequence:'7',entries:[{date:'2026-08-10',totalTokens:'100'}]},cutover:{version:1,confirmedSequence:'7',confirmedRangeEnd:'2026-08-14',aliases:{[hash]:'2026-08-10'}}};
 const adapter=adapterFor('opencode');let result=await adapter.collect(source,range,reload(old));assert.deepEqual(totals(result),[['2026-08-10','100'],['2026-08-11','7']]);
 db.exec('DELETE FROM message');insert('private-new','2026-08-12',5,4);result=await adapter.collect(source,range,reload(result.nextState));
 const expected=[['2026-08-10','100'],['2026-08-11','7'],['2026-08-12','9']];assert.deepEqual(totals(result),expected);
 result=await adapter.collect(source,range,reload(result.nextState));assert.deepEqual(totals(result),expected);assert.doesNotMatch(JSON.stringify(result.nextState),/private-accepted|private-race|private-new/);
});
test('OpenCode conflicting tuple does not prevent unrelated new usage',async t=>{
 const {source,db,insert}=await database(t),adapter=adapterFor('opencode');insert('private-first','2026-08-10',10,5);let result=await adapter.collect(source,range,{});
 db.exec('DELETE FROM message');insert('private-first','2026-08-10',100,50);insert('private-second','2026-08-11',4,3);
 result=await adapter.collect(source,range,reload(result.nextState));assert.equal(result.completeness,'partial');assert.deepEqual(totals(result),[['2026-08-10','15'],['2026-08-11','7']]);assert.ok(result.diagnostics.some(d=>d.code==='local_event_identity_conflict'));
});
