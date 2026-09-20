"""Thin Svelte-only patch-path adapter. Original Runner, manifest and parser unchanged."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import time
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DRIVER = ROOT / 'development/polybench-pilot/two-world-diagnostic/driver.py'
spec = importlib.util.spec_from_file_location('two_world', DRIVER)
d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)
ID = 'sveltejs__svelte-1190'
p = argparse.ArgumentParser(); p.add_argument('mode', choices=['calibrate', 'evaluate']); p.add_argument('--out', type=Path, required=True); p.add_argument('--calibration', type=Path); p.add_argument('--patches', type=Path)
a = p.parse_args(); a.out.mkdir(parents=True, exist_ok=False)
d.IDS = [ID]
task = d.inputs()[ID]; manifest_path = DRIVER.parent / (ID + '.json'); manifest = json.loads(manifest_path.read_bytes())
identity = {'driver':d.sha(DRIVER.read_bytes()), 'adapter':d.sha(Path(__file__).read_bytes()), 'manifest':d.sha(manifest_path.read_bytes())}
r = d.Runner(a.out); started = time.monotonic(); result = {'mode':a.mode,'identity':identity,'cases':[],'provider_calls':0}
if a.mode == 'calibrate':
    variants = [('baseline', b''), ('gold', task['row']['patch'].encode())]
else:
    c = json.loads((a.calibration / 'summary.json').read_bytes())
    assert c['calibration_passed'] and c['identity'] == identity
    variants = [(arm, (a.patches / (arm + '.patch')).read_bytes()) for arm in ['OFF','ON'] if (a.patches / (arm + '.patch')).exists()]
try:
    with r.container(task) as container:
        overlay = r.baseline(container, task)
        tree, source = r.apply(container, task['row']['test_patch'].encode())
        assert tree == manifest['assessment_tree']
        assert d.sha(d.packed(d.archive_entries(source))) == manifest['assessment_inventory_sha256']
        assert d.sha(task['row']['test_patch'].encode()) == manifest['test_patch_sha256']
        for arm, patch in variants:
            record = {'arm':arm,'model_sha256':d.sha(patch),'delivery_apply':False,'F':None,'E':None}
            try:
                r.cmd(container, ['git','reset','--hard',task['base_commit']])
                full_tree, full = r.apply(container, patch)
                record.update(delivery_apply=True,full_git_tree=full_tree)
                for world in ['F','E']:
                    record[world] = r.run(task,manifest,arm+'-'+world,full,source,overlay,world)
            except Exception as e:
                record['error'] = str(e)
            result['cases'].append(record)
    if a.mode == 'calibrate':
        result['calibration_passed'] = len(result['cases']) == 2 and all(x['delivery_apply'] and x['E']['assessment_integrity']=='verified' and x['F']['assessment_integrity']=='verified' and x['E']['acceptance_diag']['resolved']==(x['arm']=='gold') for x in result['cases'])
        gold = next(x for x in result['cases'] if x['arm']=='gold')
        result['calibration_passed'] &= gold['E'].get('failed')==11 and gold['E'].get('runner_stats',{}).get('pending')==53
finally:
    result.update(seconds=round(time.monotonic()-started,3),created_containers=r.created,removed_containers=r.removed)
    d.save(a.out/'summary.json',result); r.client.close()
if a.mode == 'calibrate': assert result['calibration_passed']
