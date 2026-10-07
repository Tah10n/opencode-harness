import assert from 'node:assert/strict';import {test} from 'node:test';
import {Cache,Client,memorySource} from '../src/index.mjs';
test('legacy values and missing errors',async()=>{const c=new Cache(memorySource({a:{n:1}}));const v=await c.get('a');v.n=8;assert.deepEqual(c.peek('a'),{n:1});await assert.rejects(c.get('missing'),/missing asset/);});
test('overlap coalesces and invalidation advances generation',async()=>{
 const loads=[];const c=new Cache(()=>new Promise(resolve=>loads.push(resolve)));const a=c.get('x'),b=c.get('x');await Promise.resolve();assert.equal(loads.length,1);loads[0]({n:1});assert.deepEqual(await a,{n:1});assert.deepEqual(await b,{n:1});
 c.invalidate('x');const next=c.get('x');await Promise.resolve();loads[1]({n:2});assert.deepEqual(await next,{n:2});assert.deepEqual(await new Client(c).loadMany(['x','x']),[{n:2},{n:2}]);
});
