import {test} from 'node:test';import assert from 'node:assert/strict';
import {toc} from '../src/toc.mjs';test('single heading',()=>assert.deepEqual(toc('# Hello'),[{level:1,title:'Hello',id:'hello',children:[]}]));
