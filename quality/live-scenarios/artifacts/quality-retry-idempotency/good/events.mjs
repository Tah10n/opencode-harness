export function deliver(event, state) {
  if (state.processed.has(event.id)) return false;
  state.processed.add(event.id);
  state.effects.push(event.value);
  return true;
}
