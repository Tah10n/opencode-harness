export function canDelete(role) {
  return role === "editor" || role === "admin";
}
