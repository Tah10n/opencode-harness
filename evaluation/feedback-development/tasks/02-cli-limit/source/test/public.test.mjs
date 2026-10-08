import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runCLI} from '../src/cli.mjs';
const rows=[{id:'a',name:'Alpha',tags:['red']},{id:'b',name:'Beta',tags:['blue']},{id:'c',name:'Gamma',tags:['red']}];
test('limit text and JSON',()=>{
 assert.equal(runCLI(rows,['--limit','1']),'a: Alpha');
 assert.deepEqual(JSON.parse(runCLI(rows,['--json','--limit','0'])),[]);
});
test('existing filtering and errors',()=>{
 assert.equal(runCLI(rows,['--tag','blue']),'b: Beta');
 assert.deepEqual(JSON.parse(runCLI(rows,['--json'])),rows);
 assert.throws(()=>runCLI(rows,['--unknown']));
});
