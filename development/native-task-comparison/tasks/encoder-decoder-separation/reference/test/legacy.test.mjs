import {test} from 'node:test';import assert from 'node:assert/strict';
import {renderQuery,parseQuery} from '../src/query.mjs';test('query strings',()=>{assert.equal(renderQuery([['q','hello world'],['page','2']]),'q=hello%20world&page=2');assert.deepEqual(parseQuery('q=hello%20world&page=2'),[['q','hello world'],['page','2']]);});
