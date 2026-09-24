"""Offline, after-run assessment of the two unchanged captured Git patches."""
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEV = ROOT / 'development/investigation-direct-ledger-pair'
OLD = ROOT / 'development/plain-ledger-native-high'
LOCAL = ROOT / 'local/investigation-direct-ledger-pair'
OUT = LOCAL / 'assessment'
BASE = ROOT / 'local/plain-ledger-native-high/baseline.tar'
PRIVACY = ROOT / 'development/ledger-review-delivery/persisted-privacy-check/claude-persisted-privacy.test.mjs'
MANIFEST = json.loads((DEV / 'manifest.json').read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def inventory(root):
    files = {}
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if '.git' in relative.parts:
            continue
        if path.is_symlink():
            files[str(relative)] = {'link': str(path.readlink())}
        elif path.is_file():
            files[str(relative)] = {'sha256': sha(path), 'executable': bool(path.stat().st_mode & 0o111)}
    return files

def command(folder, name, argv, cwd=None, timeout=180):
    try:
        result = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        data = {'argv': argv, 'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    except subprocess.TimeoutExpired as error:
        data = {'argv': argv, 'exitCode': None, 'error': 'evaluation timeout',
                'stdout': (error.stdout or b'').decode(errors='replace'),
                'stderr': (error.stderr or b'').decode(errors='replace')}
    receipt = folder / (name + '.json')
    receipt.write_text(json.dumps(data, indent=2) + '\n')
    counts = {}
    for key in ('tests', 'pass', 'fail', 'skipped'):
        values = re.findall(r'(?:ℹ|#) ' + key + r' (\d+)', data['stdout'])
        counts[key] = sum(map(int, values)) if values else None
    return {'exitCode': data['exitCode'], 'counts': counts, 'receipt': str(receipt.relative_to(ROOT)),
            'sha256': sha(receipt)}

def docker(source, probes=False):
    argv = ['docker', 'run', '--rm', '--init', '--network', 'none', '--read-only',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', 'node',
            '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
            '--tmpfs', '/work:rw,exec,nosuid,uid=1000,gid=1000,mode=0700,size=512m',
            '-e', 'TMPDIR=/work', '-e', 'HOME=/work', '-e', 'COREPACK_ENABLE_NETWORK=0',
            '--mount', f'type=bind,source={source},target=/workspace,readonly']
    if probes:
        argv += ['--mount', f'type=bind,source={OLD},target=/probes,readonly',
                 '--mount', f'type=bind,source={ROOT / "local/plain-ledger-native-high/baseline"},target=/baseline,readonly']
    return argv + ['--workdir', '/workspace', MANIFEST_IMAGE]

assert sha(LOCAL / 'batch/freeze.json') == MANIFEST['freezeSha256']
assert sha(BASE) == 'ea549fcc30d8facef77af8ebebc280910a24537e44ad8c6cfcbdc4888b5dcab1'
assert sha(PRIVACY) == MANIFEST['privacyTestSha256']
MANIFEST_IMAGE = json.loads((LOCAL / 'batch/freeze.json').read_text())['image']
assert MANIFEST_IMAGE == 'sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6'
OUT.mkdir(mode=0o700, exist_ok=False)
results = {}
for arm in ('I0', 'I1'):
    folder = OUT / arm
    folder.mkdir(mode=0o700)
    patch = LOCAL / 'batch/runs' / f'account-switch-ledger-{arm}' / 'model.patch'
    assert patch.is_file()
    f = folder / 'F'
    f.mkdir()
    subprocess.run(['tar', '-xf', str(BASE), '-C', str(f)], check=True)
    assert inventory(f) == inventory(ROOT / 'local/plain-ledger-native-high/baseline')
    for args in (['init', '-q'], ['add', '-A'], ['-c', 'core.hooksPath=/dev/null',
                 '-c', 'user.name=Evaluation', '-c', 'user.email=evaluation@localhost',
                 'commit', '-qm', 'Exact historical baseline']):
        subprocess.run(['git', *args], cwd=f, check=True, capture_output=True)
    applied = command(folder, 'apply', ['git', 'apply', '--index', '--allow-empty', str(patch)], cwd=f)
    summary = {'arm': arm, 'patchSha256': sha(patch), 'patchBytes': patch.stat().st_size,
               'delivery_apply': applied['exitCode'] == 0, 'apply': applied,
               'assessment_integrity': 'unknown', 'F': {}, 'E': {}}
    if summary['delivery_apply']:
        before = inventory(f)
        e = folder / 'E'
        shutil.copytree(f, e, ignore=shutil.ignore_patterns('.git'), symlinks=True)
        assert inventory(e) == before
        for suite in ('readers', 'config', 'protocol'):
            summary['F'][suite] = command(folder, 'F-' + suite, docker(f) +
                                          ['node', '--test', f'packages/connector/test/{suite}.test.mjs'])
        summary['projectVerify'] = command(folder, 'F-project-verify', docker(f) +
                                           ['bash', '-lc', 'cp -a /workspace /work/repo && cd /work/repo && corepack pnpm verify'])
        for probe in ('account-switch-ledger', 'ledger-lifecycle', 'legacy-input',
                      'kimi-migration', 'migration-contract', 'cli-persistence'):
            summary['E'][probe] = command(folder, 'E-' + probe, docker(e, True) +
                                          ['node', '--test', '/probes/' + probe + '.test.mjs'])
        assert inventory(f) == inventory(e) == before
        privacy = folder / 'privacy'
        shutil.copytree(f, privacy, ignore=shutil.ignore_patterns('.git'), symlinks=True)
        target = privacy / 'packages/connector/test/ledger-eval-claude-privacy-9a98.test.mjs'
        assert not target.exists()
        shutil.copyfile(PRIVACY, target)
        assert sha(target) == MANIFEST['privacyTestSha256']
        summary['privacy'] = command(folder, 'privacy', docker(privacy) +
                                     ['node', '--test', 'packages/connector/test/ledger-eval-claude-privacy-9a98.test.mjs'])
        assert inventory(f) == inventory(e) == before
        copy_without_test = inventory(privacy)
        del copy_without_test['packages/connector/test/ledger-eval-claude-privacy-9a98.test.mjs']
        assert copy_without_test == before
        summary['assessment_integrity'] = 'verified'
        summary['implementationTreeSha256'] = hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()
        summary['behavioralCounts'] = {key: sum(value['counts'][key] or 0 for value in summary['E'].values())
                                       for key in ('tests', 'pass', 'fail', 'skipped')}
    results[arm] = summary
    (folder / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({'arm': arm, 'delivery_apply': summary['delivery_apply'],
                      'integrity': summary['assessment_integrity'],
                      'F': {key: val['counts'] for key, val in summary['F'].items()},
                      'E': summary.get('behavioralCounts'),
                      'privacy': summary.get('privacy', {}).get('counts')}), flush=True)
(OUT / 'summary.json').write_text(json.dumps(results, indent=2) + '\n')
