"""Apply the untouched M, then execute the predeclared F/E checks offline."""
import hashlib
import json
import re
import shutil
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEV = ROOT / 'development/plain-ledger-native-high'
DELIVERY = ROOT / 'development/ledger-review-delivery'
LOCAL = ROOT / 'local/ledger-review-delivery'
label = sys.argv[1]
assert label in ['D0', 'final']
patch = Path(sys.argv[2]).resolve()
OUT = LOCAL / ('evaluation-' + label)
IMAGE = json.loads((DELIVERY / 'manifest.json').read_text())['image']

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def command(name, argv, cwd=None, timeout=180):
    try:
        r = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        data = dict(argv=argv, exitCode=r.returncode, stdout=r.stdout, stderr=r.stderr)
    except subprocess.TimeoutExpired as e:
        data = dict(argv=argv, exitCode=None, error='evaluation timeout',
                    stdout=(e.stdout or b'').decode(errors='replace'), stderr=(e.stderr or b'').decode(errors='replace'))
    p = OUT / (name + '.json')
    p.write_text(json.dumps(data, indent=2) + '\n')
    counts = {}
    for key in ['tests', 'pass', 'fail', 'skipped']:
        values = re.findall(r'(?:ℹ|#) ' + key + r' (\d+)', data['stdout'])
        counts[key] = sum(map(int, values)) if values else None
    return dict(file=str(p.relative_to(ROOT)), sha256=sha(p), exitCode=data['exitCode'], counts=counts)

def tree(root):
    result = {}
    for p in sorted(root.rglob('*')):
        relative = p.relative_to(root)
        if '.git' in relative.parts:
            continue
        if p.is_symlink():
            result[str(relative)] = {'link': str(p.readlink())}
        elif p.is_file():
            result[str(relative)] = {'sha256': sha(p), 'executable': bool(p.stat().st_mode & 0o111)}
    return result

def docker(source, evaluator=False):
    argv = ['docker', 'run', '--rm', '--init', '--network', 'none', '--read-only',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', 'node',
            '--memory', '3g', '--pids-limit', '256', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
            '--tmpfs', '/work:rw,exec,nosuid,uid=1000,gid=1000,mode=0700,size=512m',
            '-e', 'TMPDIR=/work', '-e', 'HOME=/work', '-e', 'COREPACK_ENABLE_NETWORK=0',
            '--mount', f'type=bind,source={source},target=/workspace,readonly']
    if evaluator:
        argv += ['--mount', f'type=bind,source={DEV},target=/probes,readonly',
                 '--mount', f'type=bind,source={DELIVERY},target=/delivery,readonly',
                 '--mount', f'type=bind,source={LOCAL / "baseline"},target=/baseline,readonly']
    return argv + ['--workdir', '/workspace', IMAGE]

OUT.mkdir(mode=0o700)
assert patch.is_file()
manifest = json.loads((DELIVERY / 'manifest.json').read_text())
for p, expected in manifest['files'].items():
    assert sha(ROOT / p) == expected, p
F = OUT / 'F'
F.mkdir()
subprocess.run(['tar', '-xf', str(ROOT / 'local/plain-ledger-native-high/baseline.tar'), '-C', str(F)], check=True)
assert tree(F) == tree(LOCAL / 'baseline')
for args in [['init', '-q'], ['add', '-A'], ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Evaluation',
        '-c', 'user.email=evaluation@localhost', 'commit', '-qm', 'Exact historical baseline']]:
    subprocess.run(['git', *args], cwd=F, check=True, capture_output=True)
apply = command('apply', ['git', 'apply', '--index', '--allow-empty', str(patch)], cwd=F)
summary = {'patchSha256': sha(patch), 'delivery_apply': apply['exitCode'] == 0,
           'applyReceipt': apply, 'assessment_integrity': 'unknown', 'F': [], 'E': []}
if summary['delivery_apply']:
    before = tree(F)
    E = OUT / 'E'
    shutil.copytree(F, E, ignore=shutil.ignore_patterns('.git'), symlinks=True)
    assert tree(E) == before
    for suite in ['readers', 'config', 'protocol']:
        summary['F'].append(command('F-' + suite, docker(F) + ['node', '--test', f'packages/connector/test/{suite}.test.mjs']))
    summary['projectVerify'] = command('F-project-verify', docker(F) + ['bash', '-lc',
        'cp -a /workspace /work/repo && cd /work/repo && corepack pnpm verify'])
    probes = ['account-switch-ledger', 'ledger-lifecycle', 'legacy-input', 'kimi-migration', 'migration-contract', 'cli-persistence']
    for probe in probes:
        summary['E'].append(command('E-' + probe, docker(E, True) + ['node', '--test', '/probes/' + probe + '.test.mjs']))
    summary['supplemental'] = command('E-supplemental', docker(E, True) + ['node', '/delivery/supplemental.mjs'])
    assert tree(F) == tree(E) == before
    summary['assessment_integrity'] = 'verified'
    summary['implementationTreeSha256'] = hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()
    summary['unchangedImplementationCopies'] = True
    summary['baselineInputSha256'] = sha(ROOT / 'local/plain-ledger-native-high/baseline.tar')
    summary['Q'] = None  # Requires the separately recorded preservation review.
    summary['contractTests'] = {key: sum(r['counts'][key] or 0 for r in summary['E']) for key in ['tests', 'pass', 'fail', 'skipped']}
    summary['completeBehavioralInventory'] = summary['contractTests']['tests'] == 23
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({k: v for k, v in summary.items() if k not in ['F', 'E', 'applyReceipt']}))
