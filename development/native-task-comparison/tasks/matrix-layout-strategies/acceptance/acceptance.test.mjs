import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const root=process.env.PILOT_SOURCE;const {cellOrder}=await import(path.join(root,'src/cell-order.mjs'));const {layout,renderLayout}=await import(path.join(root,'src/layout.mjs'));
test('row/column strategy cells and independent results',()=>{
 assert.deepEqual(cellOrder(2,3),[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]]);assert.deepEqual(cellOrder(2,3,'column'),[[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]]);
 const cells=cellOrder(1,1);cells[0][0]=9;assert.deepEqual(cellOrder(1,1),[[0,0]]);
 for(const [r,c,o]of [[0,2,'row'],[2,51,'row'],[2,2,'diagonal'],[2.5,2,'row']])assert.throws(()=>cellOrder(r,c,o),TypeError);
});
test('spanning items first-fit in selected strategy',()=>{
 const items=Object.freeze([{id:'A',w:2,h:1},{id:'B',w:1,h:2},{id:'C',w:1,h:1}].map(Object.freeze));
 assert.deepEqual(layout(items,{rows:3,cols:3}),[['A','A','B'],['C',null,'B'],[null,null,null]]);
 const column=layout(items,{rows:3,cols:3,order:'column'});assert.deepEqual(column,[['A','A',null],['B','C',null],['B',null,null]]);assert.equal(renderLayout(column),'A A .\nB C .\nB . .');assert.deepEqual(items.map(i=>i.id),['A','B','C']);
 const empty=layout([],{rows:2,cols:2});empty[0][0]='X';assert.equal(empty[1][0],null);
});
test('whole spans cannot overlap and exhaustion fails',()=>{
 assert.deepEqual(layout([{id:'A',w:2,h:1},{id:'B',w:2,h:1},{id:'C',w:1,h:2}],{rows:2,cols:3}),[['A','A','C'],['B','B','C']]);
 const items=Object.freeze([Object.freeze({id:'A',w:2,h:2}),Object.freeze({id:'B',w:1,h:1})]);assert.throws(()=>layout(items,{rows:2,cols:2}),{name:'RangeError',message:'cannot place B'});assert.equal(items[0].w,2);
 assert.throws(()=>layout([],{rows:2,cols:2,order:'bad'}),TypeError);
});
