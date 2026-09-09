import {test} from 'node:test';import assert from 'node:assert/strict';
import {run} from '../src/cli.mjs';test('path CLI wrapper',()=>{const out=[];assert.equal(run(['a/./b'],s=>out.push(s)),0);assert.deepEqual(out,['a/b\n']);const usage=[];assert.equal(run([],s=>usage.push(s)),2);assert.deepEqual(usage,['usage: path <value>\n']);});
