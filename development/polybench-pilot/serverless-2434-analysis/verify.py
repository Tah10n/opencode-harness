#!/usr/bin/env python3
"""Read-only local evidence verification; no Docker, provider or test execution."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def digest(data):
    return hashlib.sha256(data).hexdigest()

hashes = json.loads((HERE / 'HASHES.json').read_text())
for name, expected in hashes.items():
    assert digest((ROOT / name).read_bytes()) == expected, name
for p in HERE.glob('*.py'):
    ast.parse(p.read_text(), filename=str(p))
subprocess.run(['node', '--check', str(HERE / 'probe.js')], check=True)
e = json.loads((HERE / 'EVIDENCE.json').read_text())
expected = {'baseline': (24, 2), 'gold': (25, 1), 'P': (27, 2), 'H0': (25, 2), 'H1': (26, 2)}
assert [a['arm'] for a in e['arms']] == list(expected)
for a in e['arms']:
    assert a['removed']
    actual = a['observed']['official-service']
    assert (actual['passes'], len(actual['failures'])) == expected[a['arm']]
    assert a['observed']['variables'] == {'passes': 34, 'failures': []}
    assert a['probe']['assertions'] == 'passed'
    probe_command = next(c for c in a['commands'] if c['label'] == 'probe')
    assert probe_command['exitCode'] == 0
    for c in a['commands']:
        assert c['signal'] is None and not c['timeout']
        for key in ['stdout', 'stderr']:
            assert digest((ROOT / c[key]).read_bytes()) == c[key + 'Sha256']
    if a['arm'] in ['P', 'H0', 'H1']:
        original = json.loads((ROOT / 'development/polybench-pilot/results/official' /
                              a['arm'] / 'serverless__serverless-2434_result.json').read_text())
        assert not original['resolved'] and original['no_p2p_failed']
        assert sorted(original['failed_tests']) == sorted(f['title'] for f in actual['failures'])
        assert len(original['passed_tests']) == actual['passes']
assert e['accounting']['commandSeconds'] == round(sum(c['seconds'] for a in e['arms'] for c in a['commands']), 3)
assert e['accounting']['executionCommands'] == sum(len(a['commands']) for a in e['arms'])
authors = json.loads((HERE / 'AUTHOR-EVIDENCE.json').read_text())
for author in authors:
    assert author['terminal']['nativeCompleted'] and not author['terminal']['timedOut']
    for tool in author['tools']:
        delivered = tool['firstActualProviderRequest']
        request = json.loads((ROOT / delivered['path']).read_text())
        items = [x for x in request['input'] if x.get('type') == 'function_call_output' and x.get('call_id') == tool['callID']]
        assert len(items) == 1
        output = items[0]['output']
        if not isinstance(output, str): output = json.dumps(output)
        assert digest(output.encode()) == delivered['outputSha256']
print(json.dumps({'verifiedSourceHashes': len(hashes), 'arms': 5, 'commands': 29,
                  'historicalScoresChanged': False, 'syntax': 'passed',
                  'authorReceiptDeliveryHashes': 'passed'}))
