// Fixed paired analysis, selected before scored runs. No provider or runner code.
const z = 1.959963984540054;
function counts(n,b,c) {
  if (![n,b,c].every(Number.isSafeInteger) || n<1 || n>100 || b<0 || c<0 || b+c>n) throw Error('Expected 1..100 pairs with valid discordant counts');
}
function choose(n,k) { let x=1;for(let j=1;j<=k;j++)x=x*(n-j+1)/j;return x; }
export function exactMcNemar(b,c) {
  counts(Math.max(1,b+c),b,c);const m=b+c;
  if(m===0)return 1;
  let tail=0;for(let k=0;k<=Math.min(b,c);k++)tail+=choose(m,k)*2**(-m);
  return Math.min(1,2*tail);
}
export function tango95(n,b,c) {
  counts(n,b,c);
  // Tango 1998 eq.29, including complete concordance at either marginal extreme.
  if(b+c===0){const width=z*z/(n+z*z);return [-width,width];}
  const estimate=(b-c)/n;
  const score=delta=>{
    const H=-(b+c)+(2*n-b+c)*delta,J=-c*delta*(1-delta);
    const q=(-H+Math.sqrt(Math.max(0,H*H-8*n*J)))/(4*n);
    const variance=n*(2*q+delta*(1-delta));
    const numerator=b-c-n*delta;
    if(variance<=0)return numerator===0?0:Math.sign(numerator)*Infinity;
    return numerator/Math.sqrt(variance);
  };
  const root=(lo,hi,target)=>{
    for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(score(mid)>target)lo=mid;else hi=mid;}
    return (lo+hi)/2;
  };
  return [estimate===-1?-1:root(-1,estimate,z),estimate===1?1:root(estimate,1,-z)];
}
export function pairedTable({both,bOnly,aOnly,neither}) {
  const n=both+bOnly+aOnly+neither;counts(n,bOnly,aOnly);
  if(![both,neither].every(x=>Number.isSafeInteger(x)&&x>=0))throw Error('Invalid concordant counts');
  return {n,both,bOnly,aOnly,neither,aComplete:both+aOnly,bComplete:both+bOnly,
    difference:(bOnly-aOnly)/n,pExactTwoSided:exactMcNemar(bOnly,aOnly),ci95:tango95(n,bOnly,aOnly)};
}
export function planningPower() {
  let twoSided=0,positive=0;
  for(let m=0;m<=100;m++)for(let b=0;b<=m;b++){
    if(exactMcNemar(b,m-b)>0.05)continue;
    const probability=choose(100,m)*0.25**m*0.75**(100-m)*choose(m,b)*0.8**b*0.2**(m-b);
    twoSided+=probability;if(b>m-b)positive+=probability;
  }
  return {n:100,bOnlyProbability:0.20,aOnlyProbability:0.05,alpha:0.05,twoSided,positive};
}
