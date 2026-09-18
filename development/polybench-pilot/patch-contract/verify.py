"""Validate this evidence pack without running an evaluator, tests, or providers."""
import json
from pathlib import Path
import sys
from diagnose import CASES, ROOT, DEV, LOCAL, sha

here = Path(__file__).resolve().parent
evidence = here / 'evidence'
summary = json.loads((evidence / 'summary.json').read_bytes())
assert [(r['instance_id'], r['arm']) for r in summary['cases']] == CASES
assert summary['containers_created'] == 27 and summary['containers_remaining'] == []
for name, digest in json.loads((evidence / 'input-hashes.json').read_bytes()).items():
    assert sha((ROOT / name).read_bytes()) == digest, name
import pandas as pd
predictions = {arm: pd.read_json(DEV / 'results/predictions' / (arm + '.jsonl'), lines=True) for arm in ['P', 'H0', 'H1']}
for instance, arm in CASES:
    r = json.loads((evidence / (instance + '-' + arm + '.json')).read_bytes())
    model = (ROOT / r['source_patch']).read_bytes()
    prediction = predictions[arm]
    assert prediction[prediction.instance_id == instance].iloc[0].model_patch.encode() == model
    assert sha(model) == r['model_sha256']
    assert r['scenarios']['B+M']['strict_M'] == 0
    strict = r['scenarios']['B+T+strict-M']
    assert strict['strict_T'] == 0 and strict['strict_M_after_T'] == 1
    official = r['scenarios']['official-B+T+M']
    commands = [c for c in official['commands'] if isinstance(c['cmd'], str)]
    assert [c['cmd'] for c in commands] == [
        'git apply -v --ignore-whitespace --reject /testbed/patch_test.diff',
        'git apply -v --ignore-whitespace --reject /testbed/patch_code.diff',
        'patch --batch --fuzz=5 -p1 -f -i /testbed/patch_code.diff']
    assert [c['exit_code'] for c in commands] == [0, 1, 1]
    assert all(c['cwd'] == '/testbed' and c['user'] == 'root' for c in commands)
    assert official['official_T'] == 0 and official['official_M'] == 'exception: Failed to apply patch.'
    assert official['snapshots'][-1]['label'] == 'immediately before upstream cleanup'
    assert official['snapshots'][-1]['diff_sha256'] == official['snapshots'][-2]['diff_sha256']
    assert r['first_git_rejected_hunks'] and all(h['classification'] for h in r['first_git_rejected_hunks'])
    assert all(h['path'].startswith('test/') or h['path'].endswith('.test.js') for h in r['first_git_rejected_hunks'])
    assert all(h['path'] in r['model_hunks'] for h in r['first_git_rejected_hunks'])
controls = json.loads((evidence / 'controls.json').read_bytes())['controls']
assert len(controls) == 5 and [c['outcome'] for c in controls] == [0, 0, 1, 1, 1]
assert all(c['patches']['test'] and c['patches']['code'] for c in controls)
accounting = json.loads((DEV / 'results/accounting.json').read_bytes())
assert sum(r['status'] == 'not_started' for r in accounting['slots']) == 12
for file in here.glob('*.py'):
    compile(file.read_bytes(), str(file), 'exec')
print('PASS: 9 cases, exact JSON and pandas prediction bytes, immutable inputs, original command order, 5 controls, 12 not_started, syntax.')
