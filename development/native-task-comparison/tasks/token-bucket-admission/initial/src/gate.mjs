export function createGate(capacity,rate,now,handler){return (value,cost=1)=>({allowed:true,retryAfterMs:0,value:handler(value)});}
