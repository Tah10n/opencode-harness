export function normalizeToken(value) {
  return String(value).trim().toUpperCase();
}

export function displayToken(value) {
  return normalizeToken(value);
}
