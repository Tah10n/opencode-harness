export function validateLine(line) {
  if (typeof line.name !== 'string' || !line.name.trim()) throw new RangeError('name');
  if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new RangeError('quantity');
  if (!Number.isInteger(line.unitCents) || line.unitCents < 0) throw new RangeError('unitCents');
  return {name:line.name, quantity:line.quantity, unitCents:line.unitCents};
}
