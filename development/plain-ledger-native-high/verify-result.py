"""Verify final arithmetic, immutable artifacts and frozen inputs, without reruns."""
import collections
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEV = ROOT / 'development/plain-ledger-native-high'
LOCAL = ROOT / 'local/plain-ledger-native-high'
RUN = LOCAL / 'batch/runs/account-switch-ledger-P'
get = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
r = get(DEV / 'result.json')
frozen = get(LOCAL / 'batch/freeze.json')
commit = get(LOCAL / 'batch/freeze-commit.json')['commit']
assert subprocess.check_output(['git', 'show', commit + ':development/plain-ledger-native-high/manifest.json'], cwd=ROOT) == (DEV / 'manifest.json').read_bytes()
assert get(DEV / 'manifest.json')['freezeSha256'] == sha(LOCAL / 'batch/freeze.json')
for file, digest in frozen['files'].items():
    assert sha(Path(file)) == digest, file
assert len(list((LOCAL / 'batch/runs').iterdir())) == 1
assert (DEV / 'model.patch').read_bytes() == (RUN / 'model.patch').read_bytes()
assert r['patch']['sha256'] == sha(DEV / 'model.patch')
for item in r['rawCaptureReceipts']:
    p = ROOT / item['path']
    assert p.stat().st_size == item['bytes'] and sha(p) == item['sha256'], item['path']
sent = [x for x in get(RUN / 'provider-metadata.json') if x.get('forwarded')]
assert r['providerRequests'] == r['usage']['requests'] == len(sent)
assert r['requestsByKind'] == dict(collections.Counter(x['requestKind'] for x in sent))
for key in ['input_tokens', 'output_tokens', 'cached_tokens', 'reasoning_tokens']:
    values = [x['usage'][key] for x in sent if x.get('usage') and key in x['usage']]
    assert r['usage'][key] == {'observed': sum(values), 'unknown_requests': len(sent) - len(values)}
for x in sent:
    u = x.get('usage') or {}
    if 'cached_tokens' in u and 'input_tokens' in u:
        assert u['cached_tokens'] <= u['input_tokens']
    if 'reasoning_tokens' in u and 'output_tokens' in u:
        assert u['reasoning_tokens'] <= u['output_tokens']
native = get(RUN / 'native-evidence.json')
assert r['nativeTools'] == len(native['tools']) == sum(r['toolsByKind'].values())
assert r['nativeSessions'] == len(native['sessions'])
evaluation = get(LOCAL / 'evaluation/summary.json')
assert get(DEV / 'evaluation.json') == evaluation
assert evaluation['patchSha256'] == sha(DEV / 'model.patch')
assert r['contractTests'] == evaluation['contractTests'] == {
    key: sum(item['counts'][key] or 0 for item in evaluation['E'])
    for key in ['tests', 'pass', 'fail', 'skipped']
}
for item in [evaluation['applyReceipt'], *evaluation['F'], *evaluation['E'], evaluation.get('projectVerify')]:
    if item:
        assert sha(ROOT / item['file']) == item['sha256']
assert r['Q'] == get(DEV / 'assessment.json')['Q']
assessment = get(DEV / 'assessment.json')
for item in assessment['supplementalDiagnostics']['scriptReceipts']:
    assert sha(ROOT / item['path']) == item['sha256']
for observation in assessment['supplementalDiagnostics']['observations']:
    item = observation['receipt']
    assert sha(ROOT / item['path']) == item['sha256']
    assert observation['data'] == json.loads(get(ROOT / item['path'])['stdout'])
for event in get(DEV / 'trajectory.json')['selectedEvents']:
    delivered = event['delivery']
    if delivered:
        request = get(RUN / ('request-' + str(delivered['firstRequest']) + '.json'))
        item = next(x for x in request['input'] if x.get('type') == 'function_call_output' and x.get('call_id') == event['callID'])
        text = item['output'] if isinstance(item['output'], str) else json.dumps(item['output'], ensure_ascii=False)
        assert len(text.encode()) == delivered['bytes']
        assert hashlib.sha256(text.encode()).hexdigest() == delivered['sha256']
stop = get(RUN / 'stop-verification.json')
expected_T = bool(get(RUN / 'result.json').get('nativeCompleted') and stop['captureSaved'] and stop['terminationVerified'] and stop['forwardingClosed'] and stop['relayRemoved'] and stop['activeProviderHandlers'] == 0)
assert r['T'] == expected_T
assert r['D'] == (False if r['Q'] is False or r['T'] is False else True if r['Q'] is True and r['T'] is True else None)
assert r['monetaryCost'] is None
print('Frozen inputs, complete M, receipts, scoped F/E arithmetic, provider usage and Q/T/D verified.')
