// Complete file/mode identity after ordinary Git application; patch order is immaterial.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {manifest} from '../native-task-integrated/run.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function projectManifest(root){const tree=manifest(path.resolve(root));delete tree['TASK.md'];return tree;}
export function verifyPatches({baseline,patches,evidenceDir,expectedTree}){
 fs.mkdirSync(evidenceDir,{mode:0o700});let first=null;const receipts=[];
 for(const [i,patch]of patches.entries()){
  const target=path.join(evidenceDir,'apply-'+i);
  fs.cpSync(baseline,target,{recursive:true,verbatimSymlinks:true,filter:file=>{const relative=path.relative(baseline,file);return !relative.split(path.sep).includes('.git')&&relative!=='TASK.md';}});
  const git=(...args)=>execFileSync('git',args,{cwd:target,encoding:'utf8',maxBuffer:32*1024*1024});
  git('init','-q');git('add','-A');git('-c','core.hooksPath=/dev/null','-c','user.name=Patch check','-c','user.email=check@localhost','commit','-qm','Exact input snapshot');
  const patchFile=path.join(evidenceDir,'patch-'+i+'.diff');fs.writeFileSync(patchFile,patch,{flag:'wx',mode:0o600});
  git('apply','--index','--allow-empty',path.resolve(patchFile));const tree=projectManifest(target);
  if(first)assert.deepEqual(tree,first,'Patches produce different file bytes or modes');else first=tree;
  if(expectedTree)assert.deepEqual(tree,expectedTree,'Applied patch differs from actual delivery tree');
  receipts.push({sha256:hash(patch),bytes:Buffer.byteLength(patch),applied:true,treeSha256:hash(JSON.stringify(tree))});
 }
 const result={equivalent:true,actualTreeVerified:!!expectedTree,patches:receipts};
 fs.writeFileSync(evidenceDir+'/result.json',JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return result;
}
