import {test} from 'node:test';import assert from 'node:assert/strict';
import {tabulate} from '../src/tabulate.mjs';import {renderReport} from '../src/report.mjs';import {runElection} from '../src/election.mjs';
test('weighted transfers can defeat initial plurality',()=>{
 const candidates=Object.freeze(['C','A','B']),ballots=Object.freeze([{ranking:['A'],weight:4},{ranking:['B'],weight:3},{ranking:['C','B'],weight:2}].map(b=>Object.freeze({...b,ranking:Object.freeze(b.ranking)})));const result=runElection(candidates,ballots);
 assert.equal(result.winner,'B');assert.deepEqual(result.rounds,[{totals:[{candidate:'A',votes:4},{candidate:'B',votes:3},{candidate:'C',votes:2}],activeWeight:9,exhaustedWeight:0,eliminated:'C'},{totals:[{candidate:'A',votes:4},{candidate:'B',votes:5}],activeWeight:9,exhaustedWeight:0,eliminated:null}]);assert.equal(result.report,'1\tA:4,B:3,C:2\t9\t0\tC\n2\tA:4,B:5\t9\t0\t-\nwinner\tB');assert.deepEqual(candidates,['C','A','B']);
});
test('exhausted weight adjusts majority and ties eliminate largest name',()=>{
 const result=tabulate(['A','B','C'],[{ranking:['A'],weight:2},{ranking:['B'],weight:2},{ranking:['C'],weight:1},{ranking:[],weight:4}]);assert.equal(result.winner,'A');assert.deepEqual(result.rounds.map(r=>[r.activeWeight,r.exhaustedWeight,r.eliminated]),[[5,4,'C'],[4,5,'B'],[2,7,null]]);
 const empty=tabulate(['A','B'],[{ranking:[],weight:3},{ranking:['A'],weight:0}]);assert.equal(empty.winner,null);assert.equal(empty.rounds.length,1);assert.equal(empty.rounds[0].eliminated,null);assert.deepEqual(tabulate([],[]),{winner:null,rounds:[]});assert.equal(renderReport({winner:null,rounds:[]}),'winner\t-');
});
test('input errors before rounds',()=>{
 for(const candidates of [['A','A'],['bad-id']])assert.throws(()=>tabulate(candidates,[]),TypeError);for(const ballot of [{ranking:['A','A'],weight:1},{ranking:['B'],weight:1},{ranking:['A'],weight:-1}])assert.throws(()=>tabulate(['A'],[ballot]),TypeError);
});
