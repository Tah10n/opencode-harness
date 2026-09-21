"""Export safe evidence and provider accounting; preserve unknown values."""
import collections
import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEV = ROOT / 'development/plain-ledger-native-high'
LOCAL = ROOT / 'local/plain-ledger-native-high'
RUN = LOCAL / 'batch/runs/account-switch-ledger-P'

def get(p):
    return json.loads(p.read_text())

def receipt(p):
    return {'path': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size,
            'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}

def timestamp(s):
    return datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))

result = get(RUN / 'result.json')
stop = get(RUN / 'stop-verification.json')
provider = get(RUN / 'provider-metadata.json')
native = get(RUN / 'native-evidence.json')
evaluation = get(LOCAL / 'evaluation/summary.json')
review = get(DEV / 'assessment.json')
sent = [r for r in provider if r.get('forwarded')]
usage = {'requests': len(sent)}
for key in ['input_tokens', 'output_tokens', 'cached_tokens', 'reasoning_tokens']:
    values = [r['usage'][key] for r in sent if r.get('usage') and key in r['usage']]
    usage[key] = {'observed': sum(values), 'unknown_requests': len(sent) - len(values)}
usage['subsetNote'] = 'Cached tokens are included in input; reasoning tokens are included in output. Do not add them again.'
usage['monetaryCost'] = None
usage['monetaryCostReason'] = 'No provider billing record supplied; no inferred dollar estimate.'
T = bool(result.get('nativeCompleted') and stop['captureSaved'] and stop['terminationVerified']
         and stop['forwardingClosed'] and stop['relayRemoved'] and stop['activeProviderHandlers'] == 0)
Q = review['Q']
D = False if Q is False or T is False else True if Q is True and T is True else None
patch = RUN / 'model.patch'
(DEV / 'model.patch').write_bytes(patch.read_bytes())
raw = [p for p in sorted(RUN.rglob('*')) if p.is_file()]
payload = {
    'stage': 'evaluated', 'slots': [{'slot': 1, 'task': 'account-switch-ledger', 'arm': 'P',
                                  'status': 'completed' if result.get('nativeCompleted') else 'stopped'}],
    'freezeCommit': get(LOCAL / 'batch/freeze-commit.json')['commit'],
    'delivery_apply': evaluation['delivery_apply'],
    'delivered_checks': evaluation['F'], 'projectVerify': evaluation.get('projectVerify'),
    'assessment_integrity': evaluation['assessment_integrity'],
    'contract_results': evaluation['E'], 'contractTests': evaluation.get('contractTests'),
    'Q': Q, 'T': T, 'D': D, 'authorRuns': 1, 'scriptedPreflights': 1,
    'scriptedProviderRequests': 8, 'scriptedRealProviderRequests': 0,
    'providerRequests': len(sent), 'requestsByKind': dict(collections.Counter(r['requestKind'] for r in sent)),
    'unknownServerCompletion': sum(r.get('serverCompletion') not in ['completed', 'failed', 'incomplete', 'known_refusal'] for r in sent),
    'usage': usage, 'nativeTools': len(native['tools']),
    'toolsByKind': dict(collections.Counter(t['data']['tool'] for t in native['tools'])),
    'nativeSessions': len(native['sessions']), 'nativeExecutionMs': result['executionElapsedMs'],
    'slotElapsedMs': round((timestamp(get(RUN / 'completed.json')['at']) - timestamp(get(RUN / 'started.json')['at'])).total_seconds() * 1000),
    'termination': stop, 'patch': receipt(patch), 'rawCaptureReceipts': [receipt(p) for p in raw],
    'modelPatchUnchanged': (DEV / 'model.patch').read_bytes() == patch.read_bytes(),
    'sourceReview': 'assessment.json', 'monetaryCost': None,
    'developingAgentAccounting': 'Preparation, evaluator and developing-agent work are separate from author usage; no reliable per-task token or billing record is exported for that work.'
}
(DEV / 'result.json').write_text(json.dumps(payload, indent=2) + '\n')
(DEV / 'evaluation.json').write_text(json.dumps(evaluation, indent=2) + '\n')
print(json.dumps({k: payload[k] for k in ['Q', 'T', 'D', 'contractTests', 'providerRequests', 'nativeTools', 'nativeSessions', 'nativeExecutionMs', 'usage']}))
