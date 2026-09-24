"""Bounded post-hoc preparation; imports original PolyBench parser/scoring only."""
import argparse
import ast
from contextlib import contextmanager
from dataclasses import asdict
import fnmatch
import hashlib
import importlib
import io
import json
import os
import re
import shlex
from pathlib import Path
import subprocess
import sys
import tarfile
import time
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DEV = HERE.parent
LOCAL = ROOT / 'local/polybench-pilot'
UPSTREAM = '9c836c5d7f3cb991934132b77d29e6941d912a07'
HIST = '9317ccc9e2e3af6cfe7e876acd4541f3e7445f3b'
IDS = ['serverless__serverless-6534', 'sveltejs__svelte-1190']
ARMS = ['P', 'H0', 'H1']
EVALUATOR = LOCAL / 'patch-contract-sources/evaluator'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def packed(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


def git(*args, cwd=ROOT):
    return subprocess.check_output(['git', *args], cwd=cwd)


def inputs():
    import csv
    csv.field_size_limit(10000000)
    assert git('rev-parse', 'HEAD', cwd=EVALUATOR).decode().strip() == UPSTREAM
    assert not git('status', '--porcelain', '--untracked-files=no', cwd=EVALUATOR)
    manifest = json.loads((DEV / 'frozen-manifest.json').read_bytes())
    assert manifest['datasetRevision'] == 'b3fca77b637379f0c01ad86d18753a7ac1998b53'
    tasks = {x['instance_id']: x for x in manifest['tasks'] if x['instance_id'] in IDS}
    for i, task in tasks.items():
        path = LOCAL / (i + '.csv')
        assert sha(path.read_bytes()) == task['originalRowCsvSha256']
        with path.open(newline='') as f:
            task['row'] = next(csv.DictReader(f))
        assert task['row']['base_commit'] == task['base_commit']
    return tasks


def guard():
    paths = list((DEV / 'results').rglob('*'))
    paths += [DEV / n for n in ['frozen-manifest.json', 'REPORT.md', 'evaluate.py', 'run.mjs']]
    paths += [LOCAL / 'batch' / n for n in ['freeze.json', 'outcome.json', 'scheduling-paused.json', 'freeze-commit.json']]
    return {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in paths if p.is_file()}


def patch_paths(data):
    # Same bounded text forms as the previous diagnosis; no generic classifier.
    sys.path.insert(0, str(DEV / 'patch-contract'))
    from diagnose import inventory
    return list(inventory(data)) if data else []


def archive_entries(data):
    with tarfile.open(fileobj=io.BytesIO(data)) as ar:
        return {m.name: {'mode': m.mode, 'kind': 'file' if m.isfile() else 'symlink',
                         'sha256': sha(ar.extractfile(m).read()) if m.isfile() else sha(m.linkname.encode())}
                for m in ar if not m.isdir() and m.name != 'pax_global_header'}


def parse_snapshot(stdout, stderr, exit_code, paths):
    """Keep binary tar and diagnostic text separate; only declared absence is valid."""
    entries = archive_entries(stdout)
    missing = set(paths) - set(entries)
    diagnostics = (stderr or b'').decode().splitlines()
    permitted = {'tar: ' + p + ': Cannot stat: No such file or directory' for p in missing}
    permitted.add('tar: Exiting with failure status due to previous errors')
    assert exit_code in [0, 2], 'snapshot tar failed: ' + repr(diagnostics)
    assert all(line in permitted for line in diagnostics), 'unexpected tar diagnostic: ' + repr(diagnostics)
    if missing:
        assert exit_code == 2
        assert {'tar: ' + p + ': Cannot stat: No such file or directory' for p in missing} <= set(diagnostics), 'truncated source inventory'
    else:
        assert exit_code == 0 and not diagnostics, 'snapshot command failed'
    return entries


def subset_tar(data, paths):
    out = io.BytesIO()
    with tarfile.open(fileobj=io.BytesIO(data)) as src, tarfile.open(fileobj=out, mode='w') as dest:
        for m in src:
            if m.name in paths:
                dest.addfile(m, src.extractfile(m) if m.isfile() else None)
    return out.getvalue()


def in_surface(path, manifest):
    return path in manifest['files'] or any(path.startswith(p) for p in manifest['directories'])


def check_boundary(full, assessment, manifest):
    bad = [p for p in full.keys() | assessment.keys()
           if not in_surface(p, manifest) and full.get(p) != assessment.get(p)]
    if bad:
        raise RuntimeError('production/outside-surface rollback: ' + repr(bad[:10]))
    return {'outside_surface_equal': True, 'compared_paths': len(full.keys() | assessment.keys()),
            'differences': sorted(p for p in full.keys() | assessment.keys() if full.get(p) != assessment.get(p))}


def validate_target(actual, expected):
    if actual != expected or not actual.startswith('/testbed/'):
        raise RuntimeError('invalid import target: ' + actual)


class Runner:
    def __init__(self, out):
        import docker
        self.client = docker.DockerClient(base_url=os.environ.get('DOCKER_HOST', 'unix://' + str(Path.home() / '.docker/run/docker.sock')), timeout=1500)
        self.out = out
        self.created = []
        self.removed = []
        self.commands = []

    @contextmanager
    def container(self, task):
        image = task['officialImage']
        found = self.client.images.get(image['digest'])
        assert found.id == image['id'] and found.attrs['Architecture'] == 'amd64'
        c = self.client.containers.create(image=image['digest'], command='tail -f /dev/null',
            working_dir='/testbed', name='polybench-two-world-' + uuid.uuid4().hex,
            network_mode='none', cap_drop=['ALL'], security_opt=['no-new-privileges'],
            mem_limit='8g', nano_cpus=4000000000, pids_limit=1024, platform='linux/amd64',
            labels={'opencode-harness.diagnostic': 'two-world'})
        self.created.append(c.id)
        try:
            c.start()
            yield c
        finally:
            c.remove(force=True)
            self.removed.append(c.id)

    def cmd(self, c, command, check=True):
        r = c.exec_run(command, workdir='/testbed')
        if check and r.exit_code != 0:
            raise RuntimeError(f'{command!r}: exit {r.exit_code}: {r.output[-2000:]!r}')
        return r

    def put(self, c, name, data, mode=0o644):
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode='w') as ar:
            m = tarfile.TarInfo(name); m.size = len(data); m.mode = mode
            ar.addfile(m, io.BytesIO(data))
        assert c.put_archive('/', buf.getvalue())

    def baseline(self, c, task):
        assert self.cmd(c, ['git', 'rev-parse', 'HEAD']).output.decode().strip() == task['base_commit']
        dirty = self.cmd(c, ['git', 'diff', '--name-only', 'HEAD']).output.decode().splitlines()
        expected = ['Dockerfile'] if task['instance_id'].startswith('serverless') else ['package.json', 'yarn.lock']
        assert sorted(dirty) == sorted(expected)
        overlay = self.cmd(c, ['tar', '-cf', '-', '--', *dirty]).output
        self.cmd(c, ['git', 'reset', '--hard', task['base_commit']])
        # Only known image build artifact, outside source B; never a host deletion.
        if task['instance_id'].startswith('svelte'):
            self.cmd(c, ['rm', '-f', '/testbed/Dockerfile'])
        if task.get('mui_plain_preparation'):
            untracked = self.cmd(c, ['git', 'ls-files', '--others', '--exclude-standard']).output.decode().splitlines()
            assert sorted(untracked) == ['Dockerfile', 'custom-reporter.js']
            self.cmd(c, ['mv', '/testbed/custom-reporter.js', '/tmp/custom-reporter.js'])
            self.cmd(c, ['rm', '/testbed/Dockerfile'])
        assert not self.cmd(c, ['git', 'status', '--porcelain']).output
        return overlay

    def apply(self, c, data):
        if data:
            self.put(c, 'tmp/two-world.patch', data)
            self.cmd(c, ['git', 'apply', '--check', '--index', '--binary', '/tmp/two-world.patch'])
            self.cmd(c, ['git', 'apply', '--index', '--binary', '/tmp/two-world.patch'])
        tree = self.cmd(c, ['git', 'write-tree']).output.decode().strip()
        archive = self.cmd(c, ['git', 'archive', '--format=tar', tree]).output
        return tree, archive

    def read_paths(self, c, paths):
        # All names are from trusted Git/tar inventories, not shell expansion.
        if not paths:
            return {}
        r = c.exec_run(['tar', '-cf', '-', '--', *sorted(paths)], workdir='/testbed', demux=True)
        stdout, stderr = r.output
        return parse_snapshot(stdout or b'', stderr, r.exit_code, paths)

    def restore_surface(self, c, manifest, source):
        selected = {p for p in archive_entries(source) if in_surface(p, manifest)}
        # Delete entire declared regions, then restore exact S bytes/modes.
        self.cmd(c, ['rm', '-rf', '--', *manifest['files'], *[x.rstrip('/') for x in manifest['directories']]])
        assert c.put_archive('/testbed', subset_tar(source, selected))

    def run(self, task, manifest, label, full_archive, source, overlay, world):
        case = self.out / label
        case.mkdir(parents=True, exist_ok=False)
        record = {'instance_id': task['instance_id'], 'label': label, 'world': world,
                  'command': manifest['assessment_command'] if world == 'E' else manifest['delivered_command'],
                  'timeout_seconds': 1200, 'acceptance_diag': None, 'assessment_integrity': 'not_run'}
        started = time.monotonic()
        try:
            with self.container(task) as c:
                self.baseline(c, task)
                self.cmd(c, ['git', 'rm', '-r', '-f', '--ignore-unmatch', '.'])
                assert c.put_archive('/testbed', full_archive)
                full = archive_entries(full_archive)
                # F snapshot is immutable outside this disposable copy.
                assert self.read_paths(c, full) == full
                if world == 'E':
                    self.restore_surface(c, manifest, source)
                selected = {p for p in archive_entries(source) if in_surface(p, manifest)}
                paths = set(full) | selected
                before = self.read_paths(c, paths)
                record['integrity'] = check_boundary(full, before, manifest)
                if world == 'E':
                    assert {p: v for p, v in before.items() if in_surface(p, manifest)} == {p: v for p, v in archive_entries(source).items() if in_surface(p, manifest)}
                assert all(x['kind'] == 'file' for x in before.values()), 'source symlinks unsupported'
                record['source_inventory_sha256'] = sha(packed(before))
                record['full_inventory_sha256'] = sha(packed(full))
                save(case / 'source-inventory.json', before)
                # Configuration and build machinery are not a restorable test surface.
                baseline_archive = self.cmd(c, ['git', 'archive', task['base_commit']]).output
                baseline_files = archive_entries(baseline_archive)
                for p in manifest['fixed_execution_inputs']:
                    assert full.get(p) == baseline_files.get(p), 'unsupported author execution config: ' + p
                for p in full:
                    assert not p.endswith('/__test__.js'), 'uncontrolled src test discovery'
                    if p.startswith(('node_modules/', '.mocharc')) or p in ['.npmrc', '.yarnrc', 'package-lock.json', 'test/mocha.opts', 'mocha.opts']:
                        assert full.get(p) == baseline_files.get(p), 'unsupported execution override: ' + p
                if manifest['build_outputs']:
                    discovered = self.cmd(c, ['find', 'src', '-name', '__test__.js']).output
                    assert not discovered, 'uncontrolled generated src test discovery'

                for p in manifest['execution_overlay']:
                    assert full.get(p) == baseline_files.get(p), 'image overlay intersects author: ' + p
                assert archive_entries(overlay) == manifest['execution_overlay']
                assert c.put_archive('/testbed', overlay)
                if manifest['build_outputs']:
                    self.cmd(c, ['rm', '-rf', '--', *manifest['build_outputs']])
                # Resolve package entry targets without executing tests; realpath forbids aliasing.
                targets = []
                for p in manifest['source_import_targets']:
                    actual = self.cmd(c, ['readlink', '-f', '/testbed/' + p]).output.decode().strip()
                    validate_target(actual, '/testbed/' + p)
                    targets.append(actual)
                record['import_targets'] = targets
                record['build_inputs_sha256'] = sha(packed({p: v for p, v in before.items() if not in_surface(p, manifest)}))
                record['execution_overlay'] = manifest['execution_overlay']
                record['assessment_integrity'] = 'prepared'
                # Same shell/command as upstream; explicit process timeout, no runner rewrite.
                tick = time.monotonic()
                r = c.exec_run(['timeout', '-k', '10', '1200', 'bash', '-c', 'set -uo pipefail\n' + record['command']],
                               workdir='/testbed', demux=True)
                stdout, stderr = r.output
                raw_logs = (stderr or b'') + (stdout or b'')
                (case / 'raw-test.log').write_bytes(raw_logs)
                logs = raw_logs + f'\nContainer exited with status code: {r.exit_code}\n'.encode()
                (case / 'test.log').write_bytes(logs)
                record.update(exit_code=r.exit_code, signal=(r.exit_code - 128 if r.exit_code > 128 else None),
                              timeout=r.exit_code == 124, test_seconds=round(time.monotonic() - tick, 3),
                              output_sha256=sha(logs))
                after = self.read_paths(c, before)
                changed = sorted(p for p in before if before[p] != after.get(p))
                record['source_mutations'] = {p: {'before': before.get(p), 'after': after.get(p)} for p in changed}
                allowed = manifest['mutable_execution_paths']
                unexpected = [p for p in changed if not any(fnmatch.fnmatchcase(p, pattern) for pattern in allowed)]
                assert not unexpected, 'assertion/source changed during execution: ' + repr(unexpected[:10])
                record['expectations_unchanged'] = True
                record['build_outputs'] = self.read_paths(c, manifest['build_output_files'])
                if not record['timeout'] and r.exit_code not in [125, 126, 127, 137]:
                    expected_targets = manifest['source_import_targets'] + manifest['build_output_files']
                    for target in expected_targets:
                        actual = self.cmd(c, ['readlink', '-f', '/testbed/' + target]).output.decode().strip()
                        validate_target(actual, '/testbed/' + target)
                    entry_modules = manifest['source_import_targets'] + ([p for p in manifest['build_output_files'] if p.endswith('.js')] if manifest['build_outputs'] else [])
                    code = 'console.log(JSON.stringify(' + json.dumps(entry_modules) + '.map(p=>require.resolve("./"+p))))'
                    resolved = self.cmd(c, ['bash', '-c', '. /usr/local/nvm/nvm.sh && node -e ' + shlex.quote(code)])
                    actual_targets = json.loads(resolved.output)
                    assert actual_targets == ['/testbed/' + p for p in entry_modules], 'module resolution escape'
                    record['resolved_modules'] = actual_targets
                    assert set(record['build_outputs']) == set(manifest['build_output_files']), 'missing fresh build output'

                if record['timeout'] or r.exit_code in [125, 126, 127, 137]:
                    record['delivered_checks'] = 'timeout' if record['timeout'] else 'execution_error'
                    record['assessment_integrity'] = 'incomplete'
                else:
                    sys.path.insert(0, str(EVALUATOR / 'src'))
                    from poly_bench_evaluation.constants import REPO_TO_PARSER_CLASS
                    from poly_bench_evaluation.scoring import instance_level_scoring
                    parsers = importlib.import_module('poly_bench_evaluation.parsers')
                    parsed = getattr(parsers, REPO_TO_PARSER_CLASS[task['repo']])(test_content=logs.decode(errors='replace')).parse()
                    assert parsed and (parsed['passed_tests'] or parsed['failed_tests']), 'no parsed tests (build/load error)'
                    save(case / 'parsed.json', parsed)
                    # Inspect the existing Mocha JSON report, not a new test parser.
                    match = re.search(rb'{\s*"stats"', stdout or b'')
                    assert match, 'missing complete Mocha report'
                    mocha = json.JSONDecoder().raw_decode((stdout or b'')[match.start():].decode())[0]
                    record['runner_stats'] = mocha['stats']
                    record['failure_details'] = mocha['failures']
                    assert mocha['stats']['passes'] + mocha['stats']['failures'] > 0
                    assert mocha['stats']['passes'] == len(parsed['passed_tests']) and mocha['stats']['failures'] == len(parsed['failed_tests'])

                    record['passed'] = len(parsed['passed_tests']); record['failed'] = len(parsed['failed_tests'])
                    record['failed_tests'] = parsed['failed_tests']
                    record['delivered_checks'] = 'passed' if r.exit_code == 0 and not parsed['failed_tests'] else 'assertion_failure'
                    if world == 'E':
                        required = set(ast.literal_eval(task['row']['F2P'])) | set(ast.literal_eval(task['row']['P2P']))
                        missing = required - set(parsed['passed_tests']) - set(parsed['failed_tests'])
                        record['missing_required_tests'] = sorted(missing)
                        assert not missing, 'required tests absent'
                        result = instance_level_scoring(task['instance_id'], parsed,
                            ast.literal_eval(task['row']['F2P']), ast.literal_eval(task['row']['P2P']), True, True)
                        record['acceptance_diag'] = asdict(result)
                    record['assessment_integrity'] = 'verified'
        except Exception as exc:
            record['error'] = str(exc)
            record['assessment_integrity'] = 'error'
            record['acceptance_diag'] = None
            record.setdefault('delivered_checks', 'build_load_or_preparation_error')
        record['seconds'] = round(time.monotonic() - started, 3)
        save(case / 'result.json', record)
        print(label, record['assessment_integrity'], record.get('passed'), record.get('failed'), record.get('error', ''), flush=True)
        return record


