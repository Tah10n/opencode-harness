#!/usr/bin/env python3
"""One bounded five-copy diagnosis; immutable input patches; no scoring writes.
Use the historical local/polybench-pilot/venv/bin/python. Output path must be new.
Full process outputs remain local; receipt.json contains commands and hashes.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import time
import uuid
import docker

ROOT = Path(__file__).resolve().parents[3]
LOCAL = ROOT / 'local/polybench-pilot'
HERE = Path(__file__).resolve().parent
INSTANCE = 'serverless__serverless-2434'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    out = Path(sys.argv[1]).resolve()
    out.mkdir(parents=True, exist_ok=False)
    sources = {}
    def read(p):
        data = p.read_bytes()
        sources[str(p.relative_to(ROOT))] = sha(data)
        return data
    manifest = json.loads(read(ROOT / 'development/polybench-pilot/frozen-manifest.json'))
    task = next(t for t in manifest['tasks'] if t['instance_id'] == INSTANCE)
    csvpath = LOCAL / (INSTANCE + '.csv')
    assert sha(read(csvpath)) == task['originalRowCsvSha256']
    csv.field_size_limit(10000000)
    row = next(csv.DictReader(io.StringIO(csvpath.read_text())))
    assert row['base_commit'] == task['base_commit']
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=LOCAL/'evaluator', text=True).strip() == manifest['evaluatorSha']
    assert not subprocess.check_output(['git', 'diff', 'HEAD', '--', 'src'], cwd=LOCAL/'evaluator')
    for name, digest in task['archives'].items():
        assert sha(read(LOCAL/'author-inputs'/INSTANCE/name)) == digest
    assert sha(read(ROOT/'development/polybench-pilot/prompts'/f'{INSTANCE}.md')) == task['promptSha256']
    patches = {'baseline': '', 'gold': row['patch']}
    for arm in ['P', 'H0', 'H1']:
        patches[arm] = read(ROOT/'development/polybench-pilot/results/patches'/arm/f'{INSTANCE}.patch').decode()
        assert patches[arm].encode() == read(LOCAL/'batch/runs'/f'{INSTANCE}-{arm}'/'model.patch')
    probe = read(HERE/'probe.js')
    read(Path(__file__).resolve())
    client = docker.from_env()
    image = client.images.get(task['officialImage']['digest'])
    assert image.id == task['officialImage']['id'] and image.attrs['Architecture'] == 'amd64'
    receipt = {'instance': INSTANCE, 'sourceHead': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
               'pins': task, 'datasetRevision': manifest['datasetRevision'], 'evaluatorSha': manifest['evaluatorSha'],
               'sources': sources, 'arms': [], 'newModelRequests': 0,
               'boundary': {'network':'none','capDrop':['ALL'],'noNewPrivileges':True,'memory':'8g','cpus':4,'mounts':[]}}
    def save(): (out/'receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
    save()
    for arm, patch in patches.items():
        a = {'arm': arm, 'patchSha256': sha(patch.encode()), 'commands': []}
        receipt['arms'].append(a)
        c = client.containers.create(image=task['officialImage']['digest'], command='tail -f /dev/null',
              working_dir='/testbed', network_mode='none', cap_drop=['ALL'], security_opt=['no-new-privileges'],
              pids_limit=1024, mem_limit='8g', nano_cpus=4_000_000_000, platform='linux/amd64',
              name='serverless-2434-analysis-'+uuid.uuid4().hex, labels={'opencode-harness.task':'serverless-2434-analysis'})
        a['containerId'] = c.id
        def put(name, data):
            stream = io.BytesIO()
            with tarfile.open(fileobj=stream, mode='w') as t:
                info = tarfile.TarInfo(name); info.size = len(data); t.addfile(info, io.BytesIO(data))
            c.put_archive('/testbed', stream.getvalue())
        def run(label, command):
            cmd = ['docker','exec','-w','/testbed',c.id,'bash','-c',command]
            start = time.monotonic()
            try:
                p = subprocess.run(cmd, capture_output=True, timeout=180)
                stdout, stderr, code, timedout = p.stdout, p.stderr, p.returncode, False
            except subprocess.TimeoutExpired as e:
                stdout, stderr, code, timedout = e.stdout or b'', e.stderr or b'', None, True
            filename = arm+'-'+label
            (out/(filename+'.stdout')).write_bytes(stdout); (out/(filename+'.stderr')).write_bytes(stderr)
            r = {'label':label,'command':command,'cwd':'/testbed','exitCode':code,
                 'signal': -code if code is not None and code < 0 else None,'timeout':timedout,
                 'seconds':round(time.monotonic()-start,3),'stdout':filename+'.stdout','stderr':filename+'.stderr',
                 'stdoutSha256':sha(stdout),'stderrSha256':sha(stderr)}
            a['commands'].append(r); save()
            if timedout: raise RuntimeError('Bounded command timed out; no retry')
            return code, stdout
        try:
            c.start()
            code, data = run('identity', '. /usr/local/nvm/nvm.sh && git rev-parse HEAD && node --version && npm --version')
            assert code == 0 and task['base_commit'] in data.decode() and 'v16.20.2' in data.decode() and '8.19.4' in data.decode()
            for kind, data in [('test',row['test_patch']),('code',patch)]:
                if not data: continue
                put('patch_'+kind+'.diff',data.encode())
                code,_ = run('apply-'+kind, 'git apply -v --ignore-whitespace --reject /testbed/patch_'+kind+'.diff')
                if code:
                    code,_ = run('apply-'+kind+'-fallback','patch --batch --fuzz=5 -p1 -f -i /testbed/patch_'+kind+'.diff')
                assert code == 0
            put('eval.sh', ('#!/bin/bash\nset -uxo pipefail\n'+row['test_command']+'\n').encode())
            run('official-service','/bin/bash /testbed/eval.sh')
            run('variables','. /usr/local/nvm/nvm.sh && npx mocha lib/classes/Variables.test.js --reporter json')
            put('analysis-probe.js',probe)
            code,_ = run('probe','. /usr/local/nvm/nvm.sh && node /testbed/analysis-probe.js '+arm)
            assert code == 0
        finally:
            c.remove(force=True)
            try: client.containers.get(c.id)
            except docker.errors.NotFound: a['removed'] = True
            else: a['removed'] = False
            save()
        print(arm, 'captured; container removed', flush=True)
    client.close()

if __name__ == '__main__': main()
