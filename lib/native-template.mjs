import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Installation only. No runtime, plugin, provider or research imports.
export function materializeNativeTemplate({ repositoryRoot, outputDirectory, dryRun = false, review = false, task = false }) {
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
  if (review) {
    const role = fs.readFileSync(path.join(repositoryRoot, 'agents/core-reviewer.md'), 'utf8');
    const body = role.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    const supplement = fs.readFileSync(path.join(repositoryRoot, 'profiles/native/review.md'), 'utf8');
    files['review-context.mjs'] = fs.readFileSync(path.join(repositoryRoot, 'lib/native-review-context.mjs'), 'utf8');
    const url = Buffer.from(pathToFileURL(path.join(output, 'review-context.mjs')).href).toString('base64');
    const config = JSON.parse(files['opencode.json']);
    config.agent = { 'harness-reviewer': {
      description: 'Explicit diagnostic review in a new native session; no repair',
      mode: 'primary', prompt: body + '\n' + supplement,
      permission: { edit: 'deny', bash: 'deny', task: 'deny', todowrite: 'deny' },
    } };
    config.command = { 'harness-review': {
      description: 'Review explicit base and original task snapshot (new session; no arguments)',
      agent: 'harness-reviewer', subtask: false,
      template: 'Diagnostic review only. Do not implement or continue author work. Apply the native diagnostic review contract. If context capture failed or output is incomplete, report unverified.\nSnapshot:\n!' + '`' +
        `node -e "import(Buffer.from('${url}','base64').toString()).then(m=>process.stdout.write(JSON.stringify(m.reviewContext())))"` + '`',
    } };
    files['opencode.json'] = JSON.stringify(config, null, 2) + '\n';
  }
  if (task) {
    const config = JSON.parse(files['opencode.json']);
    config.command = { ...config.command, 'harness-task': {
      description: 'Experimental HARNESS_TASK_FILE delivery with factual checks and up to three corrective replies in one session; no arguments',
      subtask: false,
      template: 'Invoke harness_task exactly once with no arguments. It executes the original task with factual feedback. Do not perform repository operations yourself. If the tool is unavailable or fails, report the workflow incomplete. After it returns, summarize its actual result and remaining obligations without additional actions.',
    } };
    for (const name of ['native-task-plugin.mjs', 'native-task-workflow.mjs', 'native-task-observations.mjs', 'native-review-context.mjs'])
      files[name] = fs.readFileSync(path.join(repositoryRoot, 'lib', name), 'utf8');
    config.plugin = [pathToFileURL(path.join(output, 'native-task-plugin.mjs')).href];
    files['opencode.json'] = JSON.stringify(config, null, 2) + '\n';
  }
  if (!dryRun) {
    // The parent must exist: installation does not create an arbitrary tree.
    fs.mkdirSync(output, { mode: 0o700 });
    for (const [name, bytes] of Object.entries(files)) {
      fs.writeFileSync(path.join(output, name), bytes, { flag: 'wx', mode: 0o600 });
    }
  }
  return { kind: 'native-template', profile: 'core', output, dryRun, ...(review ? { review: true } : {}), ...(task ? { task: true } : {}), files: Object.keys(files) };
}