def main():
    p = argparse.ArgumentParser()
    p.add_argument('mode', choices=['freeze', 'calibrate', 'evaluate'])
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--calibration', type=Path)
    args = p.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    tasks = inputs(); initial = guard()
    runner = Runner(args.out)
    summary = {'mode': args.mode, 'provider_calls': 0, 'cases': [], 'input_hashes': initial, 'driver_sha256': sha(Path(__file__).read_bytes()), 'controls_sha256': sha((HERE / 'controls.py').read_bytes()), 'protocol_commit': git('log', '-1', '--format=%H', '--', str(HERE / 'PLAN.md')).decode().strip()}
    started = time.monotonic()
    try:
        for i, task in tasks.items():
            with runner.container(task) as c:
                overlay = runner.baseline(c, task)
                s_tree, source = runner.apply(c, task['row']['test_patch'].encode())
                if args.mode == 'freeze':
                    manifest = make_manifest(task, source, overlay, s_tree)
                    assert not (HERE / (i + '.json')).exists()
                    save(HERE / (i + '.json'), manifest)
                    continue
                manifest = json.loads((HERE / (i + '.json')).read_bytes())
                assert manifest['assessment_tree'] == s_tree
                assert manifest['assessment_inventory_sha256'] == sha(packed(archive_entries(source)))
                assert manifest['test_patch_sha256'] == sha(task['row']['test_patch'].encode())
                if args.mode == 'calibrate':
                    variants = [('baseline', b''), ('gold', task['row']['patch'].encode())]
                else:
                    assert args.calibration
                    calibration = json.loads((args.calibration / 'summary.json').read_bytes())
                    assert calibration['driver_sha256'] == sha(Path(__file__).read_bytes()), 'driver changed after calibration'
                    assert calibration['calibration_passed'] and calibration['manifest_hashes'] == {x: sha((HERE / (x + '.json')).read_bytes()) for x in IDS}
                    variants = []
                    for arm in ARMS:
                        path = DEV / 'results/patches' / arm / (i + '.patch')
                        model = path.read_bytes()
                        assert model == git('show', HIST + ':' + str(path.relative_to(ROOT)))
                        pred = [json.loads(x) for x in (DEV / 'results/predictions' / (arm + '.jsonl')).read_bytes().splitlines() if json.loads(x)['instance_id'] == i]
                        assert len(pred) == 1 and pred[0]['model_patch'].encode() == model
                        variants.append((arm, model))
                for label, patch in variants:
                    runner.cmd(c, ['git', 'reset', '--hard', task['base_commit']])
                    tree, full = runner.apply(c, patch)
                    # Initial F bytes and modes bound to Git's strictly applied tree.
                    provenance = {'delivery_apply': True, 'model_sha256': sha(patch), 'full_git_tree': tree,
                                  'test_sha256': manifest['test_patch_sha256'], 'base_commit': task['base_commit'],
                                  'image': task['officialImage']['digest']}
                    if args.mode == 'evaluate':
                        f = runner.run(task, manifest, i + '-' + label + '-F', full, source, overlay, 'F')
                    e = runner.run(task, manifest, i + '-' + label + '-E', full, source, overlay, 'E')
                    summary['cases'].append(dict(provenance, instance_id=i, arm=label, E=e, **({'F': f} if args.mode == 'evaluate' else {})))
                    if args.mode == 'calibrate':
                        # A same-file author replacement weakens an existing test, without adding assertions.
                        target = manifest['control_test']
                        runner.put(c, 'testbed/' + target, b"// local boundary control: author removed assertions\n")
                        runner.cmd(c, ['git', 'add', '--', target])
                        control_tree, control_full = runner.apply(c, b'')
                        control = runner.run(task, manifest, i + '-' + label + '-overlap-E', control_full, source, overlay, 'E')
                        summary['cases'].append(dict(provenance, instance_id=i, arm=label + '-overlap', E=control))
        summary['manifest_hashes'] = {i: sha((HERE / (i + '.json')).read_bytes()) for i in IDS}
        if args.mode == 'calibrate':
            from controls import boundary_controls
            summary['boundary_controls'] = boundary_controls()
            summary['calibration_passed'] = all(x['E']['assessment_integrity'] == 'verified' and x['E']['acceptance_diag']['resolved'] == x['arm'].startswith('gold') for x in summary['cases']) and len(summary['cases']) == 8
    finally:
        summary['historical_inputs_unchanged'] = guard() == initial
        summary['created_containers'] = runner.created
        summary['removed_containers'] = runner.removed
        summary['seconds'] = round(time.monotonic() - started, 3)
        save(args.out / 'summary.json', summary)
        runner.client.close()
    assert summary['historical_inputs_unchanged']


