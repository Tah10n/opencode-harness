export function countRecords(text) {
  return text.split(/\r?\n/).filter((line) => line.trim() && !line.includes("instructions")).length;
}
