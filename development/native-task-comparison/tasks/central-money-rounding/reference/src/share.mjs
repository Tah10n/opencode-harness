import {roundRatio} from './money-core.mjs';
export function shareCents(amount,part,whole){
 if(!Number.isInteger(amount)||Math.abs(amount)>1000000000||!Number.isInteger(whole)||whole<1||whole>1000000||!Number.isInteger(part)||part<0||part>whole)throw new RangeError('share');
 return roundRatio(amount*part,whole);
}
