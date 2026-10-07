// Post-hoc diagnosis of a known defect. Never runs OpenCode or a provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareObservations} from '../../../../lib/native-task-observations.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const batch = path.resolve(process.argv[2] ?? path.join(repository, 'local/feedback-calibration-20261007/batch'));
const frozenSource = '2b45773455f48fcd886c4ef7407f84e9649721ad';
const taskPath = 'evaluation/feedback-development/calibration/tasks/c02-durable-outbox/source';
const source = path.join(batch, 'inputs/c02-durable-outbox');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'och-outbox-posthoc-'));
const env = {...process.env, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:os.devNull, GIT_TERMINAL_PROMPT:'0'};
const run = (program, args, cwd, input) => {
  const result = spawnSync(program, args, {cwd, input, env, encoding:'utf8', timeout:30000, maxBuffer:4*1024*1024});
  if (result.error || result.signal) throw result.error ?? Error(result.signal);
  return result;
};
const git = (args, cwd, input) => {
  const result = run('git', ['-c','core.hooksPath=/dev/null',...args], cwd, input);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const manifest = root => {
  const entries = [];
  const walk = (directory, prefix = '') => {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory,name), relative = prefix + name;
      const stat = fs.lstatSync(file);
      assert(!stat.isSymbolicLink(), 'No symlink in retained source');
      if (stat.isDirectory()) walk(file,relative+'/');
      else if (stat.isFile()) entries.push([relative,sha(fs.readFileSync(file))]);
    }
  };
  walk(root); return entries;
};
const sourceManifest = manifest(source);
const originalFiles = new Map();
const retain = file => { const bytes = fs.readFileSync(file); originalFiles.set(file,sha(bytes)); return bytes; };
for (const [name,digest] of sourceManifest) {
  const committed = git(['show',frozenSource+':'+taskPath+'/'+name],repository);
  assert.equal(sha(committed),digest,'Retained public source changed: '+name);
  retain(path.join(source,name));
}
for (const file of ['lib/native-task-observations.mjs','lib/native-task-workflow.mjs']) {
  assert.equal(sha(fs.readFileSync(path.join(repository,file))),sha(git(['show',frozenSource+':'+file],repository)), 'Observer/runtime changed');
}
const task = fs.readFileSync(path.join(source,'TASK.md'),'utf8');
assert(task.includes('counts.pending\nincludes inflight work'));

// Both expectations come solely from TASK.md, not from acceptance/gold/evaluator.
const probe = `import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Outbox,MemoryStore,counts} from '../src/index.mjs';
for (const total of [2,3]) test('public counts.pending includes inflight: '+total,async()=>{
 let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 const store=new MemoryStore(),queue=new Outbox(store,async record=>{if(record.id==='a'){started();await gate;}});
 queue.enqueue('a',1);queue.enqueue('b',2);
 const active=queue.drain({limit:1});await entered;
 try {
  assert.deepEqual(store.load().records.map(r=>r.status),['inflight','pending']);
  if(total===3)queue.enqueue('c',3);
  assert.deepEqual(counts(queue),{pending:total,sent:0});
 } finally {release();await active;await queue.close();}
});
`;
// Path-only normalization; compare every remaining observation field, including
// full test-change hunks. Native commands, outputs and snapshot hashes stay exact.
const comparable = observation => {
  const value = structuredClone(observation);
  for (const key of ['checks','latestChecks','unresolvedFailures'])
    for (const check of value[key] ?? []) delete check.cwd;
  for (const change of value.testChanges ?? [])
    change.diff = change.diff.slice(change.diff.indexOf('@@'));
  return value;
};
const receipt = {kind:'post-hoc diagnosis of known error; not independent quality confirmation',
  inferenceRequests:0, frozenSource, sourceManifestSha256:sha(JSON.stringify(sourceManifest)), rows:[]};
