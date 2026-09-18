import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const root=process.env.PILOT_SOURCE;const {geographicBounds,projectPoint}=await import(path.join(root,'src/geo.mjs'));const {createViewport}=await import(path.join(root,'src/viewport.mjs'));
test('minimal arc across dateline and projected marker order',()=>{
 const points=Object.freeze([Object.freeze({id:'west',lon:170,lat:10}),Object.freeze({id:'east',lon:-170,lat:-10})]);const result=createViewport(points,{width:200,height:100});assert.deepEqual(result.bounds,{west:170,east:-170,width:20,south:-10,north:10,crossesAntimeridian:true});assert.deepEqual(result.markers,[{id:'west',x:0,y:0},{id:'east',x:200,y:100}]);assert.equal(points[0].lon,170);
});
test('ties, canonical 180 and collapsed axes',()=>{
 for(const [longitudes,west,width,east]of [[[0,180],-180,180,0],[[0,120,-120],-120,240,120],[[-179,179,180],179,2,-179],[[180,-180],-180,0,-180]]){const points=longitudes.map(lon=>({lon,lat:4})),b=geographicBounds(points);assert.equal(b.west,west);assert.equal(b.width,width);assert.equal(b.east,east);assert.deepEqual(geographicBounds([...points].reverse()),b);}
 const single=createViewport([{id:'one',lon:180,lat:0}],{width:100,height:60});assert.deepEqual(single.markers,[{id:'one',x:50,y:30}]);const b=geographicBounds([{lon:179,lat:0},{lon:-179,lat:0}]);assert.deepEqual(projectPoint({lon:180,lat:0},b,{width:100,height:60}),{x:50,y:30});
});
test('empty and input validation',()=>{
 assert.deepEqual(createViewport([],{width:1,height:1}),{bounds:null,markers:[]});for(const bad of [{lon:181,lat:0},{lon:0,lat:91},{lon:1.5,lat:0}])assert.throws(()=>createViewport([bad],{width:100,height:100}),RangeError);assert.throws(()=>createViewport([],{width:0,height:1}),RangeError);
});