def make_manifest(task, source, overlay, tree):
    svelte = task['repo'] == 'sveltejs/svelte'
    files = archive_entries(source)
    test = task['row']['test_patch'].encode()
    m = {'instance_id': task['instance_id'], 'base_commit': task['base_commit'],
         'dataset_revision': 'b3fca77b637379f0c01ad86d18753a7ac1998b53', 'evaluator': UPSTREAM,
         'image': task['officialImage'], 'test_patch_sha256': sha(test), 'gold_sha256': sha(task['row']['patch'].encode()),
         'assessment_tree': tree, 'assessment_inventory_sha256': sha(packed(files)),
         'directories': ['test/'] if svelte else [],
         'files': ['mocha.opts'] if svelte else ['lib/plugins/aws/package/lib/mergeIamTemplates.test.js'],
         'source': 'exact B + unchanged official T; added paths copied, absent paths removed, modes retained',
         'assessment_command': task['row']['test_command'], 'delivered_command': task['row']['test_command'],
         'execution_overlay': archive_entries(overlay),
         'fixed_execution_inputs': ['package.json', 'yarn.lock', '.gitignore', 'mocha.opts', 'rollup.config.js', 'rollup.store.config.js', 'src/shared/_build.js', 'tsconfig.json'] if svelte else ['package.json', '.gitignore'],
         'source_import_targets': ['src/index.ts', 'src/shared/index.js', 'store.js'] if svelte else ['lib/Serverless.js', 'lib/plugins/aws/provider/awsProvider.js', 'lib/plugins/aws/package/index.js', 'lib/plugins/aws/package/lib/mergeIamTemplates.js'],
         'build_outputs': ['compiler', 'ssr', 'shared.js', 'store.umd.js', 'src/generators/dom/shared.ts'] if svelte else [],
         'build_output_files': ['compiler/svelte.js', 'compiler/svelte.js.map', 'ssr/register.js', 'ssr/register.js.map', 'shared.js', 'store.umd.js', 'src/generators/dom/shared.ts'] if svelte else [],
         'mutable_execution_paths': ['package.json', 'yarn.lock', 'test/*/samples/*/_actual.*', 'test/js/samples/*/_actual-bundle.js', 'test/sourcemaps/samples/*/output.js', 'test/sourcemaps/samples/*/output.js.map', 'test/sourcemaps/samples/*/output.css', 'test/sourcemaps/samples/*/output.css.map'] if svelte else ['Dockerfile'],
         'control_test': 'test/css/index.js' if svelte else 'lib/plugins/aws/package/lib/mergeIamTemplates.test.js',
         'timeout_seconds': 1200,
         'roles': {},
         'rationale': ('test/test.js discovers all test/*/index.js; helpers/setup and dynamic sample configs remain in one fixed test/ surface. src/**/__test__.js discovery must be empty; additions outside surface are rejected. sourcemap output.* and SSR _actual.* are generated diagnostics, not expected values. Compiler/SSR/shared/store are rebuilt from this copy by unchanged npm pretest. No whole-project restore.' if svelte else 'Explicit Mocha file; imports chai plus local Serverless, AwsProvider and AwsPackage production modules. No local test helper. Package Mocha settings must remain B. Other author test files are preserved but not discovered by this targeted command.')}
    for path in patch_paths(test):
        assert in_surface(path, m)
        if not svelte or path == 'test/css/index.js': role = 'test runner and assertions'
        elif '/_actual.' in path or '/output.' in path: role = 'generated diagnostic output (not expectation)'
        else: role = 'expected output fixture'
        m['roles'][path] = role
    return m


if __name__ == '__main__':
    main()
