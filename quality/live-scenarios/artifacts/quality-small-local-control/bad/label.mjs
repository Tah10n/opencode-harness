export function label(value) {
  const normalized = String(value).trim();
  return normalized ? normalized.toUpperCase() : "UNTITLED";
}
