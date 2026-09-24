// Configuration resolution only: no run/session command and no provider request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {materializeNativeTemplate} from '../lib/native-template.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-config-'));
for(const name of ['home','config','data','cache','state','project'])fs.mkdirSync(path.join(temp,name));
const review=process.argv.includes('--review');
const offline=process.argv.includes('--offline');
const bundle=path.join(temp,'bundle');
materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,review});
fs.writeFileSync(path.join(temp,'project/opencode.json'),JSON.stringify({permission:{webfetch:'deny',read:{'private/**':'deny'},external_directory:'ask'},...(offline?{agent:{build:{permission:{webfetch:'allow',read:{'ask/**':'ask'}}}}}:{})}));
const env={PATH:process.env.PATH,HOME:path.join(temp,'home'),TMPDIR:os.tmpdir(),
  ...Object.fromEntries(['config','data','cache','state'].map(n=>[`XDG_${n.toUpperCase()}_HOME`,path.join(temp,n)])),
  OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_CONFIG_DIR:bundle};
function debug(...args){const r=spawnSync(process.env.OPENCODE_BIN??'opencode',['debug',...args],{cwd:path.join(temp,'project'),env,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout);}
if(offline){
  // A global-only deny is insufficient when the selected native agent allows it.
  const before=debug('agent','build');
  assert.equal(before.permission.filter(p=>['*','webfetch'].includes(p.permission)).at(-1).action,'allow');
  env.OPENCODE_CONFIG_CONTENT=fs.readFileSync(path.join(root,'development/native-task-offline/build.json'),'utf8');
}
const config=debug('config');
assert.deepEqual(config.instructions,[path.join(bundle,'core.md')]);
assert.equal(fs.readFileSync(config.instructions[0],'utf8'),fs.readFileSync(path.join(root,'profiles/native/core.md'),'utf8'));
assert.deepEqual(config.plugin,[]);
assert.equal(config.permission.webfetch,'deny');
const agent=debug('agent','build');
assert.equal(agent.native,true);
for(const name of ['bash','read','edit','glob','grep','todowrite'])assert.equal(agent.tools[name],true);
assert.ok(agent.permission.some(p=>p.permission==='webfetch'&&p.action==='deny'));
if(offline){
  const permission=agent.permission.filter(p=>['*','webfetch'].includes(p.permission)).at(-1);
  assert.deepEqual(permission,{permission:'webfetch',pattern:'*',action:'deny'});
  assert.equal(config.permission.external_directory,'ask');
  assert.equal(config.permission.read['private/**'],'deny');
  assert.equal(config.agent.build.permission.read['ask/**'],'ask');
  assert.deepEqual(debug('config'),config,'Repeated override changes resolved config');
  assert.deepEqual(debug('agent','build'),agent,'Repeated override changes native agent');
  delete env.OPENCODE_CONFIG_CONTENT;
  assert.equal(debug('agent','build').permission.filter(p=>['*','webfetch'].includes(p.permission)).at(-1).action,'allow');
}
if(review){
  assert.equal(config.command['harness-review'].agent,'harness-reviewer');
  assert.equal(config.command['harness-review'].subtask,false);
  assert.equal(config.default_agent,undefined);
  const reviewer=debug('agent','harness-reviewer');
  for(const tool of ['bash','edit','task','todowrite'])assert.equal(reviewer.tools[tool],false,tool);
  for(const tool of ['read','glob','grep'])assert.equal(reviewer.tools[tool],true,tool);
  assert.ok(reviewer.permission.some(p=>p.permission==='read'&&p.pattern==='private/**'&&p.action==='deny'));
  assert.ok(reviewer.permission.some(p=>p.permission==='webfetch'&&p.action==='deny'));
}
console.log(JSON.stringify({passed:true,checks:['resolved instruction path and exact bytes','native build tools','project denial retained','no plugins',...(offline?['global-only denial overridden by agent','agent-scoped denial','other deny/ask rules retained','repeat application stable','ordinary resolution restored']:[])],providerRequests:0,
  limit:'Does not exercise model prompt delivery or instruction compliance.'}));
