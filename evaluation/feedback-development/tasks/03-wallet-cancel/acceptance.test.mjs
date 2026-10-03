import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=process.env.FEEDBACK_PROJECT_ROOT;
const load=name=>import(pathToFileURL(path.join(project,name)).href);
const {Wallet}=await load('src/wallet.mjs');
function withWallet(fn) {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wallet-accept-'));try {const file=path.join(dir,'state.json');fn(file,new Wallet(file,200));}finally{fs.rmSync(dir,{recursive:true});}}
test('fd03.cancel-reopen-repeat',()=>withWallet((file,w)=>{
 assert.deepEqual(w.read(),{available:200,holds:{},settled:[]});
 assert.equal(w.reserve('first',60),true); assert.equal(w.read().holds.first,60);
 assert.equal(w.read().available,140);
 assert.equal(w.cancel('first'),true);
 const reopened=new Wallet(file); assert.deepEqual(reopened.read(),{available:200,holds:{},settled:[]});
 const bytes=fs.readFileSync(file,'utf8'); assert.equal(reopened.cancel('first'),false); assert.equal(fs.readFileSync(file,'utf8'),bytes);
 assert.equal(reopened.reserve('first',40),true); assert.equal(reopened.commit('first'),true);
 assert.equal(new Wallet(file).read().available,160); assert.equal(reopened.cancel('first'),false);
}));
test('fd03.other-holds-preserved',()=>withWallet((file,w)=>{
 assert.equal(w.reserve('a',50),true); assert.equal(w.reserve('b',70),true);
 assert.deepEqual(w.read().holds,{a:50,b:70}); assert.equal(w.read().available,80);
 assert.equal(w.read().available+50+70,200);
 assert.equal(w.cancel('a'),true); const after=new Wallet(file).read();
 assert.deepEqual(after.holds,{b:70}); assert.deepEqual(after.settled,[]);
 assert.equal(w.commit('b'),true); assert.deepEqual(w.read(),{available:after.available,holds:{},settled:['b']});
}));
test('fd03.deposit-and-rejection',()=>withWallet((file,w)=>{
 w.deposit(30); assert.equal(w.read().available,230); w.reserve('x',20);
 const bytes=fs.readFileSync(file,'utf8');
 for(const call of [()=>w.deposit(-1),()=>w.reserve('z',1.5)]) assert.throws(call);
 assert.equal(w.reserve('x',1),false); assert.equal(w.reserve('too-big',300),false); assert.equal(w.commit('missing'),false); assert.equal(w.cancel('missing'),false);
 assert.equal(fs.readFileSync(file,'utf8'),bytes);
}));
