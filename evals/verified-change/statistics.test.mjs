import test from 'node:test'; import assert from 'node:assert/strict';
import {t19TwoSided,exactMcNemar,analyze,compare} from './statistics.mjs';
const rows=()=>Array.from({length:60},(_,i)=>({id:`task-${i}`,family:`family-${Math.floor(i/3)}`,A:0,B:0,C:0}));
test('t tails agree with fixed df=19 critical values and symmetry',()=>{
 assert.ok(Math.abs(t19TwoSided(0)-1)<1e-12);
 assert.ok(Math.abs(t19TwoSided(2.093024054408263)-0.05)<1e-10);
 assert.ok(Math.abs(t19TwoSided(2.860934606449915)-0.01)<1e-10);
 assert.equal(t19TwoSided(-2),t19TwoSided(2));
});
test('exact McNemar uses paired discordance and includes ties',()=>{
 assert.equal(exactMcNemar(0,0),1);assert.equal(exactMcNemar(6,0),0.03125);assert.equal(exactMcNemar(0,6),0.03125);assert.equal(exactMcNemar(4,4),1);
});
test('all equal family effects never produce an exact-equality claim',()=>{
 for(const C of [0,1]){const data=rows().map(r=>({...r,C}));const result=analyze(data,{isolationVerified:true,gradingComplete:true,userWorktreeIntact:true});assert.equal(result.primary.interval,null);assert.equal(result.primary.p,null);assert.equal(result.targetEstablished,false);}
});
test('paired cluster estimate, regression accounting, hierarchy and unavailable grading',()=>{
 const data=rows();
 // 18 wins in 18 distinct families, one loss, one unchanged family.
 for(let family=0;family<18;family++)data[family*3].C=1;
 data[54].A=1;
 const result=analyze(data,{isolationVerified:true,gradingComplete:true,userWorktreeIntact:true});
 assert.equal(result.primary.estimate,17/60);assert.equal(result.primary.wins,18);assert.equal(result.observedRegressions,1);assert.equal(result.targetEstablished,true);assert.equal(result.extraComputeSuperiority,true);
 const noGrading=analyze(data,{isolationVerified:true,gradingComplete:false,userWorktreeIntact:true});assert.equal(noGrading.targetEstablished,false);
 assert.throws(()=>compare(data.slice(1),'A'),/INVALID/);
 const duplicate=data.map(r=>({...r}));duplicate[1].id=duplicate[0].id;assert.throws(()=>compare(duplicate,'A'),/INVALID/);
});
