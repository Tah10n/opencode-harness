function gcd(a,b){while(b){const next=a%b;a=b;b=next;}return a;}
function ratio(n,d){const g=gcd(n,d);return[n/g,d/g];}
function multiply(a,b){return ratio(a[0]*b[0],a[1]*b[1]);}
function same(a,b){return a[0]===b[0]&&a[1]===b[1];}
function validate(edges){for(const e of edges)if(typeof e.from!=='string'||typeof e.to!=='string'||! /^[a-z]{1,30}$/.test(e.from)||! /^[a-z]{1,30}$/.test(e.to)||!Number.isInteger(e.numerator)||!Number.isInteger(e.denominator)||e.numerator<1||e.denominator<1||e.numerator>1000000||e.denominator>1000000)throw new TypeError('edge');}
export function createConverter(edges){validate(edges);const units=new Set(),table=new Map();for(const e of edges){units.add(e.from);units.add(e.to);table.set(e.from+'>'+e.to,e.numerator/e.denominator);table.set(e.to+'>'+e.from,e.denominator/e.numerator);}return(value,from,to)=>{if(!Number.isFinite(value)||Math.abs(value)>1000000)throw new TypeError('value');if(!units.has(from)||!units.has(to))throw new RangeError('unknown unit');if(from===to)return value;if(!table.has(from+'>'+to))throw new RangeError('disconnected units');return value*table.get(from+'>'+to);};}
