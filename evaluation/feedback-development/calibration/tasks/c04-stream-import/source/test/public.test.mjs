import assert from 'node:assert/strict';import {test} from 'node:test';
import * as api from '../src/index.mjs';
test('legacy text',()=>{assert.deepEqual(api.parseText(' {"id":"a","count":2,"extra":1}\r\n\n'),[{id:'a',count:2}]);assert.throws(()=>api.parseText('{"id":"a","count":-1}'),RangeError);});
test('stream handles byte boundaries',async()=>{
 const bytes=Buffer.from('{"id":"café","count":3}\r\n{"id":"b","count":4}');async function* input(){for(const byte of bytes)yield Buffer.from([byte]);}
 assert.deepEqual(await api.importRecords(input(),{format:'stream'}),{records:[{id:'café',count:3},{id:'b',count:4}],total:7});
});
