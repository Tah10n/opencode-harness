import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chain,save,get,hash,git,init,apply} from './chain.mjs';import {projectManifest} from './patch-integrity.mjs';
const root=path.resolve('local/ledger-review-delivery/real'),baseline=path.resolve('local/ledger-review-delivery/baseline');
const summary=await chain({root,baseline,task:fs.readFileSync('development/plain-ledger-native-high/original-task.txt','utf8'),environment:fs.readFileSync('development/plain-ledger-native-high/environment.txt','utf8'),onStage:stage=>console.log(JSON.stringify({startingStage:stage,at:new Date().toISOString()}))});
// Artifact-only salvage never reopens admission or submits a request.
if(summary.status!=='finished'){
 const artifacts={status:'partial',stages:summary.stages,files:{},delivery_apply:'unknown'};
 for(const [stage,name]of [['A','D0.partial.patch'],['F','delta.partial.patch']]){
  const patch=root+'/'+stage+'/runs/account-switch-ledger-'+stage+'/model.patch';
  if(fs.existsSync(patch)){fs.copyFileSync(patch,root+'/'+name,fs.constants.COPYFILE_EXCL);artifacts.files[name]=hash(fs.readFileSync(patch));}
 }
 const r=root+'/R/runs/account-switch-ledger-R/response.md';if(fs.existsSync(r)){fs.copyFileSync(r,root+'/R.partial.md',fs.constants.COPYFILE_EXCL);artifacts.files['R.partial.md']=hash(fs.readFileSync(r));}
 if(artifacts.files['D0.partial.patch'])try{
  const target=root+'/partial';fs.cpSync(baseline,target,{recursive:true,verbatimSymlinks:true});init(target);apply(target,root+'/D0.partial.patch');if(artifacts.files['delta.partial.patch'])apply(target,root+'/delta.partial.patch');git(target,'add','-A');fs.writeFileSync(root+'/M.partial.patch',git(target,'diff','--cached','--binary','--full-index','HEAD'),{flag:'wx',mode:0o600});
  const check=root+'/partial-portable';fs.cpSync(baseline,check,{recursive:true,verbatimSymlinks:true});init(check);apply(check,root+'/M.partial.patch');assert.deepEqual(projectManifest(check),projectManifest(target));artifacts.delivery_apply=true;artifacts.files['M.partial.patch']=hash(fs.readFileSync(root+'/M.partial.patch'));
 }catch(e){artifacts.exportError=e.message;}
 save(root+'/partial-artifacts.json',artifacts);
}
console.log(JSON.stringify({status:summary.status,pause:summary.pause,stages:summary.stages}));
