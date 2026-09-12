import {test} from 'node:test';import assert from 'node:assert/strict';
import {delay} from '../src/delay.mjs';test('injected plain timer',async()=>{let callback,seen;const promise=delay(7,{setTimeout(fn,ms){callback=fn;seen=ms;}});assert.equal(seen,7);callback();assert.equal(await promise,undefined);});
