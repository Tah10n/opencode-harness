import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const root=process.env.PILOT_SOURCE;const {classifyStatus}=await import(path.join(root,'src/status-core.mjs'));const {isRetryable}=await import(path.join(root,'src/retry.mjs'));const {statusLabel}=await import(path.join(root,'src/labels.mjs'));const {needsAuthRefresh}=await import(path.join(root,'src/auth.mjs'));
const expectedRows=[[100, {"label": "Continue", "retryable": false, "refreshAuth": false}], [103, {"label": "Early Hints", "retryable": false, "refreshAuth": false}], [200, {"label": "OK", "retryable": false, "refreshAuth": false}], [201, {"label": "Created", "retryable": false, "refreshAuth": false}], [204, {"label": "No Content", "retryable": false, "refreshAuth": false}], [301, {"label": "Moved Permanently", "retryable": false, "refreshAuth": false}], [302, {"label": "Found", "retryable": false, "refreshAuth": false}], [304, {"label": "Not Modified", "retryable": false, "refreshAuth": false}], [400, {"label": "Bad Request", "retryable": false, "refreshAuth": false}], [401, {"label": "Unauthorized", "retryable": false, "refreshAuth": true}], [403, {"label": "Forbidden", "retryable": false, "refreshAuth": false}], [404, {"label": "Not Found", "retryable": false, "refreshAuth": false}], [408, {"label": "Request Timeout", "retryable": true, "refreshAuth": false}], [409, {"label": "Conflict", "retryable": false, "refreshAuth": false}], [422, {"label": "Unprocessable Entity", "retryable": false, "refreshAuth": false}], [425, {"label": "Too Early", "retryable": true, "refreshAuth": false}], [429, {"label": "Too Many Requests", "retryable": true, "refreshAuth": false}], [500, {"label": "Internal Server Error", "retryable": true, "refreshAuth": false}], [502, {"label": "Bad Gateway", "retryable": true, "refreshAuth": false}], [503, {"label": "Service Unavailable", "retryable": true, "refreshAuth": false}], [504, {"label": "Gateway Timeout", "retryable": true, "refreshAuth": false}]];
test('all known labels flags and legacy helpers',()=>{
 for(const [status,row]of expectedRows){
 const category=['informational','success','redirect','client_error','server_error'][Math.floor(status/100)-1];
 assert.deepEqual(classifyStatus(status),{category,...row});assert.equal(statusLabel(status),row.label);assert.equal(isRetryable(status),row.retryable);assert.equal(needsAuthRefresh(status),row.refreshAuth);}
});
test('unknown codes keep range category but not generic retry',()=>{
 for(const [status,category]of [[199,'informational'],[299,'success'],[399,'redirect'],[499,'client_error'],[501,'server_error'],[599,'server_error']]){
 assert.deepEqual(classifyStatus(status),{category,label:'Unknown status',retryable:false,refreshAuth:false});assert.equal(isRetryable(status),false);}
});
test('invalid types/ranges never coerce or throw',()=>{
 const hostile={valueOf(){throw new Error('coerce');},toString(){throw new Error('coerce');}};
 for(const status of [0,99,600,-1,200.5,NaN,Infinity,'503',null,undefined,true,hostile]){
 assert.deepEqual(classifyStatus(status),{category:'unknown',label:'Unknown status',retryable:false,refreshAuth:false});assert.equal(statusLabel(status),'Unknown status');assert.equal(isRetryable(status),false);assert.equal(needsAuthRefresh(status),false);}
});
test('fresh output cannot alter shared table or later helpers',()=>{
 const row=classifyStatus(401);row.label='changed';row.retryable=true;row.refreshAuth=false;assert.equal(statusLabel(401),'Unauthorized');assert.equal(needsAuthRefresh(401),true);assert.equal(isRetryable(401),false);assert.notEqual(classifyStatus(401),classifyStatus(401));
});
