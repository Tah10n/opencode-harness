export function formatProfile(record, { legacy = false } = {}) {
  const rawName = String(record.name).trim();
  if (legacy) {
    return { display_name: rawName, user_id: String(record.id) };
  }
  return { name: rawName.toLowerCase(), id: record.id };
}
