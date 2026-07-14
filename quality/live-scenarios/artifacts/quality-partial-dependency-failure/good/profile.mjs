export async function loadProfile(primary, fallback) {
  try {
    return await primary();
  } catch (error) {
    if (!["E_TIMEOUT", "E_UNAVAILABLE"].includes(error?.code)) throw error;
    return fallback();
  }
}
