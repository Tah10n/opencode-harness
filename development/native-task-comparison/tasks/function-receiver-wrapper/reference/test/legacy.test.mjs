import {test} from 'node:test';import assert from 'node:assert/strict';
import {timed} from '../src/timing.mjs';test('plain timing',()=>{let n=0;const events=[];const fn=timed(x=>x*2,{now:()=>n++*5,record:e=>events.push(e)});assert.equal(fn(3),6);assert.deepEqual(events,[{duration:5,outcome:'return'}]);});
