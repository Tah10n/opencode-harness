import assert from 'node:assert/strict'; import {test} from 'node:test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {Wallet} from '../src/wallet.mjs';
test('reservation cancellation persists and is idempotent',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-public-'));
 try {const file=path.join(dir,'state.json'), w=new Wallet(file,100);
  assert.equal(w.reserve('a',40),true); assert.equal(w.read().available,60);
  assert.equal(w.cancel('a'),true); assert.equal(new Wallet(file).read().available,100);
  assert.equal(w.cancel('a'),false);
 } finally {fs.rmSync(dir,{recursive:true});}
});
test('commit still spends and validates',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-public-'));
 try {const w=new Wallet(path.join(dir,'state.json'),100);
  assert.throws(()=>w.deposit(0)); assert.equal(w.reserve('a',20),true);
  assert.equal(w.commit('a'),true); assert.equal(w.read().available,80);
  assert.equal(w.reserve('a',1),false);
 } finally {fs.rmSync(dir,{recursive:true});}
});
