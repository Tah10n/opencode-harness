// Model-free pinned-container check of the complete public VibeRacing baseline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prepareInvestigation} from '/template/native-task-investigation.mjs';

const root='/work',source=path.join(root,'source'),archive='/input/baseline.tar';
fs.mkdirSync(source,{recursive:true});fs.mkdirSync('/work/tmp',{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const command=(name,args,cwd=source,options={})=>{
  const r=spawnSync(name,args,{cwd,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});
  assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout;
};
assert.equal(hash(fs.readFileSync(archive)),'ea549fcc30d8facef77af8ebebc280910a24537e44ad8c6cfcbdc4888b5dcab1');
command('tar',['-xf',archive,'-C',source]);
command('git',['init','-q']);command('git',['add','.']);
command('git',['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','baseline']);
const rules=[{permission:'*',pattern:'*',action:'allow'}];
const copy=await prepareInvestigation({directory:source,artifacts:'/work/artifacts',base:'HEAD',rules,active(){}});
assert.equal(copy.initial.status,'captured');
const names=command('git',['ls-files','-z']).split('\0').filter(Boolean);
let total=0,assets=0;
for(const name of names){
  const original=path.join(source,name),child=path.join(copy.directory,name);
  const bytes=fs.readFileSync(original);total+=bytes.length;
  assert.deepEqual(fs.readFileSync(child),bytes,name);
  assert.equal(fs.statSync(child).mode&0o777,fs.statSync(original).mode&0o777,name);
  if(/\.(?:png|ttf)$/.test(name))assets++;
}
assert.equal(names.length,258);assert.equal(total,3428502);assert.equal(assets,8);
const checks=['readers','config','protocol'].map(name=>{
  const file=`packages/connector/test/${name}.test.mjs`;
  const r=spawnSync(process.execPath,['--test',file],{cwd:copy.directory,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  return {name,exit:r.status,passed:Number(/(?:ℹ|#) pass (\d+)/.exec(r.stdout)?.[1]??0),
    failed:Number(/(?:ℹ|#) fail (\d+)/.exec(r.stdout)?.[1]??0),error:r.error?.message??null};
});
assert.ok(checks.every(c=>c.exit===0&&c.failed===0),JSON.stringify(checks));
console.log(JSON.stringify({baseline:'2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd',
  files:names.length,bytes:total,assets,exactCopy:true,childCapture:copy.initial.status,checks,realProviderRequests:0}));
