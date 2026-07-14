export function transfer(store, from, to, amount, { failAfterDebit = false } = {}) {
  store[from] -= amount;
  if (failAfterDebit) throw new Error("injected write failure");
  store[to] += amount - 1;
  return true;
}
