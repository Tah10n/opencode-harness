import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const original=execFileSync('git',['show','f98a9612:development/native-task-ab/run-comparison.mjs'],{encoding:'utf8'});
const current=fs.readFileSync('development/native-task-ab/run-comparison.mjs','utf8');assert.equal(current,original);
const operation=fs.readFileSync('development/ledger-review-delivery/operation.mjs','utf8');
const section=s=>s.slice(s.indexOf('onRequest:(frame,rawSend,signal)=>{'),s.indexOf('\n  const setup=session.exec'));
assert.ok(section(original).startsWith('onRequest:(frame,rawSend,signal)=>{'));assert.equal(section(operation),section(original));
for(const name of ['container-session.mjs','container-relay.mjs']){
 const file='development/native-task-integrated/'+name;
 const before=execFileSync('git',['show','5bcc1c66:'+file],{encoding:'utf8'});
 assert.equal(fs.readFileSync(file,'utf8'),before.replace('>1800000','>3600000'));
}
console.log('PASS: identical request policy and shared scheduler; only two authorized ceiling changes');
