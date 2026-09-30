import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {reviewContext as currentContext,gitInventoryLimit} from '../lib/native-review-context.mjs';
import {pathToFileURL} from 'node:url';
import {largeGitFixture} from './large-git-fixture.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'large-git-'));let root;
const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:80*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout;};
const rules=[{permission:'read',pattern:'*',action:'allow'}];
let reviewContext=currentContext;
if(process.argv.includes('--expect-original-failure')){
 const r=spawnSync('git',['show','25a446eaa7d5cb5c5776ab30d45ca338eb9ad581:lib/native-review-context.mjs'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const file=temp+'/original-context.mjs';fs.writeFileSync(file,r.stdout);reviewContext=(await import(pathToFileURL(file))).reviewContext;
}
try{for(const target of [2579497,2534961]){
 root=path.join(temp,String(target));fs.mkdirSync(root);
 git('init','-q');const started=Date.now();const names=largeGitFixture(root,target-12);
 fs.writeFileSync(root+'/value.txt','before\n');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@localhost','-c','core.hooksPath=/dev/null','commit','-qm','base');
 fs.writeFileSync(root+'/value.txt','after\n');const bytes=Buffer.byteLength(git('ls-files','-v','-z'));
 const result=reviewContext({cwd:root,base:'HEAD',permissionRules:rules});
 if(process.argv.includes('--expect-original-failure')){assert.equal(result.status,'incomplete');assert.match(result.error,/Git context unavailable/);console.log(JSON.stringify({originalFailure:result.error,bytes,elapsedMs:Date.now()-started}));}
 else{
  assert.equal(result.status,'captured',JSON.stringify(result));assert.equal(result.diff,git('diff','--no-ext-diff','--no-textconv','--ignore-submodules=none','--submodule=short','--binary','--full-index','HEAD','--'));
  for(const flag of ['--assume-unchanged','--skip-worktree']){git('update-index',flag,names.at(-1));assert.match(reviewContext({cwd:root,base:'HEAD',permissionRules:rules}).error,/Hidden index flags/);git('update-index',flag.replace('--','--no-'),names.at(-1));}
  const oddNames=['space name','Юникод','tab\tname','line\nname','\ufeffbom'];
  for(const name of oddNames)fs.writeFileSync(root+'/'+name,'exact bytes\n');
  const odd=reviewContext({cwd:root,base:'HEAD',permissionRules:rules});assert.equal(odd.status,'captured',JSON.stringify(odd));assert.deepEqual(odd.untracked.sort(),oddNames.sort());
  console.log(JSON.stringify({passed:true,bytes,files:names.length+1,diffBytes:Buffer.byteLength(result.diff),tailFlags:true,nulPaths:true,elapsedMs:Date.now()-started}));
 }
 }
 if(!process.argv.includes('--expect-original-failure')){
  const realGit=spawnSync('which',['git'],{encoding:'utf8'}).stdout.trim(),bin=temp+'/bin';fs.mkdirSync(bin);
  const wrapper=bin+'/git',pidFile=temp+'/git.pid';
  const oldPATH=process.env.PATH;
  try{for(const mode of ['overflow','truncated','invalid-utf8','exit','signal','timeout']){
   fs.writeFileSync(wrapper,'#!'+process.execPath+'\n'+`const fs=require('fs'),cp=require('child_process');const a=process.argv.slice(2);if(a.includes('ls-files')&&a.includes('-v')){fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));const mode=${JSON.stringify(mode)};if(mode==='overflow'){const b=Buffer.alloc(65536,120);for(let i=0;i<${gitInventoryLimit/65536+1};i++)fs.writeSync(1,b);}else if(mode==='truncated')fs.writeSync(1,'H missing-NUL');else if(mode==='invalid-utf8')fs.writeSync(1,Buffer.from([72,32,255,0]));else if(mode==='exit')process.exitCode=7;else if(mode==='signal')process.kill(process.pid,'SIGTERM');else setInterval(()=>{},1000);}else{const r=cp.spawnSync(${JSON.stringify(realGit)},a,{stdio:'inherit'});process.exit(r.status??1);}`,{mode:0o755});
   process.env.PATH=bin+path.delimiter+oldPATH;
   const result=reviewContext({cwd:root,base:'HEAD',permissionRules:rules});assert.equal(result.status,'incomplete',JSON.stringify(result));assert.equal(result.diff,undefined);assert.equal(result.task,undefined);
   const pid=Number(fs.readFileSync(pidFile));assert.throws(()=>process.kill(pid,0),e=>e.code==='ESRCH');
   console.log(JSON.stringify({gitFailure:mode,rejected:true,childAbsent:true,error:result.error}));
  }
  process.env.PATH=path.join(temp,'missing-git');const missing=reviewContext({cwd:root,base:'HEAD',permissionRules:rules});assert.equal(missing.status,'incomplete');assert.match(missing.error,/ENOENT/);assert.equal(missing.diff,undefined);
  console.log(JSON.stringify({gitFailure:'launch',rejected:true,error:missing.error}));
  }finally{process.env.PATH=oldPATH;}
 }
}finally{fs.rmSync(temp,{recursive:true,force:true});}
