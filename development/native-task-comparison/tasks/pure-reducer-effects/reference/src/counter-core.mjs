export function reduceCounter(state,event){
 let value=state.value,savedValue=state.savedValue,effects=[];
 if(event.type==='add'){if(!Number.isInteger(event.amount)||Math.abs(event.amount)>200)throw new TypeError('amount');const next=Math.max(-100,Math.min(100,value+event.amount));if(next!==value)value=next;}
 else if(event.type==='reset'){if(value!==0)value=0;}
 else if(event.type==='save'){savedValue=value;effects=[{type:'persist',value},{type:'notify',event:{type:'saved',value}}];}
 else throw new TypeError('event');
 if(event.type!=='save'&&value!==state.value)effects=[{type:'notify',event:{type:'changed',value}}];
 return {state:{value,savedValue},effects};
}
