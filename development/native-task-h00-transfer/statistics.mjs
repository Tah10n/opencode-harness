import assert from 'node:assert/strict';
import {macroFamilyPairedRate,exactTwoSidedFamilySignFlip} from '../../lib/benchmark/statistics.mjs';
// Same paired aggregation and percentile order statistics as the existing
// statistics implementation; project blocks stay intact in this experiment.
export function summarize(rows,metric){
 assert.equal(rows.length,48);assert.ok(rows.every(r=>[0,1].includes(r[metric])));
 const tasks=[...new Set(rows.map(r=>r.task))];assert.equal(tasks.length,12);
 const perTask=tasks.map(task=>{const rs=rows.filter(r=>r.task===task);assert.equal(rs.length,4);const means={};for(const arm of ['P','H00']){const a=rs.filter(r=>r.arm===arm);assert.deepEqual(a.map(r=>r.repetition).sort(),[1,2]);means[arm]=a.reduce((s,r)=>s+r[metric],0)/2;}return {task,project:rs[0].project,...means,delta:means.H00-means.P};});
 const projects=[...new Set(perTask.map(t=>t.project))];assert.equal(projects.length,6);for(const project of projects)assert.equal(perTask.filter(t=>t.project===project).length,2);
 const paired=tasks.flatMap(task=>[1,2].map(repetition=>{const p=rows.find(r=>r.task===task&&r.repetition===repetition&&r.arm==='P'),h=rows.find(r=>r.task===task&&r.repetition===repetition&&r.arm==='H00');return {family_id:p.project,baseline:!!p[metric],candidate:!!h[metric]};}));
 const rates=macroFamilyPairedRate(paired),blocks=projects.map(p=>perTask.filter(t=>t.project===p).reduce((s,t)=>s+t.delta,0)/2),samples=[];
 function enumerate(depth,total){if(depth===6){samples.push(total/6);return;}for(const value of blocks)enumerate(depth+1,total+value);}enumerate(0,0);samples.sort((a,b)=>a-b);
 const interval=[samples[Math.floor((samples.length-1)*0.025)],samples[Math.ceil((samples.length-1)*0.975)]];
 return {metric,...rates,perTask,projectDeltas:projects.map((project,i)=>({project,delta:blocks[i]})),wins:perTask.filter(t=>t.delta>0).length,losses:perTask.filter(t=>t.delta<0).length,ties:perTask.filter(t=>t.delta===0).length,interval95:interval,intervalMethod:'paired whole-project percentile bootstrap; all 46656 block draws; both tasks/arms/repetitions retained',degenerateInterval:interval[0]===interval[1],projectSignFlip:exactTwoSidedFamilySignFlip(blocks),uncertaintyCaveat:'Only six project groups. Degenerate bounds do not prove equality or precision; positive points with bounds including zero remain preliminary.'};
}
if(process.argv.includes('--self-test')){
 const fixture=(p,h)=>Array.from({length:48},(_,i)=>({task:'task'+Math.floor(i/4),project:'project'+Math.floor(i/8),repetition:Math.floor(i%4/2)+1,arm:i%2?'H00':'P',Q:i%2?h(Math.floor(i/8),Math.floor(i%8/4),Math.floor(i%4/2)):p(Math.floor(i/8),Math.floor(i%8/4),Math.floor(i%4/2))}));
 const equal=summarize(fixture(()=>1,()=>1),'Q');assert.equal(equal.delta,0);assert.deepEqual(equal.interval95,[0,0]);assert.equal(equal.degenerateInterval,true);
 const gain=summarize(fixture(()=>0,()=>1),'Q');assert.equal(gain.delta,1);assert.deepEqual(gain.interval95,[1,1]);
 const mixed=fixture(p=>p<3?1:0,p=>p<3?0:1),m=summarize(mixed,'Q');assert.equal(m.delta,0);assert.ok(m.interval95[0]<0&&m.interval95[1]>0);
 const reversed=summarize(mixed.map(r=>({...r,arm:r.arm==='P'?'H00':'P'})),'Q');assert.deepEqual(reversed.interval95,[-m.interval95[1],-m.interval95[0]]);
 assert.throws(()=>summarize(mixed.slice(1),'Q'));assert.equal(summarize([...mixed].reverse(),'Q').delta,m.delta);
 console.log(JSON.stringify({passed:true,method:'whole-project paired bootstrap',draws:46656,realProviderRequests:0}));
}
