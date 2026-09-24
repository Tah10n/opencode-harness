// Real CLI/persistence/adapter path with a loopback protocol fixture.
// Protocol response and installation helpers come from baseline config.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const execFileAsync=promisify(execFile);
const connectorPath='/workspace/packages/connector/bin/viberacing.mjs';
function usageResponse(body, overrides = {}) {
  const snapshots = body.snapshots ?? [];
  const sourceErrors = body.sourceErrors ?? [];
  const sequenceById = new Map(
    snapshots.map((snapshot) => [snapshot.sourceId, snapshot.syncSequence]),
  );
  return {
    acceptedEntries: snapshots.flatMap((snapshot) => snapshot.entries ?? []).length,
    acceptedSnapshots: snapshots.length,
    acceptedSourceErrors: sourceErrors.length,
    staleSourceErrors: 0,
    legacySourceErrorsIgnored: 0,
    staleSnapshots: 0,
    sourceSequences: [...snapshots, ...sourceErrors].map((item) => ({
      sourceId: item.sourceId,
      lastAcceptedSyncSequence: sequenceById.get(item.sourceId) ?? "0",
      accepted: sequenceById.has(item.sourceId),
    })),
    ...overrides,
  };
}

function reconciliationResponse(sources) {
  return {
    sources: sources.map((source) => ({
      sourceId: source.sourceId,
      status: source.status ?? "active",
      lastAcceptedSyncSequence: source.lastAcceptedSyncSequence ?? "0",
    })),
  };
}

function connectorEnvironment(home, extra = {}) {
  return {
    ...process.env,
    VIBERACING_STATE_DIR: join(home, ".viberacing"),
    CODEX_HOME: join(home, ".codex"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    KIMI_CODE_HOME: join(home, ".kimi-code"),
    KIMI_SHARE_DIR: join(home, ".kimi"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    OPENCODE_DB: "",
    QWEN_HOME: join(home, ".qwen"),
    QWEN_RUNTIME_DIR: "",
    GEMINI_CLI_HOME: home,
    ...extra,
  };
}


async function writeLocalSources(directory, sources) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".viberacing-state"), '{"format":1}\n');
  await writeFile(join(directory, "sources.json"), `${JSON.stringify({ version: 1, sources })}\n`);
}


async function writeMappedInstallation(home, origin, sources) {
  const directory = join(home, ".viberacing");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".viberacing-state"), '{"format":1}\n');
  await writeLocalSources(
    directory,
    sources.map(({ sourceId: _sourceId, accountLabel: _accountLabel, ...source }) => source),
  );
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin,
      deviceToken: "synthetic-device-token-that-is-long-enough",
      sources: sources.map((source) => ({
        clientSourceId: source.clientSourceId,
        sourceId: source.sourceId,
        ...(source.agentAccountId === undefined ? {} : { agentAccountId: source.agentAccountId }),
        agentId: source.agentId,
        accountLabel: source.accountLabel ?? source.suggestedLabel,
        collectionMethod: source.collectionMethod,
        lastAcceptedSyncSequence: "0",
      })),
    })}\n`,
  );
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: Object.fromEntries(sources.map((source) => [source.sourceId, "0"])),
    })}\n`,
  );
  return directory;
}

