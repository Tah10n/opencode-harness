function gcd(a,b){while(b){const next=a%b;a=b;b=next;}return a;}
function ratio(n,d){const g=gcd(n,d);return[n/g,d/g];}
function multiply(a,b){return ratio(a[0]*b[0],a[1]*b[1]);}
function same(a,b){return a[0]===b[0]&&a[1]===b[1];}
function validate(edges){for(const e of edges)if(typeof e.from!=='string'||typeof e.to!=='string'||! /^[a-z]{1,30}$/.test(e.from)||! /^[a-z]{1,30}$/.test(e.to)||!Number.isInteger(e.numerator)||!Number.isInteger(e.denominator)||e.numerator<1||e.denominator<1||e.numerator>1000000||e.denominator>1000000)throw new TypeError('edge');}
export function compileUnitGraph(edges){
 validate(edges);const adjacency=new Map();
 for(const edge of edges){if(!adjacency.has(edge.from))adjacency.set(edge.from,[]);if(!adjacency.has(edge.to))adjacency.set(edge.to,[]);const factor=ratio(BigInt(edge.numerator),BigInt(edge.denominator));adjacency.get(edge.from).push([edge.to,factor]);adjacency.get(edge.to).push([edge.from,[factor[1],factor[0]]]);}
 const potential=new Map(),component=new Map();let group=0;
 for(const root of adjacency.keys()){if(potential.has(root))continue;potential.set(root,[1n,1n]);component.set(root,group++);const pending=[root];while(pending.length){const from=pending.pop();for(const [to,factor]of adjacency.get(from)){const expected=multiply(potential.get(from),factor);if(potential.has(to)){if(!same(expected,potential.get(to)))throw new RangeError('inconsistent conversions');}else{potential.set(to,expected);component.set(to,component.get(from));pending.push(to);}}}}
 return function convert(value,from,to){if(!Number.isFinite(value)||Math.abs(value)>1000000)throw new TypeError('value');if(!potential.has(from)||!potential.has(to))throw new RangeError('unknown unit');if(component.get(from)!==component.get(to))throw new RangeError('disconnected units');const a=potential.get(from),b=potential.get(to),factor=ratio(b[0]*a[1],b[1]*a[0]);return value*Number(factor[0])/Number(factor[1]);};
}
