import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {pathToFileURL} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const run=promisify(execFile), root=process.env.PROJECT, connector=path.join(root,'packages/connector');

const {parseProtocolResponse}=await import(pathToFileURL(path.join(connector,'lib/protocol.mjs')));
for(const status of [400,401,403,429,500,503])test(`valid HTTP ${status} rejects with typed error`,async()=>{
 await assert.rejects(parseProtocolResponse(new Response(JSON.stringify({error:'server_error'}),{status,headers:{'content-type':'application/json'}}),{kind:'empty'}),e=>e instanceof Error&&e.status===status&&e.code==='server_error');
});
for(const body of ['{}','{"error":"BAD"}','{"error":"bad\\ncode"}','{"error":"server_error","extra":true}','{'])test(`invalid body ${body}`,async()=>{
 await assert.rejects(parseProtocolResponse(new Response(body,{status:500,headers:{'content-type':'application/json'}}),{kind:'empty'}),e=>e.code==='invalid_server_response');
});
test('successful empty contract unchanged',async()=>assert.equal(await parseProtocolResponse(new Response(null,{status:204}),{kind:'empty'}),null));
