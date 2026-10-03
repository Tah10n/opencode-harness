import assert from 'node:assert/strict'; import {test} from 'node:test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {Invites} from '../src/invites.mjs';
test('invalid redemption leaves token available',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'invite-public-'));
 try {const file=path.join(dir,'state.json'), s=new Invites(file);s.create('t','red');
  assert.equal(s.redeem('t','alice','blue'),false); assert.equal(new Invites(file).read().tokens.t.used,false);
  assert.equal(s.redeem('t','alice','red'),true);
 }finally {fs.rmSync(dir,{recursive:true});}
});
test('valid token remains single-use and revoke preserves membership',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'invite-public-'));
 try {const s=new Invites(path.join(dir,'state.json'));s.create('t','red');
  assert.equal(s.redeem('t','alice','red'),true); assert.equal(s.redeem('t','bob','red'),false);
  assert.equal(s.revoke('t'),true); assert.deepEqual(s.read().members.red,['alice']);
 }finally {fs.rmSync(dir,{recursive:true});}
});
