import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const load=n=>import(pathToFileURL(path.join(process.env.FEEDBACK_PROJECT_ROOT,n)).href);

const {Catalog,MemoryStorage,command}=await load('src/index.mjs');
const p=(id,n=10)=>({id,name:'Product '+id,priceCents:n,tags:['x']});
test('fd09.atomic-persistence',()=>{
 const s=new MemoryStorage(),c=new Catalog(s);c.upsert(p('alpha'));const before=s.read();let writes=0;
 const save=s.write.bind(s);s.write=v=>{writes++;save(v);};
 assert.throws(()=>c.applyBatch({expectedRevision:1,operations:[{type:'upsert',product:p('beta')},{type:'delete',id:'absent'}]}));assert.deepEqual(s.read(),before);assert.equal(writes,0);
 const ops=[{type:'upsert',product:p('beta')},{type:'delete',id:'alpha'},{type:'upsert',product:p('alpha',30)}],copy=structuredClone(ops);
 const r=command(c,{action:'batch',expectedRevision:1,operations:ops});assert.deepEqual(r,{revision:2,products:[p('beta'),p('alpha',30)]});assert.deepEqual(ops,copy);assert.equal(writes,1);
 r.products[0].tags.push('bad');assert.deepEqual(new Catalog(s).list(),[p('beta'),p('alpha',30)]);
 assert.deepEqual(c.applyBatch({expectedRevision:2,operations:[]}),{revision:2,products:[p('beta'),p('alpha',30)]});assert.equal(writes,1);
});
test('fd09.validation-and-filtering',()=>{
 const s=new MemoryStorage(),c=new Catalog(s);c.upsert(p('one',15));c.upsert(p('two',25));c.upsert({...p('three',35),tags:['y']});
 assert.equal(command(c,{action:'list',tag:'x',minPrice:20,maxPrice:30,format:'text'}),'two\tProduct two\t25');
 assert.deepEqual(JSON.parse(command(c,{action:'list',minPrice:15,maxPrice:25})),[p('one',15),p('two',25)]);
 for(const bounds of [{minPrice:'1'},{minPrice:-1},{minPrice:Infinity},{maxPrice:NaN},{maxPrice:'9'},{minPrice:4,maxPrice:3}])assert.throws(()=>command(c,{action:'list',...bounds}),RangeError);
 const before=s.read();for(const req of [{expectedRevision:0,operations:[]},{expectedRevision:-1,operations:[]},{expectedRevision:3,operations:null},{expectedRevision:3,operations:[{type:'wat'}]},{expectedRevision:3,operations:[{type:'upsert',product:p('bad',-1)}]}])assert.throws(()=>c.applyBatch(req));assert.deepEqual(s.read(),before);
});
test('fd09.legacy-shape-and-errors',()=>{
 const c=new Catalog(new MemoryStorage());const x={...p('old'),tags:['x','x'],extra:1};const before=structuredClone(x);assert.deepEqual(c.upsert(x),p('old'));assert.deepEqual(x,before);
 c.upsert(p('next'));c.upsert(p('old',9));assert.deepEqual(c.list().map(v=>v.id),['old','next']);const result=c.list();result[0].name='changed';assert.equal(c.list()[0].name,'Product old');
 for(const bad of [{...p('x'),id:''},{...p('x'),name:''},{...p('x'),priceCents:1.5}])assert.throws(()=>c.upsert(bad));assert.throws(()=>command(c,{action:'wat'}),RangeError);assert.throws(()=>command(c,{action:'list',format:'wat'}),RangeError);
});
