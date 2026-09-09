import {test} from 'node:test';import assert from 'node:assert/strict';
import {scanAssignments} from '../src/assignment-scanner.mjs';import {parseConfig} from '../src/config.mjs';
test('scanner preserves original line and columns',()=>{
 const text='# header\r\n\tport = 8080 # c\r\n\n root=/srv/app\n';
 assert.deepEqual(scanAssignments(text),[{key:'port',value:'8080',line:2,keyColumn:2,valueColumn:9},{key:'root',value:'/srv/app',line:4,keyColumn:2,valueColumn:7}]);
 assert.deepEqual(parseConfig(text),{port:'8080',root:'/srv/app'});assert.deepEqual(scanAssignments(' #empty\n\t'),[]);
 const entries=scanAssignments('a=1\na=2');assert.equal(entries.length,2);assert.deepEqual(entries.map(x=>x.value),['1','2']);
});
test('exact invalid and duplicate locations; eager scan',()=>{
 for(const [text,msg]of [[' a','Invalid assignment at 1:3'],['a=','Invalid assignment at 1:3'],['2a=x','Invalid assignment at 1:1'],['a=x y','Invalid assignment at 1:5'],['a=x\rb=y','Invalid assignment at 1:4'],['a=1\n a=2','Duplicate key at 2:2'],['a=1\na=2\nz=','Invalid assignment at 3:3'],['a="x"','Invalid assignment at 1:3']])assert.throws(()=>parseConfig(text),e=>e instanceof SyntaxError&&e.message===msg);
 for(const x of [null,2,{}])assert.throws(()=>scanAssignments(x),TypeError);
});
test('own special keys and fresh results',()=>{
 const got=parseConfig('__proto__=safe\nconstructor=name');assert.equal(Object.getPrototypeOf(got),Object.prototype);assert.equal(Object.hasOwn(got,'__proto__'),true);assert.equal(got.__proto__,'safe');assert.equal(got.constructor,'name');
 const x=scanAssignments('a=1');x[0].value='changed';assert.equal(scanAssignments('a=1')[0].value,'1');
});
