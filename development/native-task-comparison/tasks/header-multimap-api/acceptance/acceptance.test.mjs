import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {headers}=await import(path.join(process.env.PILOT_SOURCE,'src/headers.mjs'));
test('iterable duplicates preserve arrival order and first value',()=>{
 const input=[['X-A',' one\t'],['Set-Cookie','a=1'],['x-a','two'],['SET-cookie','b=2']];
 const bag=headers(input);assert.equal(bag.get('X-a'),'one');assert.deepEqual(bag.getAll('x-A'),['one','two']);
 assert.deepEqual(bag.getAll('set-cookie'),['a=1','b=2']);assert.equal(bag.get('missing'),undefined);
 assert.deepEqual([...bag],[['x-a','one'],['set-cookie','a=1'],['x-a','two'],['set-cookie','b=2']]);
});
test('legacy object repeated arrays and source ownership',()=>{
 const input={'Content-Type':' text/plain ',Accept:['a','b'],'X-Empty':[]};const bag=headers(input);
 input.Accept.push('c');input['Content-Type']='changed';
 assert.equal(bag.get('content-type'),'text/plain');assert.deepEqual(bag.getAll('ACCEPT'),['a','b']);assert.deepEqual(bag.getAll('x-empty'),[]);
 const values=bag.getAll('accept');values[0]='bad';const entry=bag.entries().next().value;entry[1]='bad';
 assert.equal(bag.get('accept'),'a');assert.equal(bag.get('content-type'),'text/plain');
});
test('generator input, empty values and token names',()=>{
 function* pairs(){yield ['__proto__','\t '];yield ['X!#$%&\'*+-.^_\x60|~9','v'];}
 const bag=headers(pairs());assert.equal(bag.get('__proto__'),'');assert.deepEqual(bag.getAll('__proto__'),['']);
 assert.equal(bag.get('x!#$%&\'*+-.^_\x60|~9'),'v');assert.deepEqual([...headers()],[]);
 const input=Object.create({'Inherited':'no'});input.Own='yes';assert.deepEqual([...headers(input)],[['own','yes']]);
});
test('strict invalid names values and tuple shape',()=>{
 for(const name of ['', ' bad','bad name','x:','é','x\n']){assert.throws(()=>headers([[name,'ok']]),TypeError);assert.throws(()=>headers().get(name),TypeError);}
 for(const value of [1,null,undefined,'a\nb','a\rb','a\0b'])assert.throws(()=>headers([['x',value]]),TypeError);
 for(const pair of [['x'],['x','a','b'],'xa'])assert.throws(()=>headers([pair]),TypeError);
 assert.throws(()=>headers({'bad name':[]}),TypeError);
});

test('non-ASCII outer whitespace and interior whitespace preserved',()=>{
 const value='\u00a0a \t b\u00a0';assert.equal(headers([['x',' \t'+value+'\t ']]).get('x'),value);
});
