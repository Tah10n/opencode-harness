export async function loadConfig(cache, fetchRemote) {
  const cached = cache.get("config");
  if (cached?.schemaVersion === 2) return cached.value;
  const entry = await fetchRemote();
  if (entry?.schemaVersion !== 2 || typeof entry.value !== "string") {
    throw new Error("unsupported config schema");
  }
  cache.set("config", entry);
  return entry.value;
}
