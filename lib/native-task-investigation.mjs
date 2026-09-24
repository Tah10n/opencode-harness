// One optional test-producing native subtask. No evaluator or provider API.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readableProjectPath, testPath, sourcePath, digest} from './native-project-scope.mjs';
import {sensitivityDependencyLayout} from './native-sensitivity.mjs';
import {copySensitivityDependencies} from './native-sensitivity-runner.mjs';
import {reviewContext} from './native-review-context.mjs';

export function investigationEnabled(env = process.env) {
  const value = env.HARNESS_TASK_INVESTIGATION ?? '0';
  if (!['0', '1'].includes(value)) throw Error('HARNESS_TASK_INVESTIGATION must be 0 or 1');
  return value === '1';
}
export const investigationInstruction = `Optional native tool harness_investigate is available once for a concrete behavior question related to the original task. Choose the question yourself from the requirement, current code/diff, executed checks or a meaningful sensitivity observation. No question is required. Use action=investigate with question, location and reason. A separate session of your same model can investigate the public API and deliver project tests; you wait while it works. Its expectation is a hypothesis: check the returned test and expected result against the ORIGINAL contract, then use action=accept with your rationale or action=decline. Passing tests or differences from a mutation do not establish correctness. After acceptance finish all production, consumers, types and docs, and run the relevant checks after the last edit. The subtask shares your task deadline and the total 180-second diagnostic budget. Start only while at least 120 seconds remain; leave time to integrate. No recursive delegation.`;

export const investigationTestPath = name => testPath(name) && sourcePath(name);

const git = (directory, args, input) => {
  const r = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {cwd: directory, input, encoding: 'utf8', timeout: 15000, maxBuffer: 10 * 1024 * 1024});
  if (r.status !== 0) throw Error('Investigation Git operation failed: ' + (r.stderr || r.error?.message));
  return r.stdout;
};
const put = (root, name, bytes, mode = 0o644) => {
  const dest = path.resolve(root, name);
  if (!dest.startsWith(root + path.sep)) throw Error('Invalid snapshot path');
  fs.mkdirSync(path.dirname(dest), {recursive: true}); fs.writeFileSync(dest, bytes, {mode}); fs.chmodSync(dest, mode);
  if (digest(fs.readFileSync(dest)) !== digest(bytes) || (fs.statSync(dest).mode & 0o777) !== mode)
    throw Error('Investigation snapshot copy verification failed: ' + name);
};
// The analysis scope is deliberately text-only. Investigation needs a complete
// byte-for-byte project copy, including bounded opaque assets outside the prompt.
const snapshotLimits = Object.freeze({files: 1500, textBytes: 8 * 1024 * 1024,
  textFileBytes: 512 * 1024, opaqueBytes: 8 * 1024 * 1024, opaqueFileBytes: 2 * 1024 * 1024});
