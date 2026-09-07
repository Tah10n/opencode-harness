// Fixed 20-family x 3-task paired analysis. No model/runtime dependencies.
// The t approximation is specified in PROTOCOL.md; exact McNemar is nominal
// descriptive output only because the three tasks per family are dependent.
const T19_975 = 2.093024054408263;
const factorial = n => { let value=1; for(let i=2;i<=n;i++) value*=i; return value; };
export function t19TwoSided(t) {
  if (!Number.isFinite(t)) throw Error('T_STATISTIC_INVALID');
  // t=sqrt(19)*tan(theta), so the tail integrates cos(theta)^18.
  // Simpson integration avoids subtracting a near-one CDF for small tails.
  const lo=Math.atan(Math.abs(t)/Math.sqrt(19)), hi=Math.PI/2, n=8192, h=(hi-lo)/n;
  let sum=Math.cos(lo)**18+Math.cos(hi)**18;
  for(let i=1;i<n;i++) sum+=(i%2?4:2)*Math.cos(lo+i*h)**18;
  const coefficient=factorial(9)*4**9*factorial(9)/(factorial(18)*Math.PI);
  return Math.min(1,Math.max(0,2*coefficient*sum*h/3));
}
export function exactMcNemar(wins, losses) {
  if (![wins,losses].every(n=>Number.isSafeInteger(n)&&n>=0) || wins+losses>60) throw Error('DISCORDANT_COUNTS_INVALID');
  const n=wins+losses, k=Math.min(wins,losses);
  if (!n) return 1;
  let combination=1n, sum=1n;
  for(let i=1;i<=k;i++) { combination=combination*BigInt(n-i+1)/BigInt(i); sum+=combination; }
  return Math.min(1,Number(2n*sum)/Number(2n**BigInt(n)));
}
export function compare(rows, other) {
  if (!['A','B'].includes(other) || rows.length!==60) throw Error('COMPARISON_INPUT_INVALID');
  const families=new Map(), ids=new Set();
  let successesC=0,successesOther=0,wins=0,losses=0;
  for(const row of rows) {
    if (!row.id || ids.has(row.id) || !row.family || ![row.C,row[other]].every(x=>x===0||x===1)) throw Error('OUTCOME_INVALID');
    ids.add(row.id);
    const group=families.get(row.family)??[];
    group.push(row.C-row[other]); families.set(row.family,group);
    successesC+=row.C;successesOther+=row[other];
    wins+=Number(row.C>row[other]); losses+=Number(row.C<row[other]);
  }
  if (families.size!==20 || [...families.values()].some(g=>g.length!==3)) throw Error('FAMILY_BALANCE_INVALID');
  const means=[...families.values()].map(group=>group.reduce((a,b)=>a+b,0)/3);
  const estimate=(successesC-successesOther)/60;
  const variance=means.reduce((sum,x)=>sum+(x-estimate)**2,0)/19;
  const standardError=Math.sqrt(variance/20);
  // Integer family sums detect equal nonzero means without rounding artifacts.
  const sums=[...families.values()].map(g=>g.reduce((a,b)=>a+b,0));
  const degenerate=sums.every(x=>x===sums[0]);
  const interval=degenerate?null:[Math.max(-1,estimate-T19_975*standardError),Math.min(1,estimate+T19_975*standardError)];
  const p=degenerate?null:t19TwoSided(estimate/standardError);
  return {other,N:60,families:20,successesC,successesOther,rateC:successesC/60,rateOther:successesOther/60,estimate,interval,p,
    inference:degenerate?'unavailable_zero_family_variance':'approximate_cluster_paired_t',wins,losses,
    nominalExactMcNemar:exactMcNemar(wins,losses)};
}
export function analyze(rows,{isolationVerified,gradingComplete,userWorktreeIntact}={}) {
  if (![isolationVerified,gradingComplete,userWorktreeIntact].every(x=>typeof x==='boolean')) throw Error('VERIFICATION_FLAGS_REQUIRED');
  const primary=compare(rows,'A'),secondary=compare(rows,'B');
  const evidenceAvailable=isolationVerified&&gradingComplete&&userWorktreeIntact;
  const targetEstablished=evidenceAvailable&&primary.estimate>=0.1&&primary.interval!==null&&primary.interval[0]>0&&primary.p<0.05;
  const extraComputeSuperiority=targetEstablished&&secondary.interval!==null&&secondary.interval[0]>0&&secondary.p<0.05;
  return {primary,secondary,evidenceAvailable,targetEstablished,extraComputeSuperiority,
    recoveryAmongAFailures:{recovered:primary.wins,eligible:60-primary.successesOther},observedRegressions:primary.losses};
}
