export function greet(name = "") {
  const subject = name.trim() || "world";
  return `Hello, ${subject}`;
}
