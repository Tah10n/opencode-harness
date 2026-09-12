import {test} from 'node:test';import assert from 'node:assert/strict';
import {mergeDraft} from '../src/merge.mjs';test('identical drafts',()=>assert.deepEqual(mergeDraft({a:1},{a:1},{a:1}),{merged:{a:1},conflicts:[]}));
