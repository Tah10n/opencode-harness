// Post-assessment reproductions of frozen migration/identity/diagnostic clauses.
// Observations only: these do not replace or expand the frozen 23-test score.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {adapterFor} from '/workspace/packages/connector/lib/readers.mjs';
import {adapterFor as oldAdapter} from '/baseline/packages/connector/lib/readers.mjs';
import {normalizeAdapterDiagnostics} from '/workspace/packages/connector/lib/diagnostics.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ledger-diagnose-'));
const range={rangeStart:'2026-07-15',rangeEnd:'2026-08-14'},reload=x=>JSON.parse(JSON.stringify(x));
const sourceId='11111111-1111-4111-8111-111111111111',agentAccountId='22222222-2222-4222-8222-222222222222';
const totals=r=>r.entries.map(e=>[e.date,e.totalTokens]);
const observations=[];
try {
  const cases=[
    ['claude_code','session.jsonl',(id,d)=>({type:'assistant',timestamp:d+'T12:00:00Z',message:{role:'assistant',id,usage:{input_tokens:10,output_tokens:5}}})],
    ['gemini_cli','session-usage.jsonl',(id,d)=>({type:'gemini',id,timestamp:d+'T12:00:00Z',usageMetadata:{input:10,output:5,total:15}})],
    ['qwen_code','token-usage-session.jsonl',(id,d)=>({schemaVersion:1,id,timestamp:d+'T12:00:00Z',inputTokens:10,outputTokens:5,totalTokens:15,cachedTokens:0,thoughtsTokens:0})],
    ['antigravity','capture.jsonl',(id,d)=>({id,date:d,usage:{input_tokens:10,output_tokens:5,total_tokens:15}})],
  ];
  for(const [agentId,name,record] of cases) {
    const dir=path.join(root,agentId);await fs.mkdir(dir);const file=path.join(dir,name);
    const source={dataPath:dir,sourceId,agentAccountId,agentId};
    await fs.writeFile(file,JSON.stringify(record('old-event','2026-08-10'))+'\n');
    const old=await oldAdapter(agentId).collect(source,range,{});
    await fs.unlink(file);await fs.writeFile(file,JSON.stringify(record('new-event','2026-08-11'))+'\n');
    const result=await adapterFor(agentId).collect(source,range,reload(old.nextState));
    observations.push({case:'bound-source-legacy-migration',agentId,old:totals(old),expected:[['2026-08-10','15'],['2026-08-11','15']],actual:totals(result),completeness:result.completeness});
  }
  const file=path.join(root,'switch.jsonl');
  const record={id:'same-observed-event',date:'2026-08-10',usage:{input_tokens:10,output_tokens:0,total_tokens:10}};
  await fs.writeFile(file,JSON.stringify(record)+'\n');
  const source={dataPath:file,sourceId,agentAccountId,agentId:'antigravity',collectionMethod:'antigravity_cli_capture'};
  const adapter=adapterFor('antigravity');const first=await adapter.collect(source,range,{});
  const switched=await adapter.collect({...source,agentAccountId:'33333333-3333-4333-8333-333333333333'},range,reload(first.nextState));
  observations.push({case:'same-observed-event-after-account-remap',expected:[['2026-08-10','10']],actual:totals(switched),completeness:switched.completeness});
  const dbPath=path.join(root,'opencode.db'),db=new DatabaseSync(dbPath);
  db.exec('CREATE TABLE message (id TEXT, time_created INTEGER, data TEXT)');
  const insert=(id,i,o)=>db.prepare('INSERT INTO message VALUES (?,?,?)').run(id,Date.parse('2026-08-10T12:00:00Z'),JSON.stringify({role:'assistant',tokens:{input:i,output:o,total:i+o}}));
  insert('old',10,5);const sql=adapterFor('opencode'),sqlSource={dataPath:dbPath,sourceId,agentAccountId,agentId:'opencode'};
  const accepted=await sql.collect(sqlSource,range,{});
  db.exec('DELETE FROM message');insert('old',100,50);insert('new',4,3);
  const conflict=await sql.collect(sqlSource,range,reload(accepted.nextState));
  observations.push({case:'conflict-diagnostic-consumer',expectedTotals:[['2026-08-10','22']],actual:totals(conflict),completeness:conflict.completeness,adapterDiagnostics:conflict.diagnostics,normalizedDiagnostics:normalizeAdapterDiagnostics(conflict.diagnostics)});
  db.exec('DELETE FROM message');
  try {
    const legacy=await sql.collect(sqlSource,range,{serverBaseline:{acceptedAt:'2026-08-10T23:59:59.000Z',acceptedSequence:'7',entries:[{date:'2026-08-10',totalTokens:'100'}]}});
    observations.push({case:'missing-exact-cutover',expected:'fail closed',actual:totals(legacy),completeness:legacy.completeness,rejected:false});
  } catch(error) {observations.push({case:'missing-exact-cutover',expected:'fail closed',rejected:true,diagnosticCode:error.diagnosticCode??null});}
  // Use the implementation's own serialized ledger, then corrupt its version.
  const state=reload(accepted.nextState);
  if(state.eventLedger)state.eventLedger.version=-1;
  else if(state.ledger){const key=Object.keys(state.ledger)[0];state.ledger[key].parserVersion=-1;}
  try {const result=await sql.collect(sqlSource,range,state);observations.push({case:'corrupt-reloaded-state',expected:'fail closed',actual:totals(result),completeness:result.completeness,rejected:false});}
  catch(error){observations.push({case:'corrupt-reloaded-state',expected:'fail closed',rejected:true,diagnosticCode:error.diagnosticCode??null});}
  db.close();
} finally {await fs.rm(root,{recursive:true,force:true});}
console.log(JSON.stringify({observations},null,2));
