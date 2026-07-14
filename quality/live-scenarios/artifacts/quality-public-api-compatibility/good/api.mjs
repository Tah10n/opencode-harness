export function userRecord(input) {
  if (!input || typeof input.name !== "string") {
    const error = new TypeError("invalid user");
    error.code = "ERR_USER_INPUT";
    throw error;
  }
  const name = input.name.trim();
  return { id: String(input.id), name, displayName: name };
}
