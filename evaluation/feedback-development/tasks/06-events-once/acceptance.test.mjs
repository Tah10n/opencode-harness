import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=process.env.FEEDBACK_PROJECT_ROOT;
const load=name=>import(pathToFileURL(path.join(project,name)).href);
const {Events}=await load('src/events.mjs');
test('fd06.once-reentrant-and-throw',()=>{
 const bus=new Events();let count=0;
 const off=bus.on('x',()=>{count++;if(count<4)bus.emit('x');},{once:true});
 assert.equal(bus.emit('x'),undefined);assert.equal(bus.emit('x'),undefined);assert.equal(count,1);assert.equal(off(),false);
 const err=new Error('expected');let throws=0;bus.on('bad',()=>{throws++;throw err;},{once:true});
 assert.throws(()=>bus.emit('bad'),e=>e===err);assert.equal(bus.emit('bad'),undefined);assert.equal(throws,1);
});
test('fd06.registration-identity',()=>{
 const bus=new Events(),seen=[],fn=x=>seen.push(x);const a=bus.on('x',fn,{once:true}), b=bus.on('x',fn);
 assert.equal(a(),true);assert.equal(a(),false);bus.emit('x',1);bus.emit('x',2);assert.deepEqual(seen,[1,2]);assert.equal(b(),true);
});
test('fd06.ordinary-snapshot-order',()=>{
 const bus=new Events(),seen=[];let added=false,offSecond;
 bus.on('x',(a,b)=>{seen.push(['first',a,b]);offSecond();if(!added){added=true;bus.on('x',()=>seen.push(['late']));}});
 offSecond=bus.on('x',()=>seen.push(['removed']));bus.on('other',()=>seen.push(['other']));
 assert.equal(bus.emit('x',1,2),undefined);assert.deepEqual(seen,[['first',1,2]]);
 assert.equal(bus.emit('x',3,4),undefined);assert.deepEqual(seen,[['first',1,2],['first',3,4],['late']]);
 assert.equal(bus.emit('other'),undefined);assert.deepEqual(seen.at(-1),['other']);
 assert.equal(bus.emit('unregistered'),undefined);
 const error=new Error('ordinary callback');bus.on('bad',()=>{throw error;});
 assert.throws(()=>bus.emit('bad'),e=>e===error);
});