function investigationSnapshot(directory, rules, active) {
  const root = fs.realpathSync(directory), device = fs.statSync(root).dev;
  const listed = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false',
    'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024});
  if (listed.status !== 0 || listed.error) throw Error('Investigation project enumeration unavailable');
  const names = [...new Set(listed.stdout.split('\0').filter(Boolean))].sort();
  if (names.length > snapshotLimits.files) throw Error('Investigation snapshot file limit exceeded');
  const files = new Map(); let textBytes = 0, opaqueBytes = 0;
  for (const name of names) {
    active();
    if (path.relative(root, path.resolve(root, name)).split(path.sep).join('/') !== name ||
        name.startsWith('../') || !readableProjectPath(root, path.join(root, name), rules))
      throw Error('Unsupported or unreadable investigation path: ' + name);
    let cursor = root;
    for (const part of name.split('/')) {
      cursor = path.join(cursor, part);
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink() || stat.dev !== device ||
          (cursor === path.join(root, name) ? !stat.isFile() : !stat.isDirectory()))
        throw Error('Unsupported investigation file kind or mount: ' + name);
    }
    const file = path.join(root, name), before = fs.statSync(file);
    if (before.size > snapshotLimits.opaqueFileBytes ||
        textBytes + opaqueBytes + before.size > snapshotLimits.textBytes + snapshotLimits.opaqueBytes)
      throw Error('Investigation snapshot size limit exceeded: ' + name);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let bytes;
    try {
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || opened.dev !== device || opened.ino !== before.ino || opened.size !== before.size)
        throw Error('Investigation file changed during snapshot: ' + name);
      bytes = fs.readFileSync(fd);
      const after = fs.fstatSync(fd);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.mode !== before.mode || bytes.length !== before.size)
        throw Error('Investigation file changed during snapshot: ' + name);
    } finally { fs.closeSync(fd); }
    const opaque = bytes.includes(0) || !Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes);
    if (opaque) {
      if (sourcePath(name) || bytes.length > snapshotLimits.opaqueFileBytes || (opaqueBytes += bytes.length) > snapshotLimits.opaqueBytes)
        throw Error('Unsupported opaque investigation file: ' + name);
    } else if (bytes.length > snapshotLimits.textFileBytes || (textBytes += bytes.length) > snapshotLimits.textBytes)
      throw Error('Investigation text snapshot size limit exceeded: ' + name);
    files.set(name, {bytes, mode: before.mode & 0o777, sha256: digest(bytes), opaque});
  }
  return files;
}
const gitBytes = (directory, args) => {
  const r = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args],
    {cwd: directory, timeout: 15000, maxBuffer: snapshotLimits.opaqueFileBytes + 1024});
  if (r.status !== 0 || r.error) throw Error('Investigation baseline blob unavailable');
  return r.stdout;
};
function dependencyFingerprint(root, layers) {
  const facts = [];
  const walk = file => {
    const relative = path.relative(root, file);
    if (relative.split(path.sep).includes('.cache')) return;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) facts.push([relative, 'link', fs.readlinkSync(file)]);
    else if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) walk(path.join(file, name));
    else if (stat.isFile()) facts.push([relative, stat.mode & 0o777, digest(fs.readFileSync(file))]);
    else throw Error('Unsupported installed dependency file');
  };
  for (const layer of layers) if (fs.existsSync(layer)) walk(layer);
  return digest(JSON.stringify(facts));
}

