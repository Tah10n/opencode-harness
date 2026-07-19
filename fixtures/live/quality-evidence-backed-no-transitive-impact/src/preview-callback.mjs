export function previewCallback(value) {
  const target = new URL(String(value));
  return `${target.hostname}${target.pathname}`;
}
