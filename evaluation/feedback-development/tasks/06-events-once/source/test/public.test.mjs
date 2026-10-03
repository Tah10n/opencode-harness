import assert from 'node:assert/strict';import {test} from 'node:test';
import {Events} from '../src/events.mjs';
test('once is removed before recursive emit',()=>{
 const bus=new Events();let count=0;bus.on('tick',()=>{count++;if(count<3)bus.emit('tick');},{once:true});
 bus.emit('tick');bus.emit('tick');assert.equal(count,1);
});
test('ordinary subscription persists and unsubscribes',()=>{
 const bus=new Events(),seen=[];const off=bus.on('tick',x=>seen.push(x));
 bus.emit('tick',1);bus.emit('tick',2);assert.deepEqual(seen,[1,2]);assert.equal(off(),true);assert.equal(off(),false);
});
