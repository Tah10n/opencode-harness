import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const root=process.env.PILOT_SOURCE;const {walkTree}=await import(path.join(root,'src/walk.mjs'));const {collectTree}=await import(path.join(root,'src/tree.mjs'));
test('preorder, pruning and identity',()=>{
 const c={id:'c'},a={id:'a',children:[c]},b={id:'b'},root={id:'root',children:[a,b]};
 assert.deepEqual([...walkTree(root)].map(n=>n.id),['root','a','c','b']);const result=collectTree(root,{prune:n=>n===a});assert.deepEqual(result,[root,a,b]);assert.equal(result[0],root);assert.deepEqual([...walkTree(null)],[]);
});
test('yield before prune/children and early close does no work',()=>{
 const calls=[];const root={id:'r',get children(){calls.push('children');return[{id:'c'}];}};
 const iterator=walkTree(root,{prune:n=>{calls.push('prune:'+n.id);return false;}});assert.deepEqual(calls,[]);assert.equal(iterator.next().value,root);assert.deepEqual(calls,[]);iterator.return();assert.deepEqual(calls,[]);
 const it=walkTree(root,{prune:n=>{calls.push('prune:'+n.id);return false;}});assert.equal(it.next().value,root);assert.equal(it.next().value.id,'c');assert.deepEqual(calls,['prune:r','children']);assert.equal(it.next().done,true);assert.deepEqual(calls,['prune:r','children','prune:c']);
});
test('pruned getters untouched and errors surface only on resume',()=>{
 const failure={why:'children'},root={get children(){throw failure;}};assert.deepEqual([...walkTree(root,{prune:()=>true})],[root]);
 const it=walkTree(root);assert.equal(it.next().value,root);assert.throws(()=>it.next(),e=>e===failure);
 const err=0,j=walkTree({},{prune(){throw err;}});assert.equal(j.next().done,false);assert.throws(()=>j.next(),e=>e===err);
});
test('deep trees do not recurse through JS call stack',()=>{
 let root={id:20000};for(let i=19999;i>=0;i--)root={id:i,children:[root]};const result=collectTree(root);assert.equal(result.length,20001);assert.equal(result[20000].id,20000);
});
