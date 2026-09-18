import {test} from 'node:test';import assert from 'node:assert/strict';
import {calendar} from '../src/calendar.mjs';test('daily dates',()=>assert.deepEqual(calendar({start:'2024-01-01',end:'2024-01-03',weekdays:[0,1,2,3,4,5,6],exclude:[],replace:{}}),[{original:'2024-01-01',date:'2024-01-01'},{original:'2024-01-02',date:'2024-01-02'}]));
