import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveLink} from '../src/resolve.mjs';import {buildMenu} from '../src/menu.mjs';test('string links',()=>{assert.equal(resolveLink('https://example.test/a/','b'),'https://example.test/a/b');assert.deepEqual(buildMenu('https://example.test/',[{label:'x',href:'/x'}]),[{label:'x',href:'https://example.test/x'}]);});
