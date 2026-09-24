// One external final Git-patch collector for all arms. No patch editing.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {captureOutputs,privateJSON} from '../native-output-retention/output-files.mjs';
function capturePatch(session,directory){
 const script=`const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');const baseline=${JSON.stringify(session.baseline)};if(!/^[a-f0-9]{40}$/.test(baseline))throw Error('Missing pre-author baseline');let delivery='/work/repo';const artifacts=delivery+'/.git/harness-task';if(${JSON.stringify(session.arm??null)}!=='P'&&fs.existsSync(artifacts)){const candidates=fs.readdirSync(artifacts).filter(n=>/^[a-f0-9-]{36}$/.test(n)&&fs.existsSync(path.join(artifacts,n,'worktree')));if(candidates.length>1)throw Error('Ambiguous delivery worktree');if(candidates.length===1)delivery=path.join(artifacts,candidates[0],'worktree');}const env={...process.env,GIT_INDEX_FILE:'/work/final-capture-index'};const git=args=>{const r=spawnSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','--git-dir=/work/repo/.git','--work-tree='+delivery,...args],{cwd:delivery,env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:20000});if(r.status!==0)throw Error(r.stderr||'Git capture failed');return r.stdout;};git(['read-tree',baseline]);git(['add','-A']);const patch=git(['diff','--cached','--binary','--full-index','--no-ext-diff','--no-textconv',baseline]);console.log(JSON.stringify({baseline,delivery,patch,hasArtifacts:fs.existsSync(artifacts)}));`;
 const result=session.exec(['node','-e',script]);
 fs.writeFileSync(path.join(directory,'patch-capture-process.json'),JSON.stringify({status:result.status,stderr:result.stderr,error:result.error?.message},null,2));
 if(result.status!==0)return {status:result.status??1};
 const {patch,...capture}=JSON.parse(result.stdout);
 const savedPatch=path.join(directory,'model.patch');
 if(fs.existsSync(savedPatch)){if(!fs.readFileSync(savedPatch).equals(Buffer.from(patch)))throw Error('Previously saved patch differs');}else fs.writeFileSync(savedPatch,patch,{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(directory,'patch-capture.json'),JSON.stringify(capture,null,2));
 // Keep diagnostic/task records, not full project copies or Git object databases.
 const archive=path.join(directory,'candidate-'+Date.now()+'.tar'),output=fs.openSync(archive,'wx',0o600);
 const args=capture.hasArtifacts?['tar','--exclude=worktree','--exclude=node_modules','-C','/work/repo/.git/harness-task','-cf','-','.']:['tar','-cf','-','--files-from=/dev/null'];
 const archived=spawnSync('docker',['exec',session.name,...args],{stdio:['ignore',output,'pipe'],timeout:30000});fs.closeSync(output);
 if(archived.status!==0)return {status:archived.status??1};
 const artifactDir=path.join(directory,'task-artifacts-'+Date.now());
 const extracted=spawnSync('python3',[fileURLToPath(new URL('../native-task-ab/extract-candidate.py',import.meta.url)),archive,artifactDir],{encoding:'utf8',timeout:30000});
 fs.writeFileSync(path.join(directory,'capture.json'),JSON.stringify({format:'patch-and-task-artifacts-v1',status:extracted.status,stderr:extracted.stderr},null,2));
 if(extracted.status===0){
  if(!fs.existsSync(path.join(directory,'candidate.tar')))fs.renameSync(archive,path.join(directory,'candidate.tar'));
  if(!fs.existsSync(path.join(directory,'task-artifacts')))fs.renameSync(artifactDir,path.join(directory,'task-artifacts'));
 }
 return {status:extracted.status};
}

// Independent attempts: a Git/metadata failure must not skip available outputs.
export function captureCandidate(session,directory,options={}) {
 session.evidenceRequired=true;session.evidenceComplete=false;
 const errors=[];let patch,outputs;
 try{patch=capturePatch(session,directory);if(patch.status!==0)errors.push('Patch/task capture failed');}catch(e){errors.push('Patch/task capture: '+e.message);}
 try{outputs=captureOutputs(session,directory,options);if(outputs.status!==0)errors.push(...outputs.manifest.errors);}catch(e){errors.push('Native output capture: '+e.message);}
 const result={status:errors.length?1:0,kind:errors.length?'evidence_incomplete':'evidence_complete',patchStatus:patch?.status??1,outputStatus:outputs?.status??1,errors};
 privateJSON(path.join(directory,'evidence-capture.json'),result);
 session.evidenceComplete=result.status===0;
 return result;
}

// Lets the shared scheduler protect the source even if accounting fails first.
captureCandidate.requiresOutputRetention=true;
