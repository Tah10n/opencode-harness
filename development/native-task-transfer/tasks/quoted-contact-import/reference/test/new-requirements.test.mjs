import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const {parseRows}=await import(path.join(root,'src/csv.mjs'));const {importContacts}=await import(path.join(root,'src/contacts.mjs'));
test('quoted and exact values',()=>{assert.deepEqual(parseRows('"a,b","c""d","line\r\nnext"\r\nx,,\r\n'),[['a,b','c"d','line\r\nnext'],['x','','']]);assert.deepEqual(parseRows(' é ,x\n\n'),[[' é ','x'],['']]);assert.deepEqual(parseRows(''),[]);assert.deepEqual(parseRows('""'),[['']]);});
test('header mapping and ignored extra',()=>{assert.deepEqual(importContacts('email,note,name\r\na@x,unused,"A, é"\r\nb@x,z,B'),[{name:'A, é',email:'a@x'},{name:'B',email:'b@x'}]);assert.deepEqual(importContacts('name,email\n'),[]);assert.deepEqual(importContacts(''),[]);});
test('grammar and shape rejection',()=>{for(const s of ['"bad','a"b,c','"a"x,c','a\rb'])assert.throws(()=>parseRows(s),SyntaxError);for(const s of ['name,name,email\na,b,c','name\na','name,email\na','name,email\na,b,c'])assert.throws(()=>importContacts(s),TypeError);});
