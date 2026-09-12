export function summarize(values){
 const all=[];for(const value of values){if(all.length===100000||!Number.isInteger(value)||Math.abs(value)>1000000000)throw new RangeError('summary bounds');all.push(value);}
 const sum=all.reduce((a,b)=>a+b,0);return {count:all.length,sum,min:all.length?all.reduce((a,b)=>Math.min(a,b),Infinity):null,max:all.length?all.reduce((a,b)=>Math.max(a,b),-Infinity):null,mean:all.length?sum/all.length:null};
}
