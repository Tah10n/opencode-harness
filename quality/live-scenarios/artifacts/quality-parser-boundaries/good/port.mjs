export function parsePort(text) {
  if (typeof text !== "string" || !/^[0-9]+$/u.test(text)) {
    const error = new RangeError("invalid port");
    error.code = "ERR_PORT";
    throw error;
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    const error = new RangeError("invalid port");
    error.code = "ERR_PORT";
    throw error;
  }
  return value;
}
