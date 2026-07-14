export function transfer(store, from, to, amount, { failAfterDebit = false } = {}) {
  if (!Number.isFinite(amount) || amount <= 0 || store[from] < amount) {
    throw new Error("insufficient funds or invalid amount");
  }
  const beforeFrom = store[from];
  const beforeTo = store[to];
  try {
    store[from] -= amount;
    if (failAfterDebit) throw new Error("injected write failure");
    store[to] += amount;
    return true;
  } catch (error) {
    store[from] = beforeFrom;
    store[to] = beforeTo;
    throw error;
  }
}
