import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const root=process.env.PILOT_SOURCE;const {visitExpression}=await import(path.join(root,'src/visitor.mjs'));const {printExpression}=await import(path.join(root,'src/printer.mjs'));
const lit=value=>({type:'literal',value}),bin=(op,left,right)=>({type:'binary',op,left,right});
test('minimal parentheses preserve exact binary tree',()=>{
 const a=lit(1),b=lit(2),c=lit(3);
 for(const [tree,text]of [[bin('+',a,bin('*',b,c)),'1 + 2 * 3'],[bin('*',bin('+',a,b),c),'(1 + 2) * 3'],[bin('-',a,bin('-',b,c)),'1 - (2 - 3)'],[bin('-',bin('-',a,b),c),'1 - 2 - 3'],[bin('/',a,bin('*',b,c)),'1 / (2 * 3)'],[bin('+',a,bin('+',b,c)),'1 + (2 + 3)'],[bin('*',bin('/',a,b),c),'1 / 2 * 3']])assert.equal(printExpression(tree),text);
 assert.equal(printExpression(lit('a"b\n\\c')),'"a\\"b\\n\\\\c"');assert.equal(printExpression(lit('雪')),'"雪"');
});
test('visitor postorder, receiver, identity and throw stops traversal',()=>{
 const logs=[],shared=Object.freeze(lit(4)),root=Object.freeze(bin('+',shared,shared));const visitor={literal(value){assert.equal(this,visitor);logs.push('literal:'+value);return{value};},binary(op,left,right){assert.equal(this,visitor);logs.push(op);assert.notEqual(left,right);return{op,left,right};}};
 assert.deepEqual(visitExpression(root,visitor),{op:'+',left:{value:4},right:{value:4}});assert.deepEqual(logs,['literal:4','literal:4','+']);
 const failure={reason:'visit'},seen=[];assert.throws(()=>visitExpression(bin('+',lit(1),lit(2)),{literal(n){seen.push(n);throw failure;},binary(){seen.push('binary');}}),e=>e===failure);assert.deepEqual(seen,[1]);assert.equal(root.left,shared);
});
