// Host-only preparation and evidence, using unchanged runtime/collector/resolver.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startContainer as start} from '../../native-task-integrated/container-session.mjs';
import {captureCandidate as capture} from '../../polybench-pilot/capture.mjs';
import {resolveNativeResult} from '../../ledger-review-delivery/resolve-native-result.mjs';
// Compare normal Git application, including file modes, without touching the
// author's index or worktree. Diff serialization order is not delivery identity.
export function verifyCapturedPatchTrees(session,captured,terminal,collector){
 const created=session.exec(['node','-e',"console.log(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'capture-trees-')))"]);
 assert.equal(created.status,0,'Capture comparison temporary directory unavailable');
 const temporary=created.stdout.trim();assert.ok(path.isAbsolute(temporary)&&path.basename(temporary).startsWith('capture-trees-'));
 try{
  const hashes={};
  for(const [role,bytes] of Object.entries({terminal:Buffer.from(terminal),collector:Buffer.from(collector)})){
   hashes[role]=createHash('sha256').update(bytes).digest('hex');
   // Keep individual native argv entries bounded even for large valid patches.
   for(let offset=0;offset<Math.max(1,bytes.length);offset+=32768){
    const part=bytes.subarray(offset,offset+32768).toString('base64');
    const written=session.exec(['node','-e',`require('fs').writeFileSync(${JSON.stringify(path.join(temporary,role+'.patch'))},Buffer.from(${JSON.stringify(part)},'base64'),{flag:${JSON.stringify(offset===0?'wx':'a')},mode:0o600})`]);
    assert.equal(written.status,0,'Capture comparison patch transfer failed');
   }
  }
  const script=`const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const baseline=${JSON.stringify(captured.baseline)},delivery=${JSON.stringify(captured.delivery)},temporary=${JSON.stringify(temporary)},hashes=${JSON.stringify(hashes)};
if(!/^[a-f0-9]{40}$/.test(baseline))throw Error('Invalid capture baseline');
const trees={};
for(const role of ['terminal','collector','delivery']){
 const env={...process.env,GIT_INDEX_FILE:path.join(temporary,role)};
 const git=(args,input)=>{const r=spawnSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','--git-dir='+path.join(process.cwd(),'.git'),'--work-tree='+delivery,...args],{env,input,encoding:'utf8',timeout:20000,maxBuffer:32*1024*1024});if(r.status!==0)throw Error('Capture tree '+role+' Git '+args[0]+' failed');return r.stdout.trim();};
 git(['read-tree',baseline]);
 if(role==='delivery')git(['add','-A']);
 else {const patch=fs.readFileSync(path.join(temporary,role+'.patch'));if(crypto.createHash('sha256').update(patch).digest('hex')!==hashes[role])throw Error('Transferred patch hash mismatch');if(patch.length)git(['apply','--cached','--binary','-'],patch);}
 trees[role]=git(['write-tree']);
}
if(trees.terminal!==trees.collector||trees.collector!==trees.delivery)throw Error('Captured patch trees differ from author delivery');
console.log(JSON.stringify(trees));`;
  const result=session.exec(['node','-e',script]);
  assert.equal(result.status,0,'Patch application or delivery-tree comparison failed');
  const trees=JSON.parse(result.stdout);
  assert.match(trees.terminal,/^[a-f0-9]{40}$/);
  assert.equal(trees.terminal,trees.collector);assert.equal(trees.collector,trees.delivery);
  return trees;
 }finally{
  const removed=session.exec(['node','-e',`require('fs').rmSync(${JSON.stringify(temporary)},{recursive:true,force:true})`]);
  assert.equal(removed.status,0,'Capture comparison temporary cleanup failed');
 }
}
export async function startContainer(options){
 const session=await start({...options,workMemoryMb:1536,memoryMb:3072});
 try{
  assert.equal(session.exec(['node','-e',"require('fs').writeFileSync('/work/config/project-shell.sh','true\\n')"]).status,0);
  const baseline=session.exec(['git','rev-parse','HEAD']);assert.equal(baseline.status,0);
  assert.equal(session.exec(['git','rev-list','--all','--count']).stdout.trim(),'1');
  assert.equal(session.exec(['git','remote']).stdout.trim(),'');
  session.baseline=baseline.stdout.trim();session.arm='I1';
  session.preparedEnvironment={projectPath:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'};
  return session;
 }catch(error){session.close();throw error;}
}
export function captureCandidate(session,out){
 const result=capture(session,out);if(result.status!==0)return result;
 // Bind the full M to actual delivery files/modes before the container is removed.
 const captured=JSON.parse(fs.readFileSync(out+'/patch-capture.json'));
 const inventory=session.exec(['node','-e',`const fs=require('fs'),p=require('path'),c=require('crypto'),out={};function visit(d,prefix=''){for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(e.name==='.git')continue;const f=p.join(d,e.name),rel=prefix+e.name,s=fs.lstatSync(f);if(s.isDirectory())visit(f,rel+'/');else out[rel]=s.isSymbolicLink()?{link:fs.readlinkSync(f)}:{sha256:c.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),executable:!!(s.mode&0o111)};}}visit(${JSON.stringify(captured.delivery)});console.log(JSON.stringify(out));`]);
 if(inventory.status!==0){session.evidenceComplete=false;return {status:1,errors:['Delivery inventory unavailable']};}
 fs.writeFileSync(out+'/delivery-inventory.json',inventory.stdout,{mode:0o600});
 // Resolution is an evidence classification, never another author turn.
 try{
  const resolved=resolveNativeResult({native:JSON.parse(fs.readFileSync(out+'/native-evidence.json')),artifactRoot:path.resolve(out,'task-artifacts'),capture:captured});
  const trees=verifyCapturedPatchTrees(session,captured,resolved.patch,fs.readFileSync(out+'/model.patch'));
  fs.writeFileSync(out+'/native-result-trees.json',JSON.stringify(trees,null,2),{mode:0o600});
  for(const [name,data] of Object.entries({'native-result-resolution':resolved.proof,'native-result-receipt':resolved.receipt,'native-result-full':resolved.workflow}))fs.writeFileSync(out+'/'+name+'.json',JSON.stringify(data,null,2),{mode:0o600});
 }catch(error){fs.writeFileSync(out+'/native-result-resolution-error.json',JSON.stringify({kind:'evidence_incomplete',message:error.message}),{mode:0o600});}
 return result;
}
captureCandidate.requiresOutputRetention=true;
