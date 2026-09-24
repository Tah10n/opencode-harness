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
export const investigationInstruction = `Optional native tool harness_investigate is available once for a concrete behavior question related to the original task. Choose the question yourself from the requirement, current code/diff, executed checks or a meaningful sensitivity observation. No question is required. Use action=investigate with question, location and reason. A separate session of your same model can investigate the public API and deliver project tests; you wait while it works. The first result is a compact receipt. Use action=inspect with section=patch, explanation, checks, or output (with callID), and pass nextCursor as cursor to continue a section before deciding. The child patch is not in your worktree until accept. Its expectation is a hypothesis: check the returned test and expected result against the ORIGINAL contract, then use action=accept with your rationale or action=decline. Passing tests or differences from a mutation do not establish correctness. After acceptance finish all production, consumers, types and docs, and run the relevant checks after the last edit. The subtask shares your task deadline and the total 180-second diagnostic budget. Start only while at least 120 seconds remain; leave time to integrate. No recursive delegation.`;

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

export const investigationReplyBytes = 12_000;
const serializedBytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const short = (value, max) => Array.from(String(value ?? '')).slice(0, max).join('');
const checkCommand = command => /^(?:node\s+--test\b|npm\s+(?:run\s+)?(?:test|check|verify|lint)\b|(?:corepack\s+)?pnpm\s+(?:test|check|verify|lint)\b|git\s+diff\s+--check\b)/i.test(command ?? '');
const isSavedCommand = event => event.tool === 'harness_sense' || event.tool === 'bash';
const isObservedCheck = event => event.tool === 'harness_sense' || event.tool === 'bash' && checkCommand(event.args?.command);
const checkName = event => event.tool === 'harness_sense' ? 'harness_sense ' + JSON.stringify(event.args ?? {}) : event.args?.command;
const immutableResult = result => ({authorSnapshot: result.authorSnapshot, patch: result.patch,
  explanation: result.explanation, commands: result.commands, limitation: result.limitation, usable: result.usable});
export const investigationResultHash = result => digest(JSON.stringify(immutableResult(result)));

export function investigationDeliverySummary(delivery) {
  const patch = typeof delivery.patch === 'string' ? delivery.patch : '';
  const checks = (delivery.commands ?? []).filter(isObservedCheck).slice(-6).map(event => ({
    callID: event.callID, command: short(checkName(event), 160), state: event.state,
    exit: event.exit ?? null, outputExcerpt: Array.from(String(event.output ?? '')).slice(-220).join(''),
  }));
  const paths = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map(match => match[2]);
  const receipt = {
    status: delivery.usable ? 'completed' : delivery.limitation ? 'error' : 'incomplete',
    limitation: short(delivery.limitation, 300) || undefined,
    proposedTestPatch: Boolean(delivery.usable && patch),
    authorSnapshot: delivery.authorSnapshot,
    elapsedMs: delivery.elapsedMs, remainingTaskMs: delivery.remainingTaskMs,
    remainingDiagnosticMs: delivery.remainingDiagnosticMs,
    patch: {sha256: digest(patch), bytes: Buffer.byteLength(patch),
      files: paths.slice(0, 12).map(name => short(name, 180)), omittedFiles: Math.max(0, paths.length - 12)},
    childClaim: short(delivery.explanation, 650) || undefined,
    observedChecks: checks,
    omitted: 'Full patch, child explanation, check list and outputs; use action=inspect with section=patch, explanation, checks or output and nextCursor.',
    decision: 'The patch is not applied. Review the original task and child assertion, then use action=accept with rationale or action=decline. Child checks are historical; run author checks after integration.',
  };
  while (serializedBytes(receipt) > investigationReplyBytes && receipt.observedChecks.length)
    receipt.observedChecks.shift();
  if (serializedBytes(receipt) > investigationReplyBytes) receipt.childClaim = short(receipt.childClaim, 200);
  if (serializedBytes(receipt) > investigationReplyBytes) throw Error('Investigation receipt exceeds native reply bound');
  return receipt;
}

