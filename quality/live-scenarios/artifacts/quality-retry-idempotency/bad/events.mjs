export function deliver(event, state) {
  state.effects.push(event.value);
  return true;
}
