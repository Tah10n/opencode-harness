import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
const base=process.env.PILOT_SOURCE;
const load=n=>import(path.join(base,n));
const {ledger}=await load('src/ledger.mjs'),{accept}=await load('src/route.mjs');
test('single use through consumer',()=>{const b=ledger([{token:'t',team:'r',email:'e',expiresAt:20},{token:'u',team:'q',email:'f',expiresAt:30}]);assert.deepEqual(accept(b,{token:'t'},()=>19),{status:'joined',team:'r'});assert.equal(b.peek('t'),undefined);assert.deepEqual(accept(b,{token:'t'},()=>19),{status:'missing'});assert.deepEqual(b.members(),[{team:'r',email:'e'}]);assert.deepEqual(b.list(),[{token:'u',team:'q',email:'f',expiresAt:30}]);});
test('expiration equality and past retain record',()=>{for(const now of [20,21]){const b=ledger([{token:'t',team:'r',email:'e',expiresAt:20}]);assert.deepEqual(accept(b,{token:'t'},()=>now),{status:'expired'});assert.equal(b.peek('t').token,'t');assert.deepEqual(b.members(),[]);}});
test('missing and clock invoked exactly once',()=>{const b=ledger([]);let calls=0;assert.deepEqual(accept(b,{token:'t'},()=>{calls++;return 1;}),{status:'missing'});assert.equal(calls,1);assert.deepEqual(b.list(),[]);assert.deepEqual(b.members(),[]);});

test('one time observation for valid and expired invitation',()=>{for(const now of [19,20,21]){const b=ledger([{token:'t',team:'r',email:'e',expiresAt:20}]);let calls=0;const result=accept(b,{token:'t'},()=>{calls++;return calls===1?now:100;});assert.equal(calls,1);assert.deepEqual(result,now<20?{status:'joined',team:'r'}:{status:'expired'});}});
