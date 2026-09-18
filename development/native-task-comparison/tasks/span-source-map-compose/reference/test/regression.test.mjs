import {test} from 'node:test';import assert from 'node:assert/strict';
import {composeMaps,lookupPosition} from '../src/maps.mjs';import {createDiagnosticMapper} from '../src/diagnostics.mjs';
const a=(line,column,source,ol,oc)=>({generated:{line,column},original:source===null?null:{source,line:ol,column:oc}});
test('composition splits mapped and unmapped spans at inner boundaries',()=>{
 const outer=[a(1,0,'stage',1,2),a(1,10,'stage',2,5),a(1,20,null),a(1,30,'external',3,1)],inner={stage:[a(1,0,'a.js',10,100),a(1,4,'b.js',20,8),a(1,6,null),a(2,0,null),a(2,8,'c.js',30,0)]};
 const before=structuredClone({outer,inner});assert.deepEqual(composeMaps(outer,inner),[a(1,0,'a.js',10,102),a(1,2,'b.js',20,8),a(1,4,null),a(1,10,null),a(1,13,'c.js',30,0),a(1,20,null),a(1,30,'external',3,1)]);
 const map=createDiagnosticMapper(outer,inner);assert.deepEqual(map({message:'bad',line:1,column:3}),{message:'bad',source:'b.js',line:20,column:9,mapped:true});assert.deepEqual(map({message:'none',line:1,column:11}),{message:'none',source:'<generated>',line:1,column:11,mapped:false});assert.equal(map({message:'next',line:1,column:14}).column,1);assert.equal(map({message:'line',line:2,column:1}).mapped,false);assert.deepEqual({outer,inner},before);
 inner.stage[1].original.column=99;assert.equal(map({message:'snapshot',line:1,column:3}).column,9);
});
test('outer end wins, empty inner, one hop and no previous-line carry',()=>{
 const outer=[a(1,5,'mid',1,0),a(1,7,'external',1,1)],inner={mid:[a(1,0,'mid',9,2),a(1,2,'hidden',2,0),a(1,4,'late',3,0)]};assert.deepEqual(composeMaps(outer,inner),[a(1,5,'mid',9,2),a(1,7,'external',1,1)]);
 assert.deepEqual(composeMaps([a(1,0,'mid',1,0)],{mid:[]}),[a(1,0,null)]);assert.equal(lookupPosition([a(1,5,'x',2,1)],{line:1,column:4}),null);assert.equal(lookupPosition([a(1,5,'x',2,1)],{line:2,column:6}),null);
 const frozen=Object.freeze([Object.freeze(a(1,0,'x',1,0))]);assert.deepEqual(composeMaps(frozen,{}),frozen);
});
test('map ordering and unused inner validation',()=>{
 for(const bad of [[a(1,2,null),a(1,1,null)],[a(1,1,null),a(1,1,null)],[a(0,0,null)]])assert.throws(()=>composeMaps(bad,{}),TypeError);
 assert.throws(()=>composeMaps([],{unused:[a(1,-1,null)]}),TypeError);assert.deepEqual(composeMaps([],{}),[]);
});
