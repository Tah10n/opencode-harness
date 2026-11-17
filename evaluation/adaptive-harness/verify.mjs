import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {sha,treeHash,validateHarness,readTree,writeTree,Budget} from './policy.mjs';
import {run,directory} from './run.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'adaptive-policy-'));
try {
  const pin=JSON.parse(fs.readFileSync(path.join(directory,'upstream.json')));
  for(const [p,digest] of Object.entries(pin.files))assert.equal(sha(fs.readFileSync(path.join(directory,'vendor',p))),digest);
  assert.deepEqual(pin.changes,[]);
  for(const name of ['../escape.md','skills/x/../../escape.md','/tmp/file','opencode.json','scripts/check.py','skills/x/scripts/check.py','plugin/a.ts','hooks.json','.opencode/skills/x/SKILL.md','skills/X/SKILL.md'])assert.throws(()=>validateHarness({[name]:'x'}));
  for(const bad of [{},{'systemprompt.md':''},{'systemprompt.md':'x'.repeat(9000)},{'systemprompt.md':'\0'}])assert.throws(()=>validateHarness(bad));
  assert.equal(validateHarness({'systemprompt.md':'read public checks'}),treeHash({'systemprompt.md':'read public checks'}));
  const tree=path.join(temp,'tree');writeTree(tree,{'systemprompt.md':'safe'});
  const outside=path.join(temp,'outside');fs.writeFileSync(outside,'unchanged');fs.symlinkSync(outside,path.join(tree,'link'));
  assert.throws(()=>readTree(tree));assert.equal(fs.readFileSync(outside,'utf8'),'unchanged');fs.unlinkSync(path.join(tree,'link'));
  const before=treeHash(readTree(tree));fs.writeFileSync(path.join(tree,'systemprompt.md'),'replacement');assert.notEqual(treeHash(readTree(tree)),before);
  fs.chmodSync(path.join(tree,'systemprompt.md'),0o755);assert.throws(()=>readTree(tree));
  const b=new Budget({requests:2});b.request('solver');b.request('auxiliary');assert.throws(()=>b.request('editor'));assert.equal(b.used,2);assert.throws(()=>b.check());
  const output=path.join(temp,'unauthorized');await assert.rejects(()=>run({output,assets:outside}),/not authorized/);assert.equal(fs.existsSync(output),false);
  const py=spawnSync('python3',['-B','-c',`import sys;sys.path.insert(0,${JSON.stringify(directory)});from controller import SURFACE;from harness2.core.tree import autotrigger,validate;t={'systemprompt.md':'','skills/check/SKILL.md':'---\\nname: check\\ndescription: checking behavior\\n---\\nRead public checks.'};assert autotrigger(SURFACE,t)==['check'];validate(SURFACE,t,allow_subagents=False);assert 'check' in t['systemprompt.md'];print('upstream materialization validated')`],{encoding:'utf8'});
  assert.equal(py.status,0,py.stderr);
  console.log('PASS adaptive policy, immutable upstream, paths/types/size, materialization, shared admission and disabled real-provider path');
}finally {fs.rmSync(temp,{recursive:true,force:true});}
