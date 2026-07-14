export async function loadConfig(cache, fetchRemote) {
  if (cache.has("config")) return cache.get("config").value;
  const entry = await fetchRemote();
  cache.set("config", entry);
  return entry.value;
}
