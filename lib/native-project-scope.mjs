// Shared filesystem/configuration discovery. No AST, evaluator or command runner.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const sourcePath = name => /\.[cm]?[jt]sx?$/.test(name);
export const testPath = name => /(?:^|\/)(?:test|tests|spec|specs|__tests__)\/|(?:[._-](?:test|spec)|^test)\.[cm]?[jt]sx?$/.test(name);
const matches = (value, pattern) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', process.platform === 'win32' ? 'is' : 's').test(value);
export function projectScope(directory, rules, {maxFiles = 1500, maxBytes = 8 * 1024 * 1024, allFiles = false} = {}) {
  const root = fs.realpathSync(directory), limits = [];
  const relative = input => {
    const name = path.relative(root, path.resolve(root, input)).split(path.sep).join('/');
    if (name === '..' || name.startsWith('../') || path.isAbsolute(name)) throw Error('Path is outside the project');
    return name || '.';
  };
  const allowed = name => {
    if (!Array.isArray(rules)) return false;
    for (const value of [name, path.join(root, name)]) {
      let action = 'ask';
      for (const rule of rules) if (['read', '*'].includes(rule.permission) && matches(value, rule.pattern)) action = rule.action;
      if (action !== 'allow') return false;
    }
    let cursor = root;
    for (const part of name.split('/')) {
      cursor = path.join(cursor, part);
      try { if (fs.lstatSync(cursor).isSymbolicLink()) return false; } catch { return false; }
    }
    return true;
  };
  const git = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024});
  if (git.status !== 0) throw Error('Project enumeration unavailable: ' + (git.error?.code ?? git.status));
  const names = [...new Set(git.stdout.split('\0').filter(Boolean))].sort();
  const files = new Map(); let bytes = 0, omitted = 0;
  for (const name of names) {
    if (!allFiles && !sourcePath(name) && !/(?:^|\/)(?:package\.json|(?:ts|js)config[^/]*\.json|.*lock.*|AGENTS\.md|WORKFLOW\.md)$/.test(name)) continue;
    if (relative(name) !== name || !allowed(name)) { omitted++; continue; }
    const stat = fs.statSync(path.join(root, name));
    if (!stat.isFile() || stat.size > 512 * 1024 || files.size >= maxFiles || bytes + stat.size > maxBytes) { omitted++; continue; }
    const text = fs.readFileSync(path.join(root, name), 'utf8'); bytes += stat.size; files.set(name, text);
  }
  if (omitted) limits.push(`${omitted} source/config paths omitted by permissions, symlink, size or enumeration bounds; analysis is incomplete.`);
  const hash = digest(JSON.stringify([...files]));
  const packages = [...files].filter(([name]) => path.basename(name) === 'package.json').flatMap(([name, text]) => {
    try { return [{file: name, directory: path.posix.dirname(name), value: JSON.parse(text)}]; }
    catch { limits.push('Invalid package configuration: ' + name); return []; }
  });
  const packageFor = name => packages.filter(p => p.directory === '.' || name === p.directory || name.startsWith(p.directory + '/'))
    .sort((a, b) => b.directory.length - a.directory.length)[0];
  return {root, files, packages, packageFor, relative, hash, bytes, limits, omitted};
}

export const quoteShell = value => "'" + value.replaceAll("'", "'\\''") + "'";
