import {test} from 'node:test';import assert from 'node:assert/strict';
import {createViewport} from '../src/viewport.mjs';test('ordinary viewport',()=>{const out=createViewport([{id:'a',lon:0,lat:10},{id:'b',lon:20,lat:0}],{width:100,height:50});assert.deepEqual(out.markers,[{id:'a',x:0,y:0},{id:'b',x:100,y:50}]);assert.equal(out.bounds.width,20);});
