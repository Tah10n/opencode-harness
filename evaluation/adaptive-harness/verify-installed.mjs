import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {run} from './run.mjs';
import {treeHash,sha,readTree} from './policy.mjs';
const [output,assets,scope='all']=process.argv.slice(2);
if(fs.existsSync(output))throw Error('Fresh verification output required');fs.mkdirSync(output,{recursive:true});
const read=file=>JSON.parse(fs.readFileSync(file));
const rows=[];
const normal=scope==='all'||scope==='normal';
const failures=scope==='all'||scope==='negative';
const cases=[...(normal?['plain-single','plain-multi','adaptive-k1']:[]),...(failures?['forbidden','symlink','outside','empty','selection','tamper','unknown','process','recording','request-budget','editor-time','composer-time','injection']:[])];
for(const name of cases) {
  const mode=name.startsWith('plain-')?name:'adaptive-k1',fault=mode===name?null:name,root=path.join(output,name);
  const budgetOptions=fault==='request-budget'?{requests:8}:fault==='editor-time'?{milliseconds:30000}:fault==='composer-time'?{milliseconds:85000}:undefined;
  const result=await run({output:root,assets,mode,scriptedOnly:true,fault,budgetOptions});
  const journal=read(path.join(root,'journal.json')),admitted=journal.filter(e=>e.event==='stage-admitted'),done=journal.filter(e=>e.event==='stage-finished');
  const capture=label=>path.join(root,'stages',label,'runs/task-P');
  for(const stage of admitted) {
    const container=path.join(capture(stage.label),'session/container.json');if(!fs.existsSync(container))continue;
    const c=read(container);assert.ok(c.argv.includes('--network')&&c.argv[c.argv.indexOf('--network')+1]==='none');
    const mounts=c.argv.filter((_,i)=>c.argv[i-1]==='--mount');assert.equal(mounts.length,4);assert.ok(mounts.every(m=>m.endsWith(',readonly')));assert.ok(!mounts.some(m=>m.includes('/admin')||m.includes('docker.sock')||m.includes('target=/judge')));
    const absent=spawnSync('docker',['inspect',c.name],{encoding:'utf8'});assert.notEqual(absent.status,0,'Owned container remains');assert.match(absent.stderr,/no such (object|container)/i);
  }
  for(const r of done){assert.equal(r.stop.terminationVerified,true);assert.equal(r.stop.relayRemoved,true);assert.equal(r.stop.activeProviderHandlers,0);}
  if(normal&&mode===name||fault==='injection') {
    assert.equal(result.status,'complete',JSON.stringify(result));
    const solvers=done.filter(e=>e.role==='solver');assert.equal(solvers.length,mode==='plain-single'?1:4);
    assert.equal(new Set(solvers.map(e=>e.container)).size,solvers.length);assert.equal(new Set(admitted.filter(e=>e.role==='solver').map(e=>e.inputHash)).size,1);
    assert.equal(result.selected.candidateCount,mode==='plain-single'?1:mode==='plain-multi'?4:2);
    const selected=read(path.join(result.selected.artifact,'snapshot.json')).tree;
    assert.equal(treeHash(selected),result.selected.sha256);assert.equal(treeHash(readTree(path.join(root,'delivered-tree'))),result.selected.sha256);
    assert.ok(Object.hasOwn(selected,'author.test.mjs'));assert.ok(fs.readFileSync(path.join(result.selected.artifact,'model.patch'),'utf8').includes('author.test.mjs'));
    assert.ok(journal.find(e=>e.event==='selection-committed').sequence<journal.find(e=>e.event==='independent-check-started').sequence);
    if(mode==='adaptive-k1') {
      assert.equal(result.independentStatus,0);assert.equal(result.selected.label,'agg1');
      assert.deepEqual(done.map(e=>e.role),['solver','editor','editor','solver','solver','composer','solver','selector']);
      assert.notEqual(done.find(e=>e.label==='inv1').patchHash,done.find(e=>e.label==='dom1').patchHash);
      assert.notEqual(journal.find(e=>e.event==='proposal'&&e.label==='inv1.a1').proposalHash,done.find(e=>e.label==='inv1').harnessHash,'Hash must include upstream autotrigger');
      assert.deepEqual(read(path.join(root,'upstream-result.json')).fell_back,[]);
    }else {assert.equal(done.some(e=>['editor','composer'].includes(e.role)),false);assert.ok(solvers.every(e=>e.harnessHash===treeHash({})));assert.notEqual(result.independentStatus,0,'Baseline is deliberately incomplete');}
  }else if(['forbidden','empty','symlink','outside'].includes(fault)) {
    assert.equal(result.status,'complete',JSON.stringify(result));
    const upstream=read(path.join(root,'upstream-result.json'));assert.deepEqual(upstream.fell_back,['inv1','dom1','agg1']);
    assert.ok(journal.filter(e=>e.event==='proposal').every(e=>!e.valid));
    assert.ok(done.filter(e=>e.role==='solver'&&e.label!=='base').every(e=>e.harnessHash===treeHash({'systemprompt.md':''})));
    assert.notEqual(result.independentStatus,0);
  }else {
    assert.ok(['incomplete','selection_failed'].includes(result.status),JSON.stringify(result));assert.equal(fs.existsSync(path.join(root,'selection.json')),false);
    assert.equal(fs.existsSync(path.join(root,'independent-check.json')),false);
    if(['unknown','process','recording'].includes(fault))assert.deepEqual(admitted.map(e=>e.label),['base']);
    if(['request-budget','editor-time'].includes(fault))assert.equal(admitted.some(e=>['inv1','dom1','agg1'].includes(e.label)),false);
    if(fault==='composer-time')assert.equal(admitted.some(e=>e.label==='agg1'),false);
    if(fault==='editor-time'||fault==='composer-time') {
      const probe=journal.find(e=>e.event==='deadline-probe');
      assert.equal(probe?.role,fault==='editor-time'?'editor':'composer','Deadline must expire during the intended role');
      assert.ok(result.budget.elapsedMs>=result.budget.policy.milliseconds);
    }
    if(fault==='recording') {
      assert.equal(result.reason,'evidence_incomplete');
      assert.equal(read(path.join(capture('base'),'recording-1.json')).status,'integrity_error');
    }
    if(fault==='request-budget') {
      assert.equal(result.budget.requests,8);
      assert.ok(journal.some(e=>e.event==='request-denied'));
    }
    if(fault==='selection')assert.equal(result.status,'selection_failed');
    if(fault==='tamper')assert.equal(fs.existsSync(path.join(capture('inv1'),'session/container.json')),false);
  }
  rows.push({name,...result,stages:admitted.map(e=>e.label)});fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({passed:rows.length===cases.length,realModelRequests:0,rows},null,2));console.log('PASS '+name+' '+JSON.stringify(result.budget.counts));
}
