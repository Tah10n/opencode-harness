#!/usr/bin/env python3
"""One saved case, unchanged full patches, pinned offline runtime; no model calls.
Pull IMAGE explicitly first. Writes JSON to stdout; temporary files/containers
are removed on success and failure. Does not remove a shared/pulled image.
"""
import hashlib
import json
import pathlib
import subprocess
import tempfile
import uuid

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CAMPAIGN = ROOT / 'evaluation/polybench/campaigns/consolidated-remaining-v1'
BASE = '56aa5aa15abed64db6758aecd8c27719928b5a14'
IMAGE = ('ghcr.io/timesler/swe-polybench.eval.x86_64.serverless__serverless-8159'
         '@sha256:2dd61c66aa6d749677ce6e323e803cdc161305b6b3907b31c576e3cf2716006a')
TASK = 'serverless__serverless-8159'
commands = []

def run(argv, **kwargs):
    completed = subprocess.run(argv, check=True, capture_output=True, timeout=180, **kwargs)
    commands.append({'argv': argv, 'cwd': str(kwargs.get('cwd', pathlib.Path.cwd())),
                     'exit': completed.returncode})
    return completed.stdout

def container(args, mounts=()):
    name = 'serverless-8159-diagnostic-' + uuid.uuid4().hex[:12]
    argv = ['docker', 'run', '--rm', '--name', name, '--platform', 'linux/amd64',
            '--network', 'none', '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--pids-limit', '128',
            '--memory', '2g', '--cpus', '2', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m',
            '--env', 'HOME=/tmp', '--env', 'SLS_TELEMETRY_DISABLED=1']
    for source, target in mounts:
        argv += ['--mount', f'type=bind,source={source},target={target},readonly']
    argv += ['--entrypoint', args[0], IMAGE, *args[1:]]
    try:
        return run(argv)
    finally:
        # A timeout may leave docker's daemon-side container alive.
        found = subprocess.run(['docker', 'container', 'inspect', name], capture_output=True)
        if found.returncode == 0:
            subprocess.run(['docker', 'rm', '-f', name], check=True, capture_output=True)

sha = lambda b: hashlib.sha256(b).hexdigest()
public = json.loads((CAMPAIGN / 'results.json').read_text())
# The public schema stores slot records under slots.
records = public['slots']
patches = {}
for arm in 'PCT':
    pred = next(json.loads(line) for line in (CAMPAIGN / f'predictions/{arm}.jsonl')
                .read_text().splitlines() if json.loads(line)['instance_id'] == TASK)
    patch = pred['model_patch'].encode()
    record = next(row for row in records if row['instance_id'] == TASK and row['arm'] == arm)
    assert sha(patch) == record['patch_sha256']
    patches[arm] = patch
paths = sorted({line[6:] for patch in patches.values()
                for line in patch.decode().splitlines() if line.startswith('+++ b/')})
assert all(not p.startswith('/') and '..' not in pathlib.PurePosixPath(p).parts for p in paths)
assert container(['git', 'rev-parse', 'HEAD']).decode().strip() == BASE
result = {'kind': 'new-model-free-diagnostic-not-official-evaluation', 'base': BASE,
          'image': IMAGE, 'node': container(['node', '--version']).decode().strip(),
          'patch_sha256': {a: sha(p) for a, p in patches.items()},
          'scenario_sha256': sha((HERE / 'scenario.cjs').read_bytes()),
          'runner_sha256': sha(pathlib.Path(__file__).read_bytes()), 'variants': []}
assert result['node'] == 'v16.20.2'
with tempfile.TemporaryDirectory(prefix='serverless-8159-diagnostic-') as temp:
    directory = pathlib.Path(temp)
    original = {p: container(['git', 'show', BASE + ':' + p]) for p in paths}
    result['base_file_sha256'] = {p: sha(b) for p, b in original.items()}
    for arm in ['baseline', 'P', 'C', 'T']:
        variant = directory / arm
        variant.mkdir()
        for p, data in original.items():
            target = variant / p
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        if arm in patches:
            patchfile = directory / (arm + '.patch')
            patchfile.write_bytes(patches[arm])
            run(['git', 'apply', '--check', str(patchfile)], cwd=variant)
            run(['git', 'apply', str(patchfile)], cwd=variant)
        mounts = [(variant / p, '/testbed/' + p) for p in paths]
        mounts.append((HERE / 'scenario.cjs', '/diagnostic.cjs'))
        observed = json.loads(container(['node', '/diagnostic.cjs', arm], mounts))
        observed['applied_file_sha256'] = {p: sha((variant / p).read_bytes()) for p in paths}
        result['variants'].append(observed)
    # Replace temporary host prefixes in the public command receipt only.
    result['commands'] = json.loads(json.dumps(commands).replace(str(directory), '<temporary>')
                                    .replace(str(HERE), '<diagnostic>')
                                    .replace(str(ROOT), '<repository>'))
print(json.dumps(result, indent=2))
