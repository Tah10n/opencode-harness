import {test} from 'node:test';import assert from 'node:assert/strict';import {handle} from '../src/handler.mjs';import {loadCatalog} from '../src/client.mjs';
test('legacy consumer returns items',async()=>{assert.deepEqual(await loadCatalog(async url=>{assert.equal(url,'/catalog');return {status:200,json:async()=>[{id:1}]};}),[{id:1}]);});
test('existing method and path errors',()=>{for(const [method,url,code]of [['POST','/catalog',405],['GET','/other',404]]){let actual;handle({method,url,headers:{}},{writeHead:s=>actual=s,end:()=>{}},[]);assert.equal(actual,code);}});
