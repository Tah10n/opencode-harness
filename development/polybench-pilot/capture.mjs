// One external final Git-patch collector for all arms. No patch editing.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function captureCandidate(session,directory){
 const script=`const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');const baseline=${JSON.stringify(session.baseline)};if(!/^[a-f0-9]{40}$/.test(baseline))throw Error('Missing pre-author baseline');let delivery='/work/repo';const artifacts=delivery+'/.git/harness-task';if(${JSON.stringify(session.arm??null)}!=='P'&&fs.existsSync(artifacts)){const candidates=fs.readdirSync(artifacts).filter(n=>/^[a-f0-9-]{36}$/.test(n)&&fs.existsSync(path.join(artifacts,n,'worktree')));if(candidates.length>1)throw Error('Ambiguous delivery worktree');if(candidates.length===1)delivery=path.join(artifacts,candidates[0],'worktree');}const env={...process.env,GIT_INDEX_FILE:'/work/final-capture-index'};const git=args=>{const r=spawnSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','--git-dir=/work/repo/.git','--work-tree='+delivery,...args],{cwd:delivery,env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:20000});if(r.status!==0)throw Error(r.stderr||'Git capture failed');return r.stdout;};git(['read-tree',baseline]);git(['add','-A']);const patch=git(['diff','--cached','--binary','--full-index','--no-ext-diff','--no-textconv',baseline]);console.log(JSON.stringify({baseline,delivery,patch,hasArtifacts:fs.existsSync(artifacts)}));`;
 const result=session.exec(['node','-e',script]);
 fs.writeFileSync(path.join(directory,'patch-capture-process.json'),JSON.stringify({status:result.status,stderr:result.stderr,error:result.error?.message},null,2));
 if(result.status!==0)return {status:result.status??1};
 const {patch,...capture}=JSON.parse(result.stdout);
 fs.writeFileSync(path.join(directory,'model.patch'),patch,{flag:'wx'});
 fs.writeFileSync(path.join(directory,'patch-capture.json'),JSON.stringify(capture,null,2));
 // Keep diagnostic/task records, not full project copies or Git object databases.
 const archive=path.join(directory,'candidate.tar'),output=fs.openSync(archive,'wx',0o600);
 const args=capture.hasArtifacts?['tar','--exclude=worktree','--exclude=node_modules','-C','/work/repo/.git/harness-task','-cf','-','.']:['tar','-cf','-','--files-from=/dev/null'];
 const archived=spawnSync('docker',['exec',session.name,...args],{stdio:['ignore',output,'pipe'],timeout:30000});fs.closeSync(output);
 if(archived.status!==0)return {status:archived.status??1};
 const extracted=spawnSync('python3',[fileURLToPath(new URL('../native-task-ab/extract-candidate.py',import.meta.url)),archive,path.join(directory,'task-artifacts')],{encoding:'utf8',timeout:30000});
 fs.writeFileSync(path.join(directory,'capture.json'),JSON.stringify({format:'patch-and-task-artifacts-v1',status:extracted.status,stderr:extracted.stderr},null,2));
 return {status:extracted.status};
}
