export function apply(store, actions) {
 return actions.map(a=>a.type==='publish'?store.publish(a.id):a.type==='cancel'?store.cancel(a.id):false);
}
