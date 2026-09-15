import {test} from 'node:test';import assert from 'node:assert/strict';
import {dueReminders} from '../src/reminders.mjs';test('default time selection',()=>{const original=Date.now;Date.now=()=>10;try{const a={id:'a',dueAt:10,enabled:true},b={id:'b',dueAt:11,enabled:true};assert.deepEqual(dueReminders([a,b]),[a]);}finally{Date.now=original;}});
