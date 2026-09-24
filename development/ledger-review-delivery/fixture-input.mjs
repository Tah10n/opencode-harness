// Scripted fixture validation only; this does not alter a model prompt or request.
import assert from 'node:assert/strict';
export function checkFixtureInput(stage,body,task,review){
 const all=JSON.stringify(body),names=(body.tools??[]).map(t=>t.name);
 if(!names.length)return 'title';
 if(stage==='R'){
  assert.deepEqual([...names].sort(),['glob','grep','read']);assert.ok(all.includes(task));return 'reviewer';
 }
 if(!all.includes('Implement the complete original task')){
  assert.ok(names.includes('harness_task'));assert.ok(all.includes('Invoke harness_task exactly once'));return 'parent';
 }
 assert.ok(all.includes(task));assert.ok(!all.includes('During self-review,'));
 if(stage==='F')assert.ok(all.includes(JSON.stringify(review).slice(1,-1)),'Unchanged reviewer response missing');
 return 'author';
}
