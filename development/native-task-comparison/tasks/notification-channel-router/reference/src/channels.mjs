export function planChannels(requested,available,fallback='log'){
 const known=new Set(available),seen=new Set(),plan=[];
 for(const channel of requested){const target=known.has(channel)?channel:fallback;if(!known.has(target))throw new RangeError('unknown channel: '+channel);if(!seen.has(target)){seen.add(target);plan.push(target);}}
 return plan;
}