try {
  for (const arm of ['P','H0','H1']) {
    const input = path.join(batch,'runs/c02-durable-outbox-'+arm), directory = path.join(scratch,arm);
    const patch = retain(path.join(input,'model.patch'));
    retain(path.join(input,'result.json'));
    const row = {arm, patchSha256:sha(patch)};
    fs.cpSync(source,directory,{recursive:true});
    git(['init','-q'],directory);
    git(['add','.'],directory);
    git(['-c','user.name=Posthoc','-c','user.email=posthoc@example.invalid','commit','-qm','unchanged public baseline'],directory);
    let artifacts;
    if (arm !== 'P') {
      const root = path.join(input,'task-artifacts');
      const candidates = fs.readdirSync(root).filter(name=>fs.existsSync(path.join(root,name,'D0.json')));
      assert.equal(candidates.length,1); artifacts = path.join(root,candidates[0]);
      const original = json(path.join(artifacts,'original.json'));
      assert.equal(original.task,task);
      assert.equal(original.diff,'');
    }
    const observerArtifacts = path.join(scratch,arm+'-observer');fs.mkdirSync(observerArtifacts);
    const observe = prepareObservations({directory,artifacts:observerArtifacts,
      permissionRules:[{permission:'*',pattern:'*',action:'allow'}],task});
    git(['apply','--binary','--whitespace=nowarn','-'],directory,patch);
    if (artifacts) {
      for (const name of ['D0.patch','final.patch']) assert.equal(sha(retain(path.join(artifacts,name))),sha(patch));
      const snapshotBytes = retain(path.join(artifacts,'D0.json'));
      const eventBytes = retain(path.join(artifacts,'tool-events.json'));
      const savedBytes = retain(path.join(artifacts,'D0-observations.json'));
      const events = JSON.parse(eventBytes);
      const saved = JSON.parse(savedBytes);
      const nativeDirectory = saved.checks.find(check=>check.cwd)?.cwd;
      for (const event of events) {
        if (event.args?.workdir === nativeDirectory) event.args.workdir = directory;
      }
      const replay = observe(events,JSON.parse(snapshotBytes));
      assert.deepEqual(comparable(replay),comparable(saved));
      row.observer = {allFieldsMatchAfterPathNormalization:true, eventsSha256:sha(eventBytes),
        snapshotSha256:saved.snapshotSha256, reasons:replay.reasons,correctionReasons:replay.correctionReasons,
        limits:replay.limits,checksCurrent:replay.checksCurrent,
        finalPublicCheck:replay.latestChecks.filter(check=>check.command==='npm test').map(check=>({eventIndex:check.eventIndex,callID:check.callID,exit:check.exit,tests:check.tests,current:check.current,successful:check.successful})),
        retainedWrongAssertion:replay.testChanges.some(change=>change.after?.includes("assert.deepEqual(counts(q),{pending:1,sent:0});record.payload.n=99;await gate.promise;"))};
      row.D0EqualsFinal = true;
    }
    const publicCheck = run('npm',['test'],directory);
    assert.equal(publicCheck.status,0,publicCheck.stdout+publicCheck.stderr);
    row.authorSuite = {exit:publicCheck.status,output:publicCheck.stdout+publicCheck.stderr};
    if (arm==='H1') {
      const focused = run(process.execPath,['--test','--test-name-pattern=drain joins, dispatches sequentially, and leaves new records for later','test/public.test.mjs'],directory);
      assert.equal(focused.status,0,focused.stdout+focused.stderr);
      row.wrongAuthorExpectation = {exit:focused.status,output:focused.stdout+focused.stderr};
    }
    fs.writeFileSync(path.join(directory,'test/posthoc-contract.test.mjs'),probe);
    const contractCheck = run(process.execPath,['--test','test/posthoc-contract.test.mjs'],directory);
    assert.equal(contractCheck.status,arm==='H1'?1:0,contractCheck.stdout+contractCheck.stderr);
    row.publicContractProbe = {exit:contractCheck.status,output:contractCheck.stdout+contractCheck.stderr};
    receipt.rows.push(row);
  }
  for (const [file,digest] of originalFiles) assert.equal(sha(fs.readFileSync(file)),digest,'Historical evidence mutated');
  receipt.retainedInputsUnchanged = true;
} finally {
  fs.rmSync(scratch,{recursive:true,force:true});
  receipt.disposableCopiesRemoved = !fs.existsSync(scratch);
}
console.log(JSON.stringify(receipt,null,2).replaceAll(scratch,'<disposable>'));
