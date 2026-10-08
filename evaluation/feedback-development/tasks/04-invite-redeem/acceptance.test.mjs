import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=process.env.FEEDBACK_PROJECT_ROOT;
const load=name=>import(pathToFileURL(path.join(project,name)).href);
const {Invites}=await load('src/invites.mjs');
function withStore(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'invites-accept-'));try{const file=path.join(dir,'state.json');fn(file,new Invites(file));}finally{fs.rmSync(dir,{recursive:true});}}
test('fd04.reject-before-consume',()=>withStore((file,s)=>{
 assert.deepEqual(s.read(),{tokens:{},members:{}}); assert.equal(s.create('a','red'),true);
 for(const args of [['a','u','blue'],['a',' ','red'],['a',null,'red'],['missing','u','red']]) {
  const bytes=fs.readFileSync(file,'utf8'); assert.equal(s.redeem(...args),false); assert.equal(fs.readFileSync(file,'utf8'),bytes);
  assert.deepEqual(new Invites(file).read().tokens.a,{team:'red',used:false});
 }
 assert.equal(s.redeem('a','u','red'),true); assert.deepEqual(new Invites(file).read(),{tokens:{a:{team:'red',used:true}},members:{red:['u']}});
}));
test('fd04.replay-and-other-state',()=>withStore((file,s)=>{
 s.create('a','red');s.create('b','red');s.create('c','blue');
 assert.equal(s.redeem('a','u','red'),true); const reopened=new Invites(file), before=fs.readFileSync(file,'utf8');
 assert.equal(reopened.redeem('a','v','red'),false); assert.equal(fs.readFileSync(file,'utf8'),before);
 assert.equal(reopened.redeem('b','u','red'),true); assert.deepEqual(reopened.read().members.red,['u']);
 assert.deepEqual(reopened.read().tokens.c,{team:'blue',used:false});
 assert.equal(reopened.redeem('c','v','blue'),true); assert.deepEqual(new Invites(file).read().members,{red:['u'],blue:['v']});
}));
test('fd04.create-revoke-idempotency',()=>withStore((file,s)=>{
 assert.equal(s.create('a','red'),true); const before=fs.readFileSync(file,'utf8');
 assert.equal(s.create('a','blue'),false); assert.equal(fs.readFileSync(file,'utf8'),before);
 assert.equal(s.redeem('a','u','red'),true); assert.equal(s.revoke('a'),true);
 const revoked=fs.readFileSync(file,'utf8'); assert.equal(s.revoke('a'),false); assert.equal(s.redeem('a','v','red'),false);
 assert.equal(fs.readFileSync(file,'utf8'),revoked); assert.deepEqual(s.read().members,{red:['u']});
}));
