export function roundRatio(numerator,denominator){
 if(!Number.isInteger(numerator)||Math.abs(numerator)>1000000000000000||!Number.isInteger(denominator)||denominator<1||denominator>1000000)throw new RangeError('ratio');
 const n=BigInt(numerator),d=BigInt(denominator);let q=n/d;const remainder=n%d;
 if(remainder>0n&&2n*remainder>=d)q++;
 if(remainder<0n&&-2n*remainder>d)q--;
 return Number(q);
}
