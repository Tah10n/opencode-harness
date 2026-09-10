import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {pathToFileURL} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const run=promisify(execFile), root=process.env.PROJECT, connector=path.join(root,'packages/connector');

test('installed runtime can load the refactored CLI after source-only preparation',async t=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'abc-runtime-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 const env={...process.env,HOME:home,VIBERACING_STATE_DIR:path.join(home,'.viberacing')};
 const script=`import {prepareRuntime} from ${JSON.stringify(pathToFileURL(path.join(connector,'lib/config.mjs')).href)};console.log(await prepareRuntime(new URL(${JSON.stringify(pathToFileURL(path.join(connector,'bin/viberacing.mjs')).href)})));`;
 const installed=(await run(process.execPath,['--input-type=module','-e',script],{env})).stdout.trim();
 const help=await run(process.execPath,[installed,'help'],{env});assert.match(help.stdout,/connect/);
 const offline=await run(process.execPath,[installed,'disconnect'],{env});assert.match(offline.stdout,/disconnect|not connected/i);
});
