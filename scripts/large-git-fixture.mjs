// Synthetic files stay in the caller's owned temporary repository.
import fs from 'node:fs';
import path from 'node:path';
export function largeGitFixture(root, bytes = 2579497, entries = 42834) {
  fs.mkdirSync(path.join(root, 'inventory'), {recursive:true});
  const names = [];
  let remaining = bytes;
  for (let i = 0; i < entries; i++) {
    const size = Math.floor(remaining / (entries - i));
    const prefix = 'inventory/' + String(i).padStart(5, '0') + '-';
    const name = prefix + 'x'.repeat(size - 3 - prefix.length);
    fs.writeFileSync(path.join(root, name), '');
    names.push(name); remaining -= Buffer.byteLength(name) + 3;
  }
  return names;
}
