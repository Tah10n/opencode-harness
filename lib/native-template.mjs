import fs from 'node:fs';
import path from 'node:path';

// Installation only. No runtime, plugin, provider or research imports.
export function materializeNativeTemplate({ repositoryRoot, outputDirectory, dryRun = false }) {
  if (!path.isAbsolute(outputDirectory ?? '')) throw new Error('Native template output must be absolute');
  const output = path.resolve(outputDirectory);
  // Never overwrite or merge an existing config directory (including a symlink).
  try {
    fs.lstatSync(output);
    throw new Error('Native template output must not already exist');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const instructions = fs.readFileSync(path.join(repositoryRoot, 'profiles/native/core.md'), 'utf8');
  const files = {
    'core.md': instructions,
    'opencode.json': JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      instructions: [path.join(output, 'core.md')],
    }, null, 2) + '\n',
  };
  if (!dryRun) {
    // The parent must exist: installation does not create an arbitrary tree.
    fs.mkdirSync(output, { mode: 0o700 });
    for (const [name, bytes] of Object.entries(files)) {
      fs.writeFileSync(path.join(output, name), bytes, { flag: 'wx', mode: 0o600 });
    }
  }
  return { kind: 'native-template', profile: 'core', output, dryRun, files: Object.keys(files) };
}
