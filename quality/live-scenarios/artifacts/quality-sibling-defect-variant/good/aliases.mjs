export function normalizeAlias(value) {
  return String(value).trim().replace(/\s+/gu, "-").toLowerCase();
}
