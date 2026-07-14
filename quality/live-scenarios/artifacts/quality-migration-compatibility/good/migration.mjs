export function writeV2(record) {
  const name = record.name.trim();
  return { version: 2, name, displayName: name };
}

export function readAny(payload) {
  return payload.version === 2 ? payload.displayName : payload.name;
}

export function rollbackV2(payload) {
  return { version: 1, name: payload.name };
}
