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
  for(const [role,id] of Object.entries(receipt.sessions)) {
   assert.equal(typeof id,'string');const session=native.sessions.find(s=>s.id===id);
   assert.ok(session&&session.parent_id===parent.id&&session.directory===receipt.executionDirectory,'Foreign native session');
   assert.ok(role.length);
  }
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
  for(const stage of workflow.stages){
   assert.equal(typeof stage.role,'string');assert.match(stage.label,/^[a-zA-Z0-9-]+$/);assert.equal(typeof stage.messageID,'string');assert.ok(Number.isFinite(stage.elapsedMs)&&stage.elapsedMs>=0);
   const id=receipt.sessions[stage.role];assert.ok(id);
   assert.ok(native.messages.some(m=>m.id===stage.messageID&&m.session_id===id),'Stage/session mismatch');
   const original=json(stage.label+'-original.json');assert.equal(original.info.id,stage.messageID);assert.equal(original.info.sessionID,id);assert.equal(original.info.finish,'stop');assert.ok(!original.info.error);
  }
  const terminal=json('terminal.json'),original=json('original.json');
  assert.equal(original.base,capture.baseline);assert.equal(terminal.base,capture.baseline);
  assert.equal(terminal.status,'captured');assert.match(terminal.snapshotSha256,/^[a-f0-9]{64}$/);
  assert.equal(workflow.patches.at(-1)?.snapshotSha256,terminal.snapshotSha256,'Terminal snapshot mismatch');
  const patch=read('terminal.patch');assert.equal(patch.toString(),terminal.diff);
  signal?.throwIfAborted();
  return {workflow:{...workflow,executionDirectory:receipt.executionDirectory,artifacts:receipt.artifacts,sessions:receipt.sessions},receipt,fullBytes,patch,proof:{run:path.basename(run),parentSession:parent.id,sessions:receipt.sessions,compact:!!fullBytes,resultSha256:fullBytes?sha(fullBytes):sha(call.data.state.output),snapshotSha256:terminal.snapshotSha256,patchSha256:sha(patch)}};
 } catch(error) {throw Object.assign(new Error('evidence_incomplete: '+error.message),{cause:error,kind:'evidence_incomplete'});}
}
