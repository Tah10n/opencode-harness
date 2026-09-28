// Host-only preparation and evidence, using unchanged runtime/collector/resolver.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startContainer as start} from '../../native-task-integrated/container-session.mjs';
import {captureCandidate as capture} from '../../polybench-pilot/capture.mjs';
import {resolveNativeResult} from '../../ledger-review-delivery/resolve-native-result.mjs';
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
  assert.equal(resolved.patch.toString(),fs.readFileSync(out+'/model.patch','utf8'));
  for(const [name,data] of Object.entries({'native-result-resolution':resolved.proof,'native-result-receipt':resolved.receipt,'native-result-full':resolved.workflow}))fs.writeFileSync(out+'/'+name+'.json',JSON.stringify(data,null,2),{mode:0o600});
 }catch(error){fs.writeFileSync(out+'/native-result-resolution-error.json',JSON.stringify({kind:'evidence_incomplete',message:error.message}),{mode:0o600});}
 return result;
}
captureCandidate.requiresOutputRetention=true;
