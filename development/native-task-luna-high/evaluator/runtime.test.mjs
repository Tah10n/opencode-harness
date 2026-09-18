import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {pathToFileURL} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const run=promisify(execFile), root=process.env.PROJECT, connector=path.join(root,'packages/connector');

test('exact complete legacy runtime survives fresh process reload and repeated prepare',async t=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'abc-legacy-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));const state=path.join(home,'.viberacing');
 await fs.mkdir(path.join(state,'bin'),{recursive:true});await fs.mkdir(path.join(state,'lib/adapters'),{recursive:true});
 const installation={version:1,id:'12345678-1234-4123-8123-123456789abc',secret:'legacy_installation_secret_that_is_long_enough'};
 await fs.writeFile(path.join(state,'installation.json'),JSON.stringify(installation));
 await fs.writeFile(path.join(state,'bin/viberacing.mjs'),'// old launcher\n');await fs.writeFile(path.join(state,'lib/config.mjs'),'// retained old bytes\n');
 const names=['browser','executables','readers','registry','runtime'];for(const name of names)await fs.writeFile(path.join(state,'lib',name+'.mjs'),'// retained legacy '+name+'\n');
 for(const name of ['antigravity','claude','codex','cursor','gemini','kimi','opencode','qwen-settings','qwen','shared'])await fs.writeFile(path.join(state,'lib/adapters',name+'.mjs'),'// retained legacy '+name+'\n');
 const module=pathToFileURL(path.join(connector,'lib/config.mjs')).href, cli=pathToFileURL(path.join(connector,'bin/viberacing.mjs')).href;
 const script=`import {readOrCreateInstallation,prepareRuntime} from ${JSON.stringify(module)};const i=await readOrCreateInstallation();const runtime=await prepareRuntime(new URL(${JSON.stringify(cli)}));console.log(JSON.stringify({i,runtime}));`;
 await assert.rejects(fs.access(path.join(state,'.viberacing-state')), {code:'ENOENT'});
 const env={...process.env,HOME:home};delete env.VIBERACING_STATE_DIR;
 const first=JSON.parse((await run(process.execPath,['--input-type=module','-e',script],{env})).stdout);
 const second=JSON.parse((await run(process.execPath,['--input-type=module','-e',script],{env})).stdout);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(state,'.viberacing-state'),'utf8')),{format:1});
 assert.deepEqual(first.i,installation);assert.deepEqual(second,first);
 assert.equal(await fs.readFile(path.join(state,'lib/config.mjs'),'utf8'),'// retained old bytes\n');
 const help=await run(process.execPath,[first.runtime,'help'],{env});assert.match(help.stdout,/connect/);
});
