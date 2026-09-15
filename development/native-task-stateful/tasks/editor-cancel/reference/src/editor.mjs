export function apply(store, actions) {
 if(!Array.isArray(actions)||actions.some(a=>!a||!['publish','cancel'].includes(a.type)||typeof a.id!=='string'||!a.id))throw new TypeError('actions');
 return actions.map(a=>a.type==='publish'?store.publish(a.id):store.cancel(a.id));
}