// The cursor is tied to one immutable result and section. Offsets count UTF-8
// bytes; every page ends at a code-point boundary, even for one long line.
export function inspectInvestigation({delivery, artifacts, section, callID, cursor, currentSnapshot}) {
  if (!delivery) return {status: 'no-result', reason: 'No investigation result in this author run'};
  if (!['patch', 'explanation', 'checks', 'output'].includes(section)) return {status: 'unavailable', reason: 'Choose patch, explanation, checks or output'};
  if (section === 'output' && (typeof callID !== 'string' || callID.length > 128))
    return {status: 'unavailable', reason: 'Select a saved child callID from section=checks'};
  const saved = path.join(artifacts, 'investigation-result.json');
  const readSaved = file => {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw Error('Investigation artifact is not a regular private file');
    return fs.readFileSync(file, 'utf8');
  };
  let archive;
  try { archive = JSON.parse(readSaved(saved)); }
  catch { return {status: 'artifact-unavailable', reason: 'Saved investigation result is missing or unreadable'}; }
  const resultHash = investigationResultHash(delivery);
  if (investigationResultHash(archive) !== resultHash)
    return {status: 'artifact-unavailable', reason: 'Saved investigation result differs from this author run'};
  let content, outputEvent;
  if (section === 'patch') {
    if (!delivery.usable || !delivery.patch) return {status: 'no-patch', authorSnapshot: delivery.authorSnapshot};
    try { content = readSaved(path.join(artifacts, 'investigation-tests.patch')); }
    catch { return {status: 'artifact-unavailable', reason: 'Saved test patch is missing or unreadable'}; }
    if (content !== delivery.patch) return {status: 'artifact-unavailable', reason: 'Saved test patch differs from the captured result'};
  } else if (section === 'explanation') content = archive.explanation ?? '';
  else if (section === 'checks') content = JSON.stringify((archive.commands ?? []).filter(isSavedCommand).map(event => ({
    callID: event.callID, command: checkName(event), state: event.state, exit: event.exit ?? null,
    outputBytes: Buffer.byteLength(event.output ?? ''), checkCandidate: isObservedCheck(event),
  })));
  else {
    outputEvent = (archive.commands ?? []).find(item => item.callID === callID && isSavedCommand(item));
    if (!outputEvent) return {status: 'unavailable', reason: 'Select a saved child callID from section=checks'};
    content = String(outputEvent.output ?? '');
  }
  const hash = digest(content), bytes = Buffer.from(content, 'utf8');
  const key = digest(JSON.stringify([resultHash, section, callID ?? null, hash]));
  let offset = 0;
  if (cursor !== undefined) {
    const match = /^([a-f0-9]{64}):(0|[1-9]\d*)$/.exec(String(cursor));
    if (!match || match[1] !== key || !Number.isSafeInteger(Number(match[2]))) return {status: 'invalid-cursor'};
    offset = Number(match[2]);
    if (offset > bytes.length || (offset < bytes.length && (bytes[offset] & 0xc0) === 0x80)) return {status: 'invalid-cursor'};
  }
  let end = Math.min(bytes.length, offset + 1024);
  while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
  if (end === offset && offset < bytes.length) end = Math.min(bytes.length, offset + 4);
  let page = bytes.subarray(offset, end).toString('utf8');
  const lines = page.split('\n');
  if (lines.length > 60) { page = lines.slice(0, 60).join('\n') + '\n'; end = offset + Buffer.byteLength(page); }
  const response = {status: 'page', section, callID: section === 'output' ? callID : undefined,
    authorSnapshot: delivery.authorSnapshot, resultHash, sha256: hash, totalBytes: bytes.length,
    snapshotCurrent: currentSnapshot === undefined ? undefined : currentSnapshot === delivery.authorSnapshot,
    offset, content: page, nextCursor: end < bytes.length ? `${key}:${end}` : null, complete: end === bytes.length,
    check: outputEvent ? {command: short(checkName(outputEvent), 160), state: outputEvent.state, exit: outputEvent.exit ?? null} : undefined,
    provenance: section === 'output' ? 'Saved child output from the investigation snapshot; not a current author check' : undefined};
  if (serializedBytes(response) > investigationReplyBytes) throw Error('Investigation page exceeds native reply bound');
  return response;
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
