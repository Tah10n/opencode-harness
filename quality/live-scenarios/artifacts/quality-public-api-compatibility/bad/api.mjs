export function userRecord(input) {
  const displayName = input.name.trim();
  return { id: String(input.id), displayName };
}
