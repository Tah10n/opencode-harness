function planChannels(requested,available,fallback='log'){
 const known=new Set(available),seen=new Set(),plan=[];
 for(const channel of requested){const target=known.has(channel)?channel:fallback;if(!known.has(target))throw new RangeError('unknown channel: '+channel);if(!seen.has(target)){seen.add(target);plan.push(target);}}
 return plan;
}
export function createNotifier(handlers,{fallback='log'}={}){
 const saved=new Map(Object.entries(handlers));for(const fn of saved.values())if(typeof fn!=='function')throw new TypeError('handler');
 return async function notify(message,requested){const plan=planChannels(requested,[...saved.keys()],fallback),out=[];for(const channel of plan){const result=await Reflect.apply(saved.get(channel),undefined,[message]);out.push({channel,result});}return out;};
}
