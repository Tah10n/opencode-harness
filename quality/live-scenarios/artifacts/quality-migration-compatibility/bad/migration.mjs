export function writeV2(record) {
  return { version: 2, displayName: record.name.trim() };
}

export function readAny(payload) {
  return payload.version === 2 ? payload.displayName : payload.name;
}

export function rollbackV2(payload) {
  return { version: 1, name: payload.displayName };
}
