export function normalizeToken(value) {
  return String(value).trim().toLowerCase();
}

export function displayToken(value) {
  return normalizeToken(value);
}
