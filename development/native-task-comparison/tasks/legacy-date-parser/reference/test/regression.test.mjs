import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseDate} from '../src/date.mjs';
test('ISO year boundaries from independent calendar vectors',()=>{for(const [input,expected]of [["2020-W53-7", "2021-01-03"], ["2021-W01-1", "2021-01-04"], ["2015-W01-1", "2014-12-29"], ["2009-W53-4", "2009-12-31"], ["2000-W01-1", "2000-01-03"], ["2099-W53-7", "2100-01-03"], ["2024-W01-1", "2024-01-01"], ["2016-W01-7", "2016-01-10"], ["2023-W52-7", "2023-12-31"]])assert.equal(parseDate(input),expected);});
test('calendar dates preserved with leap validation',()=>{
 for(const text of ['2000-02-29','2024-02-29','2023-12-31','2099-01-01'])assert.equal(parseDate(text),text);
 for(const text of ['2023-02-29','2001-02-29','2024-04-31','2024-00-01','2024-13-01','2024-01-00','1999-12-31','2100-01-01'])assert.throws(()=>parseDate(text),TypeError);
});
test('week validity and strict syntax',()=>{
 for(const text of ['2014-W53-1','2021-W53-1','2020-W00-1','2020-W54-1','2020-W01-0','2020-W01-8','2020-W1-1','2020-w01-1','2020-W01-01','1999-W52-1','2100-W01-1',' 2020-W01-1','2020-W01-1\n','2020-1-01','2020-01-01T00:00:00Z'])assert.throws(()=>parseDate(text),TypeError);
 for(const value of [null,undefined,2020,{}])assert.throws(()=>parseDate(value),TypeError);
});
test('consecutive week weekdays are seven consecutive UTC dates',()=>{
 const expected=['2020-12-28','2020-12-29','2020-12-30','2020-12-31','2021-01-01','2021-01-02','2021-01-03'];
 assert.deepEqual(expected.map((_,i)=>parseDate('2020-W53-'+(i+1))),expected);
});
