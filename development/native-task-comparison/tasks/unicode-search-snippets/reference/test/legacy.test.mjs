import {test} from 'node:test';import assert from 'node:assert/strict';
import {snippets} from '../src/snippets.mjs';test('ASCII snippets',()=>assert.deepEqual(snippets('cat cat','cat',1),[{start:0,end:3,excerpt:'cat '},{start:4,end:7,excerpt:' cat'}]));
