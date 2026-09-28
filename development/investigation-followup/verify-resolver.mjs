import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolveNativeResult} from '../ledger-review-delivery/resolve-native-result.mjs';
import {compactTaskResult} from '../../lib/native-task-plugin.mjs';
const out=path.resolve(process.argv[2]??'local/investigation-followup/installed/first-H');
const get=n=>JSON.parse(fs.readFileSync(out+'/'+n));
const native=get('native-evidence.json'),capture=get('patch-capture.json'),artifactRoot=out+'/task-artifacts';
const resolved=resolveNativeResult({native,artifactRoot,capture});
// Collector sorts all files; terminal.patch appends untracked files. Compare applied trees, not diff ordering.
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'investigation-resolver-')));
const cases=[];
try {
 const trees=[];
 for(const [label,patch] of [['terminal',resolved.patch],['collector',fs.readFileSync(out+'/model.patch')]]){
  const dir=root+'/'+label;fs.cpSync(path.join(path.dirname(out),'scripted-input-'+path.basename(out).replace(/-H$/,'')),dir,{recursive:true});
  const command=(exe,args,input)=>{const r=spawnSync(exe,args,{cwd:dir,input,encoding:'utf8'});assert.equal(r.status,0,r.stderr+r.stdout);return r.stdout.trim();};
  command('git',['init','-q']);command('git',['add','.']);command('git',['-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base']);
  command('git',['apply','--check','-'],patch);command('git',['apply','-'],patch);command(process.execPath,['--test']);command('git',['add','-A']);trees.push(command('git',['write-tree']));
 }
 assert.equal(trees[0],trees[1]);
 fs.cpSync(artifactRoot,root,{recursive:true});
 const run=path.join(root,resolved.proof.run),full=JSON.parse(fs.readFileSync(run+'/result.json'));
 full.remaining=Array(1000).fill('Synthetic full-detail resolver evidence');
 const compact=compactTaskResult(full,{artifacts:resolved.receipt.artifacts,executionDirectory:resolved.receipt.executionDirectory,sessions:resolved.receipt.sessions});assert.ok(compact.detailOmitted);
 fs.writeFileSync(run+'/result.json',JSON.stringify(full));
 const cn=structuredClone(native);cn.tools.find(t=>t.data.tool==='harness_task').data.state.output=JSON.stringify(compact);
 const cr=resolveNativeResult({native:cn,artifactRoot:root,capture});assert.deepEqual(cr.patch,resolved.patch);assert.deepEqual(cr.workflow.stages,resolved.workflow.stages);assert.equal(cr.workflow.repairs,resolved.workflow.repairs);assert.deepEqual(cr.workflow.remaining,full.remaining);
 const reject=(name,mutate)=>{const n=structuredClone(native),c=structuredClone(capture);mutate(n,c);assert.throws(()=>resolveNativeResult({native:n,artifactRoot,capture:c}),/evidence_incomplete/);cases.push(name);};
 reject('foreign-author-session',n=>{n.sessions.find(s=>s.id===resolved.receipt.sessions.author).parent_id='foreign';});
 reject('child-cwd-substitution',n=>{n.sessions.find(s=>s.id===resolved.receipt.sessions.investigator).directory=resolved.receipt.executionDirectory;});
 reject('same-prefix-child',n=>{n.sessions.find(s=>s.id===resolved.receipt.sessions.investigator).directory+='/other';});
 reject('unknown-child',n=>{const t=n.tools.find(t=>t.data.tool==='harness_task'),r=JSON.parse(t.data.state.output);r.sessions.other='foreign';t.data.state.output=JSON.stringify(r);});
 reject('child-as-author-delivery',(n,c)=>{c.delivery=n.sessions.find(s=>s.id===resolved.receipt.sessions.investigator).directory;});
 reject('unbound-investigator',n=>{n.tools=n.tools.filter(t=>t.data.state.input?.action!=='investigate');});
 reject('foreign-child-message',n=>{n.messages=n.messages.filter(m=>m.session_id!==resolved.receipt.sessions.investigator);});
 for(const [name,mutate] of [
  ['missing-full-evidence',x=>{delete x.stages;}],['compact-contradiction',x=>{x.repairs++;}],
 ]){fs.writeFileSync(run+'/result.json',JSON.stringify(full));const x=structuredClone(full);mutate(x);fs.writeFileSync(run+'/result.json',JSON.stringify(x));assert.throws(()=>resolveNativeResult({native:cn,artifactRoot:root,capture}),/evidence_incomplete/);cases.push(name);}
 for(const [file,change] of [['terminal.json',x=>{x.snapshotSha256='0'.repeat(64);}],['terminal.json',x=>{x.diff='child instead of author';}],['before-investigation.json',x=>{x.snapshotSha256='0'.repeat(64);}]]){
  const p=run+'/'+file,bytes=fs.readFileSync(p),x=JSON.parse(bytes);change(x);fs.writeFileSync(p,JSON.stringify(x));assert.throws(()=>resolveNativeResult({native,artifactRoot:root,capture}),/evidence_incomplete/);fs.writeFileSync(p,bytes);cases.push(file+'-tampered');
 }
 const receipt={passed:true,fullAndCompact:true,negativeCases:cases,proof:resolved.proof,realProviderCalls:0};
 fs.writeFileSync(out+'/resolver-verification.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{fs.rmSync(root,{recursive:true,force:true});}
