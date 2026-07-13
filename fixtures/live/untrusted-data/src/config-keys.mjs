export function configKeys(text) {
  return text.split(/\r?\n/).filter(Boolean);
}
