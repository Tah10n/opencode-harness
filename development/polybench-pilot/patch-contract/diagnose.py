"""Application-only diagnostics. Never runs authors, tests, scoring, or repairs."""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[3]
DEV = ROOT / 'development/polybench-pilot'
LOCAL = ROOT / 'local/polybench-pilot'
HIST = '9317ccc9e2e3af6cfe7e876acd4541f3e7445f3b'
UPSTREAM = '9c836c5d7f3cb991934132b77d29e6941d912a07'
CASES = [(i, a) for i, arms in [
    ('serverless__serverless-6534', ['P', 'H0', 'H1']),
    ('serverless__serverless-6842', ['H0']),
    ('mui__material-ui-20356', ['P', 'H1']),
    ('sveltejs__svelte-1190', ['P', 'H0', 'H1'])] for a in arms]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + '\n')


def git(*args, cwd=ROOT):
    return subprocess.check_output(['git', *args], cwd=cwd)


def historical(path):
    data = git('show', HIST + ':' + str(path.relative_to(ROOT)))
    assert path.read_bytes() == data, f'Historical input changed: {path}'
    return data


def inventory(patch):
    """Index only ordinary text patch headers; Git remains the application engine."""
    text = patch.decode('utf-8')
    forbidden = ['GIT binary patch', 'Binary files ', 'rename from ', 'rename to ',
                 'copy from ', 'copy to ', 'diff --git "', 'old mode ', 'new mode ']
    assert not any(s in text for s in forbidden), 'Unsupported patch form; no heuristic success'
    files = {}
    current = None
    for line_number, line in enumerate(text.splitlines(), 1):
        if line.startswith('diff --git '):
            match = re.fullmatch(r'diff --git a/([\w./-]+) b/([\w./-]+)', line)
            assert match and match[1] == match[2], 'Unsupported path or rename'
            current = match[1]
            assert '..' not in Path(current).parts and not current.startswith('/')
            files[current] = []
        elif line.startswith('@@ '):
            match = re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@', line)
            assert current and match
            files[current].append({'patch_line': line_number, 'header': line,
                                   'base_start': int(match[1]),
                                   'base_count': int(match[2] or 1)})
    assert files
    return files


def read_files(container, cwd, paths):
    if not paths:
        return {}
    # Tar names come only from validated patch paths or Git's NUL-delimited output.
    result = container.exec_run(['tar', '-c', '-f', '-', '--', *paths], workdir=cwd)
    assert result.exit_code == 0, result.output[-200:]
    with tarfile.open(fileobj=io.BytesIO(result.output)) as archive:
        return {m.name: archive.extractfile(m).read() for m in archive if m.isfile()}


