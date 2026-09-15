import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {stringify,parse}=await import(path.join(process.env.PILOT_SOURCE,'src/wire.mjs'));
test('ordinary JSON bytes and lookalike objects remain ordinary',()=>{
 const inputs=[{a:1,b:[true,null,'x']},{'$bigint':'123'},'bigint-json:1:{"data":"9","paths":[[]]}',{toJSON:'data',kind:'bigint',value:'12'},-0];
 for(const input of inputs){assert.equal(stringify(input),JSON.stringify(input));assert.deepEqual(parse(stringify(input)),JSON.parse(JSON.stringify(input)));}
});
test('BigInt exact wire root nested and unmarked strings',()=>{
 assert.equal(stringify(123n),'bigint-json:1:{"data":"123","paths":[[]]}');assert.equal(parse(stringify(123n)),123n);
 const input={id:900719925474099312345n,items:[-2n,'3',{'$bigint':'4'}]};
 const wire=stringify(input);assert.ok(wire.startsWith('bigint-json:1:'));
 assert.deepEqual(JSON.parse(wire.slice('bigint-json:1:'.length)),{data:{id:'900719925474099312345',items:['-2','3',{'$bigint':'4'}]},paths:[['id'],['items',0]]});
 assert.deepEqual(parse(wire),input);assert.equal(input.items[0],-2n);
});
test('special keys and shared acyclic values get distinct path occurrences',()=>{
 const shared={n:7n},input=Object.create(null);input.__proto__=8n;input['']=9n;input.a=shared;input.b=shared;input.toJSON='ordinary';
 const result=parse(stringify(input));assert.equal(Object.hasOwn(result,'__proto__'),true);assert.equal(result.__proto__,8n);assert.equal(result[''],9n);
 assert.deepEqual(result.a,{n:7n});assert.deepEqual(result.b,{n:7n});assert.equal(result.toJSON,'ordinary');assert.equal(input.a,shared);
 assert.equal(parse(stringify(BigInt('9'.repeat(100)))),BigInt('9'.repeat(100)));
});
test('invalid version envelope paths and decimal text reject',()=>{
 const prefix='bigint-json:1:',wire=x=>prefix+JSON.stringify(x);
 for(const text of ['bigint-json:2:{}',prefix+'{bad',wire({data:'1',paths:[]}),wire({data:'1',paths:[[],[]]}),wire({data:'1',paths:[['missing']]}),wire({data:{},paths:[['constructor']]}),wire({data:['1'],paths:[['0']]}),wire({data:{x:'1'},paths:[[0]]}),wire({data:'1',paths:[[]],extra:true})])assert.throws(()=>parse(text),TypeError);
 for(const value of ['01','+1','-0','1.0','1e2',' 1','1\n','9'.repeat(101),1,null])assert.throws(()=>parse(wire({data:value,paths:[[]]})),TypeError);
 assert.throws(()=>parse('{bad'),SyntaxError);
});
