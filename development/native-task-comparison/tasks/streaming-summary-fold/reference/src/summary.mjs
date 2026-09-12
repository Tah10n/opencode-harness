export function createSummary(){
 let count=0,sum=0,min=null,max=null;
 return {add(value){
  if(!Number.isInteger(value)||Math.abs(value)>1000000000||count===100000)throw new RangeError('summary bounds');
  count++;sum+=value;min=min===null?value:Math.min(min,value);max=max===null?value:Math.max(max,value);
 },snapshot(){return {count,sum,min,max,mean:count?sum/count:null};}};
}
export function summarize(values){const state=createSummary();for(const value of values)state.add(value);return state.snapshot();}
