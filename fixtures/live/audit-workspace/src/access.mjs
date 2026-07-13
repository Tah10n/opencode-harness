export function canRead(role) {
  return ["reader", "editor", "admin"].includes(role);
}
