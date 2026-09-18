import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseDate} from '../src/date.mjs';test('calendar input',()=>{assert.equal(parseDate('2024-02-29'),'2024-02-29');assert.throws(()=>parseDate('2023-02-29'),TypeError);assert.throws(()=>parseDate('2024-2-01'),TypeError);});
