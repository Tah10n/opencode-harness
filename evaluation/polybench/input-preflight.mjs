// All prepared inputs are checked without OpenCode sessions or provider access.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {startContainer} from '../support/container-session.mjs';
import {manifest} from '../support/manifest.mjs';
import {captureInputManifest,compareInputManifest} from '../support/input-manifest.mjs';
import {privateJSON} from '../support/output-files.mjs';
import {prepareWorktreeDependencies} from './dependencies.mjs';

export async function verifyPreparedInput({source,toolchain,template,output,preparedEnvironment,expected=manifest(source)}){
 const session=await startContainer({source,toolchain,template,output:path.join(output,'session'),preparedEnvironment,workMemoryMb:8192,memoryMb:12288,onRequest:()=>{throw Error('Provider requests prohibited during input preflight');}});
 try{
  prepareWorktreeDependencies(session,preparedEnvironment.dependencyDirectories);
  const verification=await verifyPreparedSession(session,output,expected);
  Object.assign(verification,{source,environment:preparedEnvironment});
  privateJSON(path.join(output,'verification.json'),verification);return verification;
 }finally{if(session.close()!==0)throw Error('Input preflight container cleanup failed');}
}

export async function verifyPreparedSession(session,output,expected){
  const {manifest:got,receipt}=await captureInputManifest(session,output);compareInputManifest(got,expected);
  const result=session.exec(['node','-e',`(async()=>{const {reviewContext}=await import('/template/native-review-context.mjs');const r=reviewContext({cwd:'/work/repo',base:'HEAD',taskFile:'/work/repo/TASK.md',permissionRules:[{permission:'read',pattern:'*',action:'allow'}]});if(r.status!=='captured')throw Error(r.error);console.log(JSON.stringify({status:r.status,snapshotSha256:r.snapshotSha256,diffBytes:Buffer.byteLength(r.diff),taskBytes:Buffer.byteLength(r.task??'')}));})().catch(e=>{console.error(e.message);process.exitCode=1;});`]);
  if(result.error||result.signal||result.status!==0)throw Error('Prepared task Git context unavailable: '+(result.error?.message??result.stderr));
  const git=JSON.parse(result.stdout);if(git.status!=='captured')throw Error('Prepared Git context incomplete');
  return {passed:true,artifact:receipt,git,realProviderRequests:0};
}

export async function verifyReadyInputs(f,root,{verifyInput=verifyPreparedInput}={}){
 const ready=new Map();for(const a of f.attempts)if(a.preparationStatus!=='preparation_error')ready.set(a.source,a);
 const parent=path.join(root,'input-preflight');fs.mkdirSync(parent,{mode:0o700});
 for(const [source,a] of ready){
  const output=path.join(parent,a.task);fs.mkdirSync(output,{mode:0o700});
  const expected=f.runtimeManifests?.[source]??f.inputManifests[a.task+'-'+a.arm];
  if(!expected||!f.environments?.[source])throw Error('Frozen prepared input unavailable: '+a.task);
  await verifyInput({source,toolchain:f.toolchain,template:f.templates?.T??f.template,output,preparedEnvironment:f.environments[source],expected});
 }
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const {local}=await import('./campaign.mjs');const id=process.argv[2];
 if(!id||!/^[A-Za-z0-9_.-]+$/.test(id))throw Error('Explicit prepared task ID required');
 const source=local+'/author-inputs/'+id+'/source',output=local+'/input-preflight-'+id;
 fs.mkdirSync(output,{mode:0o700});
 await verifyPreparedInput({source,toolchain:local+'/toolchain',template:local+'/bundle',output,preparedEnvironment:JSON.parse(fs.readFileSync(local+'/environments.json'))[source]});
}
