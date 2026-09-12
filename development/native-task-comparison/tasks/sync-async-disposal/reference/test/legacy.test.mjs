import {test} from 'node:test';import assert from 'node:assert/strict';
import {withResources} from '../src/resources.mjs';test('legacy LIFO',async()=>{const order=[];const value=await withResources([{dispose(){order.push('a');}},{dispose(){order.push('b');}}],()=>5);assert.equal(value,5);assert.deepEqual(order,['b','a']);});
