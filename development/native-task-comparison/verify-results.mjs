// Model-free conservation checks for the published, incomplete evaluation report.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
const read=n=>JSON.parse(fs.readFileSync(new URL(n,root)));
const r=read('paired-results.json'),audit=read('execution-summary.json'),schedule=read('schedule.json').attempts;
assert.equal(r.pairs.length,100);assert.equal(new Set(r.pairs.map(p=>p.task)).size,100);
assert.equal(audit.slots.length,200);assert.equal(new Set(audit.slots.map(s=>s.slot)).size,200);
for(const s of schedule){const row=audit.slots.find(x=>x.slot===s.slot);for(const k of ['task','arm'])assert.equal(row[k],s[k]);assert.equal(row.terminationVerified,true);assert.equal(row.cleanupStatus,0);const p=r.pairs.find(p=>p.pair===s.pair);assert.equal(p.task,s.task);assert.equal(p[s.arm].slot,s.slot);assert.equal(p[s.arm].final.deliveryAvailable,row.deliveryAvailable);}
const count=f=>r.pairs.filter(f).length;
const disposition={both:count(p=>p.A.final.complete===true&&p.B.final.complete===true),bOnly:count(p=>p.A.final.complete===false&&p.B.final.complete===true),aOnly:count(p=>p.A.final.complete===true&&p.B.final.complete===false),neither:count(p=>p.A.final.complete===false&&p.B.final.complete===false),unassessedPairs:count(p=>p.A.final.complete===null||p.B.final.complete===null)};
assert.equal(Object.values(disposition).reduce((a,b)=>a+b,0),100);for(const [k,v]of Object.entries(disposition))assert.equal(r.primary[k],v);
assert.equal(r.primary.difference,null);assert.equal(r.primary.pExactTwoSided,null);assert.equal(r.primary.confidenceInterval,null);assert.equal(r.detectedPositiveDifference,null);assert.equal(r.practicalPointEstimateAtLeastTenPercentagePoints,null);
let manualPending=0,missing=0,d0=0;
for(const p of r.pairs){for(const arm of ['A','B']){const e=p[arm].final;if(e.deliveryAvailable===false){missing++;assert.equal(e.complete,false);for(const c of Object.values(e.checks)){assert.equal(c.unavailable,true);assert.equal(c.counts,null);assert.equal(c.exitCode,null);}}else if(e.complete===null){manualPending++;assert.equal(e.testsDelivered,null);assert.equal(e.docsDelivered,null);}}
 if(p.B.D0)d0++;
}
assert.equal(missing,audit.unavailableFinalDeliveries);assert.equal(manualPending,audit.manualReviewsPending);assert.equal(d0,audit.availableD0);assert.equal(200-missing+d0-manualPending,audit.independentManualReviews);
for(const arm of ['A','B']){const rows=r.pairs.map(p=>p[arm].cost),sum=f=>rows.reduce((n,x)=>n+f(x),0);for(const [k,f]of Object.entries({elapsedMs:x=>x.elapsedMs,providerRequests:x=>x.provider.requests,toolCalls:x=>x.toolCalls,observedProviderTotalTokens:x=>x.provider.totalTokens,inputTokens:x=>x.provider.inputTokens,outputTokens:x=>x.provider.outputTokens,cachedInputSubset:x=>x.provider.cachedInputSubset,reasoningOutputSubset:x=>x.provider.reasoningOutputSubset,unknownUsageRequests:x=>x.provider.unknownUsageRequests})){assert.equal(sum(f),r.armCosts[arm][k],arm+'/'+k);}for(const x of rows){assert.equal(x.provider.inputTokens+x.provider.outputTokens,x.provider.totalTokens);assert.equal(x.provider.observedUsageRequests+x.provider.unknownUsageRequests,x.provider.requests);assert.equal(Object.values(x.provider.statuses).reduce((a,b)=>a+b,0),x.provider.requests);}}
assert.equal(audit.slots.filter(s=>s.statuses['429']).length,audit.quotaAffectedSlots);assert.equal(audit.slots.find(s=>s.statuses['429']).slot,audit.firstQuotaAffectedSlot);
const raw=fs.readFileSync(new URL('paired-results.json',root),'utf8');assert(!/\/(?:Users|private|work)\//.test(raw));assert(!/\b(?:call|msg|ses|session)_[A-Za-z0-9_-]+/.test(raw));
const review=read('independent-review.json');
assert.equal(review.blindEndpointReviews,audit.independentManualReviews);assert.equal(manualPending,0);assert.deepEqual(review.openFindings,[]);assert.deepEqual(review.currentDescriptiveTable,r.primary);
assert.equal(review.originalDiscordantPairsChecked.length,25);assert.equal(new Set(review.originalDiscordantPairsChecked.map(p=>p.pair)).size,25);
for(const p of review.originalDiscordantPairsChecked){const actual=r.pairs.find(x=>x.pair===p.pair);assert.equal(p.task,actual.task);const a=actual.A.final.complete,b=actual.B.final.complete;assert.equal(p.currentDisposition,a&&b?'both':a?'A-only':b?'B-only':'neither');}
assert.equal(review.sourceAdjudicationsChecked.length,68);assert.equal(new Set(review.sourceAdjudicationsChecked.map(x=>x.endpoint)).size,68);
assert.deepEqual(review.accounting.arms,r.armCosts);assert.equal(review.accounting.slotsVerified,200);assert.equal(review.accounting.endpointChecksVerified,255);assert.equal(review.statistics.samplePValueComputed,false);assert.equal(review.statistics.sampleCIComputed,false);
console.log(JSON.stringify({passed:true,pairs:100,slots:200,manualPending,missingDeliveries:missing,confirmatoryVerdict:'withheld',providerCalls:0}));

const first83=r.pairs.filter(p=>p.pair<=83);assert.equal(first83.length,83);
assert.equal(first83.filter(p=>p.A.final.complete).length,50);
assert.equal(first83.filter(p=>p.B.final.complete).length,42);
assert.equal((42+17)-50,9); // Spending bound only; no effect estimate.