const date = offset => new Date(Date.now()-offset*86400000).toISOString().slice(0,10);
const firstDay=date(2),secondDay=date(1);
const cases=[
 ['claude_code','claude_jsonl','session.jsonl',(id,d,i,o)=>({type:'assistant',timestamp:d+'T12:00:00Z',message:{role:'assistant',id,usage:{input_tokens:i,output_tokens:o}}})],
 ['gemini_cli','gemini_session_json','session-usage.jsonl',(id,d,i,o)=>({type:'gemini',id,timestamp:d+'T12:00:00Z',usageMetadata:{input:i,output:o,total:i+o}})],
 ['qwen_code','qwen_stats_jsonl','token-usage-session.jsonl',(id,d,i,o)=>({schemaVersion:1,id,timestamp:d+'T12:00:00Z',inputTokens:i,outputTokens:o,totalTokens:i+o,cachedTokens:0,thoughtsTokens:0})],
 ['antigravity','antigravity_cli_capture','capture.jsonl',(id,d,i,o)=>({id,date:d,usage:{input_tokens:i,output_tokens:o,total_tokens:i+o}})],
 ['kimi_code','kimi_wire_jsonl','session-a/agents/main/wire.jsonl',(_id,d,i,o)=>({type:'usage.record',time:d+'T12:00:00Z',usage:{inputOther:i,output:o}})],
 ['opencode','opencode_sqlite','opencode.db',null],
];
for(const [agentId,collectionMethod,name,record] of cases)test(`${agentId}: CLI source isolation and persisted deletion retention`,async t=>{
 const home=await mkdtemp(join(tmpdir(),'cli-ledger-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
 const clients=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
 const sources=ids.map((sourceId,i)=>({sourceId,clientSourceId:clients[i],agentId,collectionMethod,dataPath:join(home,'source-'+i),supportedSurface:'cli',suggestedLabel:'Source '+i,accountLabel:'Account '+i}));
 const paths=sources.map(s=>join(s.dataPath,name));
 if(agentId==='opencode'||agentId==='antigravity')sources.forEach((s,i)=>s.dataPath=paths[i]);
 async function replace(i,id,day,input,output){
  const file=paths[i];await mkdir(dirname(file),{recursive:true});
  if(record)await writeFile(file,JSON.stringify(record(id,day,input,output))+'\n');
  else{const db=new DatabaseSync(file);try{db.exec('CREATE TABLE IF NOT EXISTS message (id TEXT, time_created INTEGER, data TEXT); DELETE FROM message');db.prepare('INSERT INTO message VALUES (?,?,?)').run(id,Date.parse(day+'T12:00:00Z'),JSON.stringify({role:'assistant',tokens:{input,output,cache:{read:0,write:0},reasoning:0}}));}finally{db.close();}}
 }
 await replace(0,'private-same-event',firstDay,10,5);await replace(1,'private-same-event',firstDay,30,5);
 const uploads=[];
 const server=createServer((request,response)=>{
  const chunks=[];request.on('data',x=>chunks.push(x));request.on('end',()=>{
   const body=chunks.length?JSON.parse(Buffer.concat(chunks)):{};
   let answer;
   if(request.url==='/api/installations/current')answer=reconciliationResponse(sources);
   else if(request.url==='/api/usage'){uploads.push(body);answer=usageResponse(body);}
   else if(request.url==='/api/installations/current/diagnostics')answer={acceptedEvents:body.events.length};
   else{response.writeHead(404).end();return;}
   response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(answer));
  });
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const directory=await writeMappedInstallation(home,'http://127.0.0.1:'+server.address().port,sources);
 const snapshots=async()=>{
  const start=uploads.length;
  const command=await execFileAsync(process.execPath,[connectorPath,'sync'],{env:connectorEnvironment(home),timeout:20000});
  const sent=uploads.slice(start).flatMap(x=>x.snapshots??[]);
  assert.equal(sent.length,2,command.stderr);assert.ok(sent.every(x=>x.completeness==='complete'));
  const json=JSON.stringify(uploads.slice(start));assert.doesNotMatch(json,/private-same-event|private-new-event/);assert.ok(!json.includes(home));
  const persisted=await readFile(join(directory,'state.json'),'utf8');assert.doesNotMatch(persisted,/private-same-event|private-new-event/);
  // Each command is a fresh process. The next invocation can only obtain state
  // via the real runtime/config persistence path, never this live test object.
  assert.ok(JSON.parse(persisted));
  return Object.fromEntries(sent.map(x=>[x.sourceId,x.entries.map(e=>[e.date,e.totalTokens])]));
 };
 const initial={[ids[0]]:[[firstDay,'15']],[ids[1]]:[[firstDay,'35']]};
 assert.deepEqual(await snapshots(),initial);assert.deepEqual(await snapshots(),initial);
 await replace(0,'private-new-event',secondDay,4,3);
 const expected={[ids[0]]:[[firstDay,'15'],[secondDay,'7']],[ids[1]]:[[firstDay,'35']]};
 assert.deepEqual(await snapshots(),expected);assert.deepEqual(await snapshots(),expected);
});
