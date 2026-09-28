// Research capture only. Never adds full artifact contents to a model request.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compactTaskResult} from '../../lib/native-task-plugin.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function resolveNativeResult({native,artifactRoot,capture,signal}) {
 try {
  signal?.throwIfAborted();
  assert.ok(Array.isArray(native.tools)&&Array.isArray(native.sessions)&&Array.isArray(native.messages));
  const calls=native.tools.filter(t=>t.data.tool==='harness_task');assert.equal(calls.length,1,'Ambiguous native task');
  const call=calls[0];assert.equal(call.data.state.status,'completed');
  const receipt=JSON.parse(call.data.state.output);
  assert.match(receipt.artifacts,/^\/work\/repo\/\.git\/harness-task\/[a-f0-9-]{36}$/);
  assert.equal(receipt.executionDirectory,receipt.artifacts+'/worktree');
  assert.equal(receipt.terminalPatch,receipt.artifacts+'/terminal.patch');
  assert.equal(capture.delivery,receipt.executionDirectory);
  const parent=native.sessions.find(s=>s.id===call.session_id);assert.ok(parent&&!parent.parent_id&&parent.directory==='/work/repo');
  assert.ok(receipt.sessions&&typeof receipt.sessions==='object');
  // The caller supplies the collector-owned root, never a path in model text.
  const root=path.resolve(artifactRoot),run=path.join(root,path.posix.basename(receipt.artifacts));
  for(const dir of [root,run])assert.ok(fs.lstatSync(dir).isDirectory()&&!fs.lstatSync(dir).isSymbolicLink());
  assert.equal(fs.realpathSync(run),run);
  const read=name=>{const file=path.join(run,name),st=fs.lstatSync(file);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<=32*1024*1024);return fs.readFileSync(file);};
  const json=name=>JSON.parse(read(name));
  const fullBytes=receipt.detailOmitted?read('result.json'):null;
  const workflow=fullBytes?JSON.parse(fullBytes):receipt;
  assert.equal(typeof workflow.revision,'string');assert.equal(typeof workflow.status,'string');
  assert.ok(Number.isSafeInteger(workflow.repairs)&&workflow.repairs>=0);
  for(const field of ['stages','patches','remaining','limits','completedCommands'])assert.ok(Array.isArray(workflow[field]),'Missing '+field);
  assert.equal(workflow.terminalPatch,receipt.terminalPatch);assert.equal(workflow.termination?.verified,true);
  if(fullBytes)assert.deepEqual(compactTaskResult(workflow,{artifacts:receipt.artifacts,executionDirectory:receipt.executionDirectory,sessions:receipt.sessions}),receipt,'Receipt/full result contradiction');
  const expectedChildDirectory=receipt.artifacts+'/investigation/repo/'+path.posix.relative('/work/repo',receipt.executionDirectory);
  assert.ok(receipt.sessions.author,'Missing main author');
  assert.equal(new Set(Object.values(receipt.sessions)).size,Object.keys(receipt.sessions).length,'Aliased sessions');
  for(const [role,id] of Object.entries(receipt.sessions)) {
   assert.ok(['author','investigator'].includes(role),'Unknown child role');
   assert.equal(typeof id,'string');
   const matches=native.sessions.filter(s=>s.id===id);assert.equal(matches.length,1);
   const expected=role==='investigator'?expectedChildDirectory:receipt.executionDirectory;
   assert.ok(matches[0].parent_id===parent.id&&matches[0].directory===expected,'Foreign native session or executionDirectory');
  }
  if(receipt.sessions.investigator){
   const delivery=json('investigation-result.json'),before=json('before-investigation.json');
   const authorEvents=json('tool-events.json'),childEvents=json('investigation-tool-events.json');
   const calls=native.tools.filter(t=>t.session_id===receipt.sessions.author&&t.data.tool==='harness_investigate'&&t.data.state.input?.action==='investigate'&&t.data.state.status==='completed');
   assert.equal(calls.length,1,'Missing explicit author investigation');
   assert.deepEqual(calls[0].data.state.input,delivery.request);
   const observed=authorEvents.find(e=>e.callID===calls[0].data.callID&&e.args?.action==='investigate');assert.ok(observed);
   assert.equal(before.status,'captured');assert.equal(before.snapshotSha256,delivery.authorSnapshot);assert.equal(observed.before,delivery.authorSnapshot);
   assert.equal(JSON.parse(calls[0].data.state.output).authorSnapshot,delivery.authorSnapshot);
   assert.deepEqual(delivery.commands,childEvents,'Child snapshot/event mismatch');
   for(const event of childEvents){
    assert.match(event.before,/^[a-f0-9]{64}$/);assert.match(event.after,/^[a-f0-9]{64}$/);
    assert.ok(native.tools.some(t=>t.session_id===receipt.sessions.investigator&&t.data.callID===event.callID),'Foreign child tool');
   }
   const messages=json('investigation-messages.json');assert.ok(messages.length);
   for(const message of messages){
    assert.equal(message.info.sessionID,receipt.sessions.investigator);
    const saved=native.messages.find(m=>m.id===message.info.id&&m.session_id===receipt.sessions.investigator);assert.ok(saved,'Unknown investigator message');
    if(message.info.role==='assistant'){
     assert.equal(message.info.path.cwd,expectedChildDirectory);assert.equal(saved.data.path.cwd,expectedChildDirectory);
    }
   }
   assert.equal(messages.at(-1).info.finish,'stop');assert.ok(!messages.at(-1).info.error);
   if(delivery.usable)assert.equal(read('investigation-tests.patch').toString(),delivery.patch);
  }
  for(const stage of workflow.stages){
   assert.equal(typeof stage.role,'string');assert.match(stage.label,/^[a-zA-Z0-9-]+$/);assert.equal(typeof stage.messageID,'string');assert.ok(Number.isFinite(stage.elapsedMs)&&stage.elapsedMs>=0);
   assert.equal(stage.role,'author','Terminal delivery must be authored');
   const id=receipt.sessions[stage.role];assert.ok(id);
   assert.ok(native.messages.some(m=>m.id===stage.messageID&&m.session_id===id),'Stage/session mismatch');
   const original=json(stage.label+'-original.json');assert.equal(original.info.id,stage.messageID);assert.equal(original.info.sessionID,id);assert.equal(original.info.finish,'stop');assert.ok(!original.info.error);assert.equal(original.info.path.cwd,receipt.executionDirectory);
  }
  const terminal=json('terminal.json'),original=json('original.json');
  assert.equal(original.base,capture.baseline);assert.equal(terminal.base,capture.baseline);
  assert.equal(terminal.status,'captured');assert.match(terminal.snapshotSha256,/^[a-f0-9]{64}$/);
  assert.equal(workflow.patches.at(-1)?.snapshotSha256,terminal.snapshotSha256,'Terminal snapshot mismatch');
  assert.match(workflow.patches.at(-1).label,/^[a-zA-Z0-9-]+$/);
  const final=json(workflow.patches.at(-1).label+'.json');
  assert.equal(final.snapshotSha256,terminal.snapshotSha256);assert.equal(final.diff,terminal.diff);
  const authorEvents=json('tool-events.json');
  if(authorEvents.length)assert.equal(authorEvents.at(-1).after,terminal.snapshotSha256,'Final author snapshot mismatch');
  const patch=read('terminal.patch');assert.equal(patch.toString(),terminal.diff);
  signal?.throwIfAborted();
  return {workflow:{...workflow,executionDirectory:receipt.executionDirectory,artifacts:receipt.artifacts,sessions:receipt.sessions},receipt,fullBytes,patch,proof:{run:path.basename(run),parentSession:parent.id,sessions:receipt.sessions,compact:!!fullBytes,resultSha256:fullBytes?sha(fullBytes):sha(call.data.state.output),snapshotSha256:terminal.snapshotSha256,patchSha256:sha(patch)}};
 } catch(error) {throw Object.assign(new Error('evidence_incomplete: '+error.message),{cause:error,kind:'evidence_incomplete'});}
}
