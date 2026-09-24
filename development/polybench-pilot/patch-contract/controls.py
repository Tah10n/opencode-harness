"""Five tiny Git controls using the pinned upstream application method."""
import argparse
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import time
import uuid
from diagnose import LOCAL, DEV, Observer, write


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    assert not args.out.exists()
    sys.path.insert(0, str(LOCAL / 'patch-contract-sources/evaluator/src'))
    import docker
    from poly_bench_evaluation.docker_utils import DockerManager
    image = next(t['officialImage']['digest'] for t in json.loads((DEV / 'frozen-manifest.json').read_bytes())['tasks'] if t['instance_id'] == 'serverless__serverless-6534')
    client = docker.DockerClient(base_url=os.environ.get('DOCKER_HOST', 'unix://' + str(Path.home() / '.docker/run/docker.sock')))
    container = client.containers.create(image=image, command='tail -f /dev/null', detach=True, tty=True,
        name='polybench-patch-contract-controls-' + uuid.uuid4().hex, network_mode='none',
        cap_drop=['ALL'], security_opt=['no-new-privileges'], pids_limit=1024,
        mem_limit='8g', nano_cpus=4_000_000_000, platform='linux/amd64',
        labels={'opencode-harness.diagnostic': 'patch-contract'})
    container.start()
    records = []
    started = time.monotonic()
    base = {'prod.js': 'value = 0;\n', 'test.js': ''.join(f'assert_{n} = 0;\n' for n in range(1, 41))}
    cases = [
        ('separate-files', {'prod.js': 'value = 1;\n'}, {1: 1}, 0),
        ('same-file-distant-hunks', {30: 1}, {1: 1}, 0),
        ('identical-assertion', {1: 1}, {1: 1}, 1),
        ('different-assertion', {1: 2}, {1: 1}, 1),
        ('partial-production-and-conflicting-test', {'prod.js': 'value = 1;\n', 1: 2}, {1: 1}, 1),
    ]
    def put(cwd, data):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w') as tar:
            for name, content in data.items():
                raw = content.encode(); member = tarfile.TarInfo(name); member.size = len(raw)
                tar.addfile(member, io.BytesIO(raw))
        assert container.put_archive(cwd, stream.getvalue())
    try:
        for name, mchanges, tchanges, expected in cases:
            cwd = '/tmp/patch-control-' + name
            def run(cmd):
                result = container.exec_run(cmd, workdir=cwd)
                assert result.exit_code == 0, result.output
                return result.output
            container.exec_run(['mkdir', '-p', cwd])
            put(cwd, base)
            run(['git', 'init', '--template='])
            run(['git', 'add', '.'])
            run(['git', '-c', 'user.name=Control', '-c', 'user.email=control@example.invalid', 'commit', '-m', 'B'])
            patches = {}
            for kind, changes in [('test', tchanges), ('code', mchanges)]:
                data = dict(base)
                for key, value in changes.items():
                    if isinstance(key, int): data['test.js'] = data['test.js'].replace(f'assert_{key} = 0;', f'assert_{key} = {value};')
                    else: data[key] = value
                put(cwd, data)
                for filename in data:
                    blob = run(['git', 'hash-object', '-w', filename]).decode().strip()
                    run(['git', 'update-index', '--cacheinfo', '100644', blob, filename])
                patches[kind] = run(['git', 'diff', '--cached']).decode()
                assert patches[kind], 'Control patch must not be empty'
                run(['git', 'restore', '--source=HEAD', '--staged', '--worktree', '.'])  # Patch construction, before T.
            evidence = {'name': name, 'expected_failure': bool(expected), 'patches': patches}
            observer = Observer(container, cwd, evidence)
            class Manager(DockerManager):
                def _get_workdir_from_image(self): return cwd
                def _cleanup(self):
                    # Diagnostic interception: record pre-cleanup; no next operation on this repo.
                    if self.container:
                        self.container.snapshot('before cleanup')
            manager = Manager(image, False, client); manager.container = observer
            assert manager.apply_patch_to_container(patches['test'], 'test') == 0
            try:
                outcome = manager.apply_patch_to_container(patches['code'], 'code')
            except ValueError as error:
                assert str(error) == 'Failed to apply patch.'
                outcome = 1
            evidence['outcome'] = outcome
            records.append(evidence)
            if outcome != expected:
                print(json.dumps(evidence, indent=2), flush=True)
            assert outcome == expected
            commands = evidence['commands']
            if name == 'partial-production-and-conflicting-test':
                first_m = evidence['snapshots'][1]
                assert 'prod.js' in first_m['changed_files']
                assert any(any(p.endswith('prod.js.rej') for p in s['artifacts']) for s in evidence['snapshots'][2:])
            evidence['final_prod'] = run(['cat', 'prod.js']).decode()
            evidence['final_assertion_1'] = run(['head', '-n', '1', 'test.js']).decode()
            if expected:
                assert evidence['final_assertion_1'] == 'assert_1 = 1;\n'
            manager.container = None
            print('control', name, 'PASS (expected ' + str(expected) + ')', flush=True)
    finally:
        if 'manager' in locals(): manager.container = None
        container.stop(timeout=1); container.remove(); client.close()
        write(args.out, {'controls': records, 'elapsed_seconds': round(time.monotonic() - started, 3),
                         'containers_created': 1, 'test_runs': 0, 'scoring_runs': 0})
    assert len(records) == 5


if __name__ == '__main__': main()
