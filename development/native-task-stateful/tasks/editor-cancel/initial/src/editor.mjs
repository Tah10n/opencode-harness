export function apply(store, actions) {
 return actions.map(a=>a.type==='publish'?store.publish(a.id):false);
}