export async function prepareInvestigation({directory, artifacts, base, rules, active}) {
  const files = investigationSnapshot(directory, rules, active);
  const layout = sensitivityDependencyLayout(directory), root = path.join(artifacts, 'investigation', 'repo');
  fs.mkdirSync(root, {recursive: true, mode: 0o700});
  // Independent Git database: the child's commands cannot write the author's
  // index/refs or use its worktree administrative file to reach author files.
  git(root, ['init', '-q']);
  const entries = git(directory, ['ls-tree', '-r', '-z', base]).split('\0').filter(Boolean);
  const baselineNames = new Set(); let baselineTextBytes = 0, baselineOpaqueBytes = 0;
  for (const entry of entries) {
    active(); const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
    if (!match || !files.has(match[3])) throw Error('Unsupported baseline snapshot layout');
    baselineNames.add(match[3]);
    const bytes = gitBytes(directory, ['show', base + ':' + match[3]]);
    const opaque = bytes.includes(0) || !Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes);
    if (opaque ? sourcePath(match[3]) || bytes.length > snapshotLimits.opaqueFileBytes ||
          (baselineOpaqueBytes += bytes.length) > snapshotLimits.opaqueBytes :
        bytes.length > snapshotLimits.textFileBytes || (baselineTextBytes += bytes.length) > snapshotLimits.textBytes)
      throw Error('Unsupported baseline file: ' + match[3]);
    // The author diff is included in the child request. A changed opaque file
    // would make that binary Git patch part of the model input.
    if ((opaque || files.get(match[3]).opaque) && digest(bytes) !== files.get(match[3]).sha256)
      throw Error('Changed opaque author file cannot enter investigator prompt: ' + match[3]);
    put(root, match[3], bytes, match[1] === '100755' ? 0o755 : 0o644);
  }
  for (const [name, file] of files)
    if (file.opaque && !baselineNames.has(name)) throw Error('New opaque author file cannot enter investigator prompt: ' + name);
  git(root, ['add', '.']);
  git(root, ['-c', 'user.name=Harness', '-c', 'user.email=harness@localhost', 'commit', '-qm', 'Isolated original task base']);
  const childBase = git(root, ['rev-parse', 'HEAD']).trim();
  const relative = path.relative(layout.dependencyRoot, directory);
  const childDirectory = relative ? path.join(root, relative) : root;
  if (relative) git(root, ['worktree', 'add', '--detach', childDirectory, childBase]);
  for (const [name, file] of files) put(childDirectory, name, file.bytes, file.mode);
  await copySensitivityDependencies(layout, root, {directory, rules, active});
  const copiedLayers = layout.dependencyLayers.map(layer => path.join(root, path.relative(layout.dependencyRoot, layer)));
  const dependencyState = dependencyFingerprint(root, copiedLayers);
  const capture = () => reviewContext({cwd: childDirectory, base: childBase, taskFile: null, permissionRules: rules});
  const initial = capture();
  if (initial.status !== 'captured') throw Error(initial.error);
  const protectedFiles = [...files].filter(([name]) => !investigationTestPath(name));
  const testOnly = () => {
    const current = investigationSnapshot(childDirectory, rules, active);
    if (dependencyFingerprint(root, copiedLayers) !== dependencyState) return false;
    const protectedNames = new Set(protectedFiles.map(([name]) => name));
    return protectedFiles.every(([name, file]) => current.get(name)?.sha256 === file.sha256 && current.get(name)?.mode === file.mode)
      && [...current].every(([name]) => protectedNames.has(name) || investigationTestPath(name));
  };
  // A separate baseline commit makes the returned patch relative to the exact
  // current author snapshot, while sense still uses the original child base.
  git(childDirectory, ['add', '.']);
  const tree = git(childDirectory, ['write-tree']).trim();
  const testPatch = () => {
    if (!testOnly()) throw Error('Investigator changed production/configuration or another non-test file; patch rejected');
    git(childDirectory, ['add', '.']);
    return git(childDirectory, ['diff', '--cached', '--binary', '--full-index', tree]);
  };
  return {directory: childDirectory, base: childBase, capture, initial: capture(), testOnly, testPatch};
}

export function investigationDeliverySummary(delivery) {
  const excerpt = value => String(value ?? '').slice(0, 1600);
  const commands = delivery.commands.map(event => {
    const row = {tool: event.tool, state: event.state, command: event.args?.command, exit: event.exit};
    if (event.tool === 'harness_sense') {
      try {
        const report = JSON.parse(event.output.split('\nSensitivity state:')[0]);
        row.diagnostic = {status: report.status, baseline: report.baseline, cost: report.cost,
          variants: report.variants.map(v => ({fileName: v.fileName, diff: v.diff, status: v.status, output: v.output})), limits: report.limits};
      } catch { row.output = 'Diagnostic output unavailable; inspect the retained child evidence'; }
    } else row.output = excerpt(event.output);
    return row;
  });
  return {...delivery, commands, notice: 'Child diagnostic references are not transferable. Run fresh author diagnostics after integration. Complete evidence is retained by the host; expected results still require author contract review.'};
}

export function integrateInvestigation({directory, capture, expected, patch}) {
  if (capture().snapshotSha256 !== expected) return {accepted: false, reason: 'Author snapshot changed; test patch not applied. Current user bytes preserved.'};
  if (!patch) return {accepted: true, changed: false};
  // Exact snapshot plus standard atomic Git apply; no three-way overwrite.
  git(directory, ['apply', '--check', '--binary', '-'], patch);
  if (capture().snapshotSha256 !== expected) return {accepted: false, reason: 'Author snapshot changed during patch preflight; no application.'};
  git(directory, ['apply', '--binary', '--whitespace=nowarn', '-'], patch);
  return {accepted: true, changed: true};
}
