import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {fixture,stream,digest} from './fixture.mjs';
const root=path.resolve(process.argv[2]);fs.mkdirSync(root,{recursive:true,mode:0o700});
let source=execFileSync('git',['show','0a56d5393f390ed360fd420ee0e8e2ffcd05c8f8:development/native-task-ab/run-comparison.mjs'],{encoding:'utf8'});
source=source.replace("'./native-run.mjs'",JSON.stringify(new URL('../native-task-ab/native-run.mjs',import.meta.url).href)).replace("'../native-task-investigation/availability-probe.mjs'",JSON.stringify(new URL('../native-task-investigation/availability-probe.mjs',import.meta.url).href));
fs.writeFileSync(root+'/historical-runner.mjs',source);const {runComparison}=await import(pathToFileURL(root+'/historical-runner.mjs'));
const r=await fixture(runComparison,root+'/case');assert.equal(r.hits,2);assert.ok(fs.existsSync(r.out+'/request-1.json'));assert.ok(!fs.existsSync(r.out+'/response-1.sse'));assert.ok(r.sent[0].bytes.equals(stream));assert.equal(r.records[0].serverCompletion,'completed');
const receipt={reproduced:true,source:'0a56d5393f390ed360fd420ee0e8e2ffcd05c8f8',experimentKind:'assertion-review-pair',localHTTPRequests:r.hits,requestSaved:true,responseSaved:false,clientBytes:r.sent[0].bytes.length,sha256:digest(stream),realProviderCalls:0};fs.writeFileSync(root+'/result.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
