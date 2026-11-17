// Mounted only after selection is committed; never overlaid onto author tests.
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {mergeRanges}=await import(pathToFileURL('/work/repo/ranges.mjs'));
for(const ranges of [[],[[1,2]],[[3,7],[1,3],[7,8]],[[1,9],[2,3]],[[0,2],[2,4],[4,6]]]) {
  const saved=structuredClone(ranges);
  for(const joinAdjacent of [false,true]) {
    const got=mergeRanges(ranges,{joinAdjacent});
    assert.deepEqual(ranges,saved);
    for(let i=1;i<got.length;i++)assert.ok(joinAdjacent?got[i-1][1]<got[i][0]:got[i-1][1]<=got[i][0]);
    assert.notEqual(got,ranges);
  }
}
assert.deepEqual(mergeRanges([[3,7],[1,3],[7,8]],{joinAdjacent:true}),[[1,8]]);
assert.deepEqual(mergeRanges([[1,2],[2,3]]),[[1,2],[2,3]]);
for(const invalid of [null,{},[[1]],[[1,1]],[[3,2]],[[0,Infinity]],[[0,1.5]]])assert.throws(()=>mergeRanges(invalid),TypeError);
console.log('INDEPENDENT_ACCEPTANCE_OK');
