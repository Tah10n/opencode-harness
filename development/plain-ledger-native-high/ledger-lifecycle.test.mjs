// Broader development diagnostics, derived from the original task clauses.
// They are never supplied to model execution or promoted to repair authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {adapterFor} from '/workspace/packages/connector/lib/readers.mjs';

const range={rangeStart:'2026-07-15',rangeEnd:'2026-08-14'};
const roundtrip=value=>JSON.parse(JSON.stringify(value));
const totals=result=>result.entries.map(e=>[e.date,e.totalTokens]);
const at=date=>date+'T12:00:00Z';
const cases=[
  ['claude_code','session.jsonl',(id,date,input,output)=>({type:'assistant',timestamp:at(date),message:{role:'assistant',id,usage:{input_tokens:input,output_tokens:output}}}),true],
  ['gemini_cli','session-usage.jsonl',(id,date,input,output)=>({type:'gemini',id,timestamp:at(date),usageMetadata:{input,output,total:input+output}}),true],
  ['antigravity','capture.jsonl',(id,date,input,output)=>({id,date,usage:{input_tokens:input,output_tokens:output,total_tokens:input+output}}),true],
  ['qwen_code','token-usage-session.jsonl',(id,date,input,output)=>({schemaVersion:1,id,timestamp:at(date),inputTokens:input,outputTokens:output,totalTokens:input+output,cachedTokens:0,thoughtsTokens:0}),true],
  // Kimi has session/agent location plus content identity. Preserve those
  // identity-bearing path components when moving; a new session is a new event.
  ['kimi_code','wire.jsonl',(_id,date,input,output)=>({type:'usage.record',time:at(date),usage:{inputOther:input,output}}),false],
];

for(const [agent,fileName,record,stableId] of cases)test(`${agent}: move, truncate, reload, conflict and range preservation`,async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ledger-lifecycle-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const adapter=adapterFor(agent),source={dataPath:root};
  const first=record('private-event-alpha','2026-08-10',10,5);
  const second=record('private-event-beta','2026-08-11',4,3);
  const third=record('private-event-gamma','2026-08-12',5,4);
  const write=(file,records)=>fs.writeFile(file,records.map(JSON.stringify).join('\n')+'\n');
  const relative=agent==='kimi_code'?path.join('session-a','agents','main',fileName):fileName;
  let file=path.join(root,'original',relative);await fs.mkdir(path.dirname(file),{recursive:true});await write(file,[first]);
  let result=await adapter.collect(source,range,{});
  assert.deepEqual(totals(result),[['2026-08-10','15']],'fixture must be valid');
  const moved=path.join(root,'moved',relative);await fs.mkdir(path.dirname(moved),{recursive:true});
  await fs.rename(file,moved);file=moved;
  await write(file,[first,second]);
  result=await adapter.collect(source,range,roundtrip(result.nextState));
  const expected=[['2026-08-10','15'],['2026-08-11','7']];
  assert.deepEqual(totals(result),expected,'moved old identity stays once and a new event counts');
  await write(file,[second]);
  result=await adapter.collect(source,range,roundtrip(result.nextState));
  assert.deepEqual(totals(result),expected,'truncation cannot erase accepted usage');
  result=await adapter.collect(source,range,roundtrip(result.nextState));
  assert.deepEqual(totals(result),expected,'unchanged replay is idempotent');
  assert.doesNotMatch(JSON.stringify(result.nextState),/private-event-alpha|private-event-beta/);
  if(stableId){
    await write(file,[record('private-event-alpha','2026-08-10',100,50),second,third]);
    result=await adapter.collect(source,range,roundtrip(result.nextState));
    assert.equal(result.completeness,'partial','same identity with a conflicting tuple is partial');
    expected.push(['2026-08-12','9']);
    assert.deepEqual(totals(result),expected,'first tuple wins and unrelated valid event is retained');
  }
  const narrowed=await adapter.collect(source,{rangeStart:'2026-08-11',rangeEnd:'2026-08-14'},roundtrip(result.nextState));
  assert.deepEqual(totals(narrowed),expected.filter(([date])=>date>='2026-08-11'),'retained data still obeys the requested range');
});