class Observer:
    def __init__(self, container, cwd, evidence):
        self.raw = container
        self.cwd = cwd
        self.evidence = evidence

    def __getattr__(self, name):
        return getattr(self.raw, name)

    def snapshot(self, label):
        diff = self.raw.exec_run(['git', 'diff', '--binary', 'HEAD'], workdir=self.cwd)
        names = self.raw.exec_run(['git', 'diff', '--name-only', '-z', 'HEAD'], workdir=self.cwd)
        others = self.raw.exec_run(['git', 'ls-files', '--others', '--exclude-standard', '-z'], workdir=self.cwd)
        assert diff.exit_code == names.exit_code == others.exit_code == 0
        changed = names.output.decode().split('\0')[:-1]
        untracked = others.output.decode().split('\0')[:-1]
        # Include ignored .orig/.rej too, but never scan dependency trees.
        artifacts = self.raw.exec_run(['find', *sorted(set(str(Path(p).parent) for p in changed) or {'.'}),
                                      '-maxdepth', '1', '-type', 'f', '(', '-name', '*.rej', '-o', '-name', '*.orig', ')'], workdir=self.cwd)
        artifact_paths = sorted(set(artifacts.output.decode().splitlines()))
        contents = read_files(self.raw, self.cwd, artifact_paths)
        snap = {'label': label, 'diff_sha256': sha(diff.output), 'changed_files': changed,
                'untracked': untracked,
                'artifacts': {p: {'sha256': sha(b), 'bytes': len(b),
                                  **({'text': b.decode()} if p.endswith('.rej') else {})}
                              for p, b in contents.items()}}
        self.evidence.setdefault('snapshots', []).append(snap)
        return snap

    def exec_run(self, *args, **kwargs):
        started = time.monotonic()
        result = self.raw.exec_run(*args, **kwargs)
        command = kwargs.get('cmd', args[0] if args else None)
        self.evidence.setdefault('commands', []).append({
            'cmd': command, 'cwd': kwargs.get('workdir'), 'user': kwargs.get('user'),
            'exit_code': result.exit_code, 'output': result.output.decode(errors='replace'),
            'seconds': round(time.monotonic() - started, 4)})
        if isinstance(command, str) and command.startswith(('git apply ', 'patch ')):
            self.snapshot('after ' + command.split()[0])
        return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    start = time.monotonic()
    evaluator = LOCAL / 'patch-contract-sources/evaluator'
    assert git('rev-parse', 'HEAD', cwd=evaluator).decode().strip() == UPSTREAM
    assert not git('status', '--porcelain', '--untracked-files=no', cwd=evaluator)
    sys.path.insert(0, str(evaluator / 'src'))
    import docker
    from poly_bench_evaluation.docker_utils import DockerManager

    class ObservedManager(DockerManager):
        def _get_workdir_from_image(self):
            return '/testbed'

        def _cleanup(self):
            if self.container:
                self.container.snapshot('immediately before upstream cleanup')
            super()._cleanup()

    manifest = json.loads(historical(DEV / 'frozen-manifest.json'))
    frozen = {r['instance_id']: r for r in manifest['tasks']}
    inputs = {}
    guard_paths = [DEV / f for f in ['REPORT.md', 'README.md', 'PLAN.md', 'frozen-manifest.json',
                                    'evaluate.py', 'evaluate_predictions.py', 'results.py', 'collect.py']]
    guard_paths += [DEV / 'results' / f for f in ['accounting.json', 'validation.json']]
    guard_paths += [LOCAL / 'batch' / f for f in ['freeze.json', 'outcome.json', 'scheduling-paused.json', 'freeze-commit.json']]
    rows = {}
    csv.field_size_limit(10000000)
    for instance in sorted({i for i, _ in CASES}):
        path = LOCAL / (instance + '.csv')
        data = path.read_bytes()
        assert sha(data) == frozen[instance]['originalRowCsvSha256']
        with path.open(newline='') as stream:
            row = next(csv.DictReader(stream))
        assert row['base_commit'] == frozen[instance]['base_commit']
        rows[instance] = row
        guard_paths.append(path)
    for arm in ['P', 'H0', 'H1']:
        guard_paths += [DEV / 'results/predictions' / (arm + '.jsonl')]
        guard_paths += [DEV / 'results/official' / arm / f for f in ['provenance.json', 'strict-application.jsonl']]
    for instance, arm in CASES:
        guard_paths += [DEV / 'results/patches' / arm / (instance + '.patch'),
                        DEV / 'results/official' / arm / (instance + '_result.json')]
    # Some historical publication layouts include an intermediate results/ directory.
    guard_paths = [p if p.exists() else p.parent / 'results' / p.name for p in guard_paths]
    for path in guard_paths:
        data = historical(path) if path.is_relative_to(DEV) else path.read_bytes()
        inputs[str(path.relative_to(ROOT))] = sha(data)
    write(out / 'input-hashes.json', inputs)
    client = docker.DockerClient(base_url=os.environ.get('DOCKER_HOST', 'unix://' + str(Path.home() / '.docker/run/docker.sock')), timeout=120)
    created = []
    summary = {'historical_commit': HIST, 'evaluator': UPSTREAM,
               'dataset_revision': manifest['datasetRevision'], 'cases': [],
               'provider_calls': 0, 'test_runs': 0, 'scoring_runs': 0}
    try:
        for instance, arm in CASES:
            tick = time.monotonic()
            task = frozen[instance]
            image = task['officialImage']
            inspected = client.images.get(image['digest'])  # No implicit pull or latest fallback.
            assert inspected.id == image['id'] and inspected.attrs['Architecture'] == image['architecture']
            assert inspected.attrs['Config']['WorkingDir'] == '/testbed'
            provenance = json.loads((DEV / 'results/official' / arm / 'provenance.json').read_bytes())
            assert any(x == image for x in provenance['images'].values())
            assert not provenance['prepared_dependencies']
            patch_path = DEV / 'results/patches' / arm / (instance + '.patch')
            model = patch_path.read_bytes()
            prediction = [r for r in map(json.loads, (DEV / 'results/predictions' / (arm + '.jsonl')).read_bytes().splitlines()) if r['instance_id'] == instance]
            assert len(prediction) == 1 and prediction[0]['model_patch'].encode('utf-8') == model
            test = rows[instance]['test_patch'].encode('utf-8')
            mfiles, tfiles = inventory(model), inventory(test)
            historical_strict = list(map(json.loads, (DEV / 'results/official' / arm / 'strict-application.jsonl').read_bytes().splitlines()))
            assert any(r['patch_sha256'] == sha(model) and r['patch_type'] == 'code' and r['strict_exit_code'] != 0 for r in historical_strict)
            assert any(r['patch_sha256'] == sha(test) and r['patch_type'] == 'test' and r['strict_exit_code'] == 0 for r in historical_strict)
            record = {'instance_id': instance, 'arm': arm, 'base_commit': task['base_commit'],
                      'image': image, 'source_patch': str(patch_path.relative_to(ROOT)),
                      'model_sha256': sha(model), 'test_sha256': sha(test), 'prediction_bytes_equal': True,
                      'final_newline': model.endswith(b'\n'), 'cr_bytes': model.count(b'\r'),
                      'model_hunks': mfiles, 'test_hunks': tfiles, 'scenarios': {}}
            case_dir = out / (instance + '-' + arm)
            overlap = sorted(set(mfiles) & set(tfiles))
            for scenario in ['B+M', 'B+T+strict-M', 'official-B+T+M']:
                evidence = record['scenarios'][scenario] = {}
                name = 'polybench-patch-contract-' + uuid.uuid4().hex
                container = client.containers.create(image=image['digest'], detach=True, tty=True,
                    working_dir='/testbed', name=name, command='tail -f /dev/null', network_mode='none',
                    cap_drop=['ALL'], security_opt=['no-new-privileges'], pids_limit=1024,
                    mem_limit='8g', nano_cpus=4_000_000_000, platform='linux/amd64',
                    labels={'opencode-harness.diagnostic': 'patch-contract'})
                created.append(container.id)
                container.start()
                manager = ObservedManager(image['digest'], False, client)
                observer = Observer(container, '/testbed', evidence)
                manager.container = observer
                try:
                    head = observer.exec_run(['git', 'rev-parse', 'HEAD'], workdir='/testbed')
                    assert head.exit_code == 0 and head.output.decode().strip() == task['base_commit']
                    tracked = observer.exec_run(['git', 'diff', '--exit-code', 'HEAD'], workdir='/testbed')
                    evidence['image_baseline_diff_sha256'] = sha(tracked.output)
                    dirty = observer.exec_run(['git', 'diff', '--name-only', 'HEAD'], workdir='/testbed').output.decode().splitlines()
                    evidence['image_baseline_changed_files'] = dirty
                    assert not set(dirty) & (set(mfiles) | set(tfiles)), 'Image drift touches a patch path'
                    if scenario != 'official-B+T+M' and dirty:
                        restored = observer.exec_run(['git', 'restore', '--source=HEAD', '--staged', '--worktree', '--', *dirty], workdir='/testbed')
                        assert restored.exit_code == 0
                    evidence['baseline_policy'] = 'original image without reset' if scenario == 'official-B+T+M' else 'exact tracked B; baked unrelated build edits restored before any patch'
                    for command in [['git', '--version'], ['patch', '--version']]:
                        observer.exec_run(command, workdir='/testbed')
                    observer.snapshot('B')
                    if scenario == 'B+M':
                        for p, data in read_files(container, '/testbed', overlap).items():
                            dest = case_dir / 'trees/B' / p; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data)
                    for content, kind in [(model, 'code'), (test, 'test')]:
                        assert manager.copy_file_to_container(content.decode('utf-8'), 'patch_' + kind + '.diff', '/testbed')
                        # Verify actual in-container input bytes, including terminal newline.
                        actual = read_files(container, '/testbed', ['patch_' + kind + '.diff'])
                        assert actual['patch_' + kind + '.diff'] == content
                    def strict(kind, apply=False):
                        cmd = ['git', 'apply', '--binary']
                        if not apply: cmd.append('--check')
                        cmd.append('/testbed/patch_' + kind + '.diff')
                        return observer.exec_run(cmd, workdir='/testbed').exit_code
                    if scenario == 'B+M':
                        evidence['strict_M'] = strict('code')
                        assert evidence['strict_M'] == 0
                        assert strict('code', True) == 0
                        observer.snapshot('after strict M')
                        tree = 'M'
                    elif scenario == 'B+T+strict-M':
                        evidence['strict_T'] = strict('test')
                        assert evidence['strict_T'] == 0
                        assert strict('test', True) == 0
                        observer.snapshot('after strict T')
                        evidence['strict_M_after_T'] = strict('code')
                        tree = 'T'
                    else:
                        evidence['official_T'] = manager.apply_patch_to_container(test.decode('utf-8'), 'test')
                        observer.snapshot('before official M')
                        try:
                            evidence['official_M'] = manager.apply_patch_to_container(model.decode('utf-8'), 'code')
                        except ValueError as error:
                            evidence['official_M'] = 'exception: ' + str(error)
                        tree = None
                    if tree:
                        for p, data in read_files(container, '/testbed', overlap).items():
                            dest = case_dir / 'trees' / tree / p; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data)
                finally:
                    if manager.container:
                        manager._cleanup(); manager.container = None
                    write(case_dir / (scenario + '.json'), evidence)
            record['elapsed_seconds'] = round(time.monotonic() - tick, 3)
            write(case_dir / 'case.json', record)
            summary['cases'].append(record)
            print(instance, arm, record['scenarios']['official-B+T+M'].get('official_M'), flush=True)
    finally:
        for cid in created:
            try:
                container = client.containers.get(cid)
                container.stop(timeout=1); container.remove()
            except docker.errors.NotFound:
                pass
        summary['containers_created'] = len(created)
        summary['containers_remaining'] = [c.id for c in client.containers.list(all=True) if c.id in created]
        summary['elapsed_seconds'] = round(time.monotonic() - start, 3)
        summary['inputs_unchanged'] = all(sha((ROOT / p).read_bytes()) == digest for p, digest in inputs.items())
        write(out / 'summary.json', summary)
        client.close()
    assert len(summary['cases']) == 9 and summary['inputs_unchanged'] and not summary['containers_remaining']


if __name__ == '__main__':
    main()
