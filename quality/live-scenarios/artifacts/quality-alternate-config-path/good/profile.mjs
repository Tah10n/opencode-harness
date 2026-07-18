export function formatProfile(record, { legacy = false } = {}) {
  const normalizedName = String(record.name).trim().toLowerCase();
  if (legacy) {
    return { display_name: normalizedName, user_id: String(record.id) };
  }
  return { name: normalizedName, id: record.id };
}
