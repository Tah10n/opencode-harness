export async function loadProfile(primary, fallback) {
  const value = await primary();
  return { id: value.id, name: "unknown" };
}
