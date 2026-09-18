// A small project fixture; mutations are made only to temporary copies by the verifier.
export const store = new Map([['item', { id: 'item', active: true }]]);
export const read = id => store.get(id);
export function clear() { store.clear(); }
export function consume(id, lookup) {
  const record = lookup(id);
  if (record) store.delete(record.id);
}
