import {test} from 'node:test';import assert from 'node:assert/strict';
import {runElection} from '../src/election.mjs';test('clear majority',()=>{const r=runElection(['A','B'],[{ranking:['A'],weight:3},{ranking:['B'],weight:1}]);assert.equal(r.winner,'A');assert.equal(r.report,'1	A:3,B:1	4\t0\t-\nwinner	A');});
