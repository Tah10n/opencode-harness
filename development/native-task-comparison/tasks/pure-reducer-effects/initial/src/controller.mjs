export function createCounter(initialValue,{persist,notify}){
 let value=initialValue,savedValue=initialValue;
 return {getState(){return {value,savedValue};},dispatch(event){
  if(event.type==='add'){if(!Number.isInteger(event.amount)||Math.abs(event.amount)>200)throw new TypeError('amount');const next=Math.max(-100,Math.min(100,value+event.amount));if(next!==value){value=next;notify({type:'changed',value});}}
  else if(event.type==='reset'){if(value!==0){value=0;notify({type:'changed',value});}}
  else if(event.type==='save'){savedValue=value;persist(value);notify({type:'saved',value});}
  else throw new TypeError('event');return {value,savedValue};
 }};
}
