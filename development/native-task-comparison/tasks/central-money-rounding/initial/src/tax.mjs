export function taxCents(amount,basisPoints){
 if(!Number.isInteger(amount)||Math.abs(amount)>1000000000||!Number.isInteger(basisPoints)||basisPoints<0||basisPoints>100000)throw new RangeError('tax');
 return (Math.round(amount*basisPoints/10000)||0);
}
