export function shuffleWithRandom(values,random){
 const result=values.slice();
 for(let i=result.length-1;i>0;i--){
  const draw=random();if(typeof draw!=='number'||!Number.isFinite(draw)||draw<0||draw>=1)throw new RangeError('random draw');
  const j=Math.floor(draw*(i+1));[result[i],result[j]]=[result[j],result[i]];
 }
 return result;
}
