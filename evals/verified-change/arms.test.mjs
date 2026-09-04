import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {installedRuntime,plainArm,harnessArm} from './arms.mjs';
const actual=await installedRuntime(fileURLToPath(new URL('../../product/verified-change',import.meta.url)));
async function fixture(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'verified-arm-fixture-'));fs.mkdirSync(path.join(directory,'src'));fs.writeFileSync(path.join(directory,'src/value.mjs'),'export const value=0;\n');fs.writeFileSync(path.join(directory,'README.md'),'Preserve the numeric API.\n');for(const args of [['init'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']]){const r=spawnSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd:directory,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}return actual.inspectWorkspace(directory);}
const options=original=>({original,task:'Return value 2.',image:'not-used-in-this-model-free-test',model:'fixture/model',variant:'low',budgetMs:10000});
test('B uses exact immutable A draft, separate session and candidate',async()=>{
 const original=await fixture(),roots=[],prompts=[];
 const runtime={...actual,createOpenCodeSession:async config=>{roots.push(config.sandbox.workspace);return {prompt:async prompt=>{prompts.push(prompt);const file=path.join(config.sandbox.workspace,'src/value.mjs');assert.match(fs.readFileSync(file,'utf8'),roots.length===1?/value=0/:/value=1/);fs.writeFileSync(file,`export const value=${roots.length};\n`);return {sessionID:String(roots.length),steps:1,usage:[]};}};}};
 const A=await plainArm(runtime,options(original));assert.equal(A.status,'completed');const hash=A.snapshot.fingerprint;
 const B=await plainArm(runtime,{...options(original),initialSnapshot:A.snapshot});assert.equal(B.status,'completed');assert.notEqual(roots[0],roots[1]);assert.equal(A.snapshot.fingerprint,hash);assert.equal(actual.treeFingerprint(A.snapshot.directory),hash);assert.match(prompts[1],/Review the existing draft/);assert.match(fs.readFileSync(path.join(B.snapshot.directory,'src/value.mjs'),'utf8'),/value=2/);assert.match(fs.readFileSync(path.join(original.workspace,'src/value.mjs'),'utf8'),/value=0/);
});
test('protected mutation cannot be an eligible draft',async()=>{
 const original=await fixture();const runtime={...actual,createOpenCodeSession:async config=>({prompt:async()=>{fs.writeFileSync(path.join(config.sandbox.workspace,'README.md'),'changed contract');return {};}})};
 const A=await plainArm(runtime,options(original));assert.equal(A.status,'scope_violation');assert.equal(fs.readFileSync(path.join(original.workspace,'README.md'),'utf8'),'Preserve the numeric API.\n');
});
test('expired preparation budget never submits a model request',async()=>{
 const original=await fixture();let calls=0;const runtime={...actual,createOpenCodeSession:async()=>({prompt:async()=>{calls++;return {};}})};
 const A=await plainArm(runtime,{...options(original),budgetMs:1});assert.equal(A.status,'timeout');assert.equal(calls,0);assert.ok(A.snapshot,'partial draft bytes are retained only for diagnosis');
});
test('C retains cleanup failure details and cannot verify isolation',async()=>{
 const original=await fixture(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'verified-c-error-'));
 fs.writeFileSync(path.join(directory,'error.json'),JSON.stringify({error:'SESSION_CLEANUP_UNVERIFIED: remaining descendants'}));
 const cli=path.join(directory,'cli.mjs');fs.writeFileSync(cli,`console.log(${JSON.stringify(JSON.stringify({stopReason:'execution_error',output:directory}))});process.exitCode=1;`);
 const C=await harnessArm({...actual,cli},{...options(original),initialSnapshot:{patchPath:path.join(directory,'unused.patch'),fingerprint:'original'}});
 assert.equal(C.status,'infrastructure_error');assert.match(C.error,/SESSION_CLEANUP_UNVERIFIED/);assert.equal(C.isolationVerified,false);
});
test('B shared-draft mismatch remains an isolation failure',async()=>{
 const original=await fixture(),A=await plainArm({...actual,createOpenCodeSession:async()=>({prompt:async()=>({})})},options(original));
 const B=await plainArm(actual,{...options(original),initialSnapshot:{...A.snapshot,fingerprint:'mismatch'}});
 assert.equal(B.error,'SHARED_DRAFT_MISMATCH');assert.equal(B.isolationVerified,false);
});
test('normal controller timeout does not require a catch-path error file',async()=>{
 const original=await fixture(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'verified-c-timeout-')),cli=path.join(directory,'cli.mjs');
 const snapshot={fingerprint:'original'};fs.writeFileSync(cli,`console.log(${JSON.stringify(JSON.stringify({stopReason:'timeout',output:directory,snapshots:[{snapshot}],selected:snapshot}))});process.exitCode=2;`);
 const C=await harnessArm({...actual,cli},{...options(original),initialSnapshot:{patchPath:path.join(directory,'unused.patch'),fingerprint:'original'}});
 assert.equal(C.status,'timeout');assert.equal(C.error,undefined);assert.equal(C.isolationVerified,true);
});
