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
const bundle=path.join(temp,'bundle');
materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle});
fs.writeFileSync(path.join(temp,'project/opencode.json'),JSON.stringify({permission:{webfetch:'deny'}}));
const env={PATH:process.env.PATH,HOME:path.join(temp,'home'),TMPDIR:os.tmpdir(),
  ...Object.fromEntries(['config','data','cache','state'].map(n=>[`XDG_${n.toUpperCase()}_HOME`,path.join(temp,n)])),
  OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_CONFIG_DIR:bundle};
function debug(...args){const r=spawnSync(process.env.OPENCODE_BIN??'opencode',['debug',...args],{cwd:path.join(temp,'project'),env,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout);}
const config=debug('config');
assert.deepEqual(config.instructions,[path.join(bundle,'core.md')]);
assert.equal(fs.readFileSync(config.instructions[0],'utf8'),fs.readFileSync(path.join(root,'profiles/native/core.md'),'utf8'));
assert.deepEqual(config.plugin,[]);
assert.equal(config.permission.webfetch,'deny');
const agent=debug('agent','build');
assert.equal(agent.native,true);
for(const name of ['bash','read','edit','glob','grep','todowrite'])assert.equal(agent.tools[name],true);
assert.ok(agent.permission.some(p=>p.permission==='webfetch'&&p.action==='deny'));
console.log(JSON.stringify({passed:true,checks:['resolved instruction path and exact bytes','native build tools','project denial retained','no plugins'],providerRequests:0,
  limit:'Does not exercise model prompt delivery or instruction compliance.'}));
