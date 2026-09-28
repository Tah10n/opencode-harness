"""Post-stop evidence assembly; no provider calls, implementation edits or scoring changes."""
from datetime import datetime
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
DEV = Path(__file__).resolve().parent
LOCAL = ROOT / 'local/investigation-followup-full-task'
OUT = LOCAL / 'batch/runs/account-switch-ledger-I1'
get = lambda p: json.loads(p.read_text())
sha = lambda b: hashlib.sha256(b).hexdigest()


def save(name, value):
    (DEV / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


run = get(OUT / 'result.json')
stop = get(OUT / 'stop-verification.json')
records = get(OUT / 'provider-metadata.json')
resolution = get(OUT / 'native-result-resolution.json')
trees = get(OUT / 'native-result-trees.json')
artifact = OUT / 'task-artifacts' / resolution['run']
child = get(artifact / 'investigation-result.json')
native = get(OUT / 'native-evidence.json')
integration = get(DEV / 'integration.json')
assessment = get(LOCAL / 'assessment/I1/summary.json')
watchdog = get(OUT / 'session/deadline-stop.json')
assert get(LOCAL / 'batch/outcome.json')['status'] == 'finished'
assert len(native['sessions']) == 3 and len(integration['investigatorNativeSessions']) == 1
assert all(r['forwarded'] and r['terminalResponse']['status'] == 'completed' and r['usage'] for r in records)
assert run['nativeCompleted'] and not run['timedOut'] and not run['continuationApplied']
assert all(stop[k] for k in ['terminationVerified', 'captureSaved', 'forwardingClosed', 'relayRemoved'])
assert stop['activeProviderHandlers'] == 0 and len(set(trees.values())) == 1
assert (DEV / 'M.patch').read_bytes() == (OUT / 'model.patch').read_bytes()
assert get(DEV / 'delivery-tree.json')['actualDeliveryTreeMatchesAppliedM']

# Reassemble only pages actually delivered to the author, not arbitrary disk content.
patch_pages = []
invalid = 0
for tool in native['tools']:
    data = tool['data']
    if data.get('tool') != 'harness_investigate':
        continue
    output = json.loads(data['state']['output'])
    if output.get('status') == 'invalid-cursor':
        invalid += 1
    if output.get('status') == 'page' and output.get('section') == 'patch':
        patch_pages.append(output)
patch_pages.sort(key=lambda p: p['offset'])
position = 0
for page in patch_pages:
    assert page['offset'] == position
    position += len(page['content'].encode())
reassembled = ''.join(p['content'] for p in patch_pages).encode()
assert patch_pages[-1]['complete'] and reassembled == child['patch'].encode()
assert sha(reassembled) == patch_pages[0]['sha256']
assert all(a['firstVisibleAuthorReply'] and a['allVisibleRepliesExact'] and not a['anyTruncationNotice']
           for a in integration['actions'])
assert not any(a['action'] in ['accept', 'decline'] for a in integration['actions'])
assert (artifact / 'before-investigation.patch').read_bytes() == b''
(DEV / 'child-test.patch').write_bytes(reassembled)
(DEV / 'child-explanation.md').write_text(child['explanation'] + '\n')
checks = [{'callID': c.get('callID'), 'command': c.get('args', {}).get('command'),
           'exit': c.get('exit'), 'state': c.get('state'),
           'outputSha256': sha(c.get('output', '').encode())}
          for c in child['commands'] if c.get('args', {}).get('command')]
author_edits = []
for t in native['tools']:
    d = t['data']; state = d.get('state', {}); args = state.get('input', {})
    if t['session_id'] == resolution['sessions']['author'] and d.get('tool') == 'apply_patch':
        text = args.get('patchText', '')
        if 'packages/connector/test/' in text or not author_edits:
            author_edits.append({'callID': d.get('callID'), 'time': state.get('time'),
                                 'inputSha256': sha(text.encode()),
                                 'paths': [line for line in text.splitlines() if line.startswith('*** Update File:')]})
save('child-result.json', {
    'question': child['request'], 'authorSnapshot': child['authorSnapshot'],
    'preDelegationPatchBytes': 0, 'patchSha256': sha(reassembled), 'patchBytes': len(reassembled),
    'elapsedMs': child['elapsedMs'], 'finish': child.get('finish'), 'usable': child['usable'],
    'checks': checks, 'formalDisposition': 'neither accept nor decline called',
    'receiptDeliveredExactlyInRequest': integration['actions'][0]['firstVisibleAuthorReply']['request'],
    'patchPagesDelivered': len(patch_pages), 'invalidCursorsRecovered': invalid,
    'patchReassembledExactly': True, 'explanationDeliveredFully': True,
    'checksDelivery': 'first 1024 of 2410 bytes only; no output-section inspection',
    'integration': 'Author used ordinary apply_patch for a derivative readers regression and the OpenCode config extension; no host auto-accept or Git integration of child patch',
    'authorEditEvidence': author_edits,
    'expectationAssessment': 'Persisted-ID privacy and retained usage plus a new exact-ID event follow the original task. The real child suites failed on Claude raw IDs and OpenCode 9 versus 18. Later final project tests include these regression themes and pass.',
    'limitations': 'No explicit disposition/rationale or accepted-snapshot preflight occurred. Reading and subsequent reuse do not prove causal improvement or completion of the whole task.'
})

observations = json.loads(get(LOCAL / 'assessment/I1/diagnose-current-state.json')['stdout'])['observations']
assert next(o for o in observations if o['case'] == 'corrupt-reloaded-state')['actual'] == []
assessment['F_checks'] = assessment.pop('F')
assessment['behavioralProbes'] = assessment.pop('E')
assessment['projectVerify']['classification'] = 'unavailable offline: pnpm 11.7.0 not cached; exit 1 is not PASS'
assessment['assessment_integrity'] = {
    'appliedMMatchesActualDelivery': get(DEV / 'delivery-tree.json'),
    'FAndECopiesUnchanged': True, 'privacyBytesOriginalAndIsolated': True,
    'raw23ProbeScoringUnchanged': True,
    'probeApplicabilityLimits': 'Two OpenCode probes inject serverBaseline, absent from the actual candidate/baseline producer and consumer. Their failures remain in 19/23 but are not alone proof of a real CLI regression. The conflict probe requires an exact diagnostic spelling; totals and partial status passed.',
    'frozenAdditionalObservationError': "diagnose.mjs tried assigning parserVersion on numeric ledger.version and exited 1; retained separately, not a product failure",
    'representationAdaptation': 'Supplementary observation changes only the corruption target to the version of the implementation-created ledger. No new requirement or 23-case assertion is introduced; frozen evaluator source is unchanged.',
}
assessment['contract_results'] = [
    {'contract': 'Fresh event adapters, replay, deletion, move, truncation, new events, range and components', 'result': 'pass on frozen cases', 'evidence': 'account-switch-ledger, five ledger-lifecycle cases, six CLI persistence cases; 205 project tests'},
    {'contract': 'Kimi historical 0.4.3 migration with copy and JSON reload', 'result': 'fail', 'evidence': 'After initial migration and append pass, copying the existing session doubles the accepted 2026-08-10 total from 20 to 40. No architecture-specific assertion is involved.'},
    {'contract': 'Other legacy inputs and migrations', 'result': 'pass on tested cases', 'evidence': 'Both legacy-input cases, four baseline-generated migrations and Kimi legacy StatusUpdate case; supplementary bound-source migrations'},
    {'contract': 'OpenCode exact-ID cutover and accepted history', 'result': 'mixed evidence; no blanket pass', 'evidence': 'Actual CLI config regression passes rejection/pending-before-acceptance, confirmed alias state and old 9 plus new 9 equals 18. Two serverBaseline-injection probes fail but do not use a state produced by this implementation; do not impose that experimental representation.'},
    {'contract': 'First tuple, unrelated valid events and diagnostics consumers', 'result': 'totals/partial pass; structured diagnostic absent', 'evidence': 'Conflict retains 15 plus unrelated 7 and partial. Adapter and normalizeAdapterDiagnostics return []; CLI retains/displays conflicting_usage_records through its separate warnings path. Exact diagnostic spelling is not treated as a semantic failure.'},
    {'contract': 'Corrupt implementation-created persisted state', 'result': 'fail', 'evidence': 'After collecting 15, JSON reload and ledger.version=-1, deleting the source database rows returns [] with complete status and no rejection. This is the implementation own state, not calibration data.'},
    {'contract': 'Account/source boundaries and state propagation', 'result': 'pass on tested cases', 'evidence': 'Six actual CLI persistence cases and same-event account-remap observation; project config persistence checks'},
    {'contract': 'Privacy', 'result': 'pass on tested cases', 'evidence': 'Isolated unchanged CLI privacy 3/3 with real nonzero usage and persisted state, 64-hex provider-ID observation, affected Claude security 1/1'},
    {'contract': 'Bounded scans/storage and retention', 'result': 'finite bounds present; exhaustive saturation not tested', 'evidence': '65,536 event cap and 16 MiB event/legacy bounds in shared collector; existing bounded scans; range tests pass. Invalid loaded entries can be skipped; corruption failure is separately recorded.'},
    {'contract': 'Public parser APIs, tests and unrelated scope', 'result': 'preserved on covered paths', 'evidence': 'Legacy parser cases and 205/205 suites; 11 connector adapter/test/README files only, no server/account-discovery/version changes'}
]
assessment.update({'supplementalObservations': observations, 'Q': False, 'T': True, 'D': False,
                   'internalDirectStatus': run['workflowStatus'], 'noRepairApplied': True,
                   'legacyExperimentalSavedState': 'not required: incompatible internal representation; use actual generated-state and 0.4.3 fixtures'})
save('assessment.json', assessment)

last = records[-1]
save('timing.json', {'clockContract': 'Wall timestamps for correlation; paired performance.now values for elapsed measurements. No deadline expired.',
    'scheduler': stop['timing'], 'native': run['timing'], 'independentStop': watchdog,
    'executionElapsedMs': run['executionElapsedMs'], 'runnerCleanupElapsedMs': run['cleanupElapsedMs'],
    'runnerElapsedMs': run['elapsedMs'], 'childElapsedMsIncluded': child['elapsedMs'],
    'lastDispatch': {'at': last['forwardedAt'], 'remainingMs': last['maxDurationMs'], 'request': last['requestIndex']},
    'normalCompletionBeforeDeadline': True, 'deadlineTriggered': False,
    'stopMechanism': 'normal_cleanup; confirmed no owned workload to kill',
    'independentStopElapsedMs': watchdog['stopSettled']['monotonicMs'] - watchdog['cancellationStarted']['monotonicMs'],
    'captureElapsedMs': stop['timing']['captureFinished']['monotonicMs'] - stop['timing']['captureStarted']['monotonicMs'],
    'containerCleanupElapsedMs': stop['timing']['cleanupFinished']['monotonicMs'] - stop['timing']['cleanupStarted']['monotonicMs'],
    'historical4087SecondsUnchanged': True})
delivery = get(DEV / 'delivery.json'); delivery['T'] = True; delivery['appliedTrees'] = trees
save('delivery.json', delivery)
save('result.json', {'assignment': 'investigation-followup-full-task', 'slot': 1, 'attemptStarted': True,
    'status': 'finished_with_incomplete_task', 'delivery_apply': True,
    'F_checks': {'pass': 205, 'tests': 205}, 'behavioralProbes': {'pass': 19, 'tests': 23},
    'privacy': {'pass': 3, 'tests': 3}, 'assessment_integrity': 'verified with explicit probe/observation limitations',
    'contract_results': 'assessment.json', 'Q': False, 'T': True, 'D': False,
    'investigatorDisposition': 'no formal accept/decline; inspected and manually reused in part',
    'M': {'file': 'M.patch', 'bytes': 40460, 'sha256': sha((DEV / 'M.patch').read_bytes())},
    'interpretation': 'Real receipt/inspect/recovery and host delivery work; partial manual test reuse, incomplete whole task, no full-flow win or causal lift',
    'furtherModelRuns': 0})
outputs = get(OUT / 'native-output/manifest.json')
assert outputs['evidenceComplete'] and not outputs['errors']
save('receipts.json', {'executionFreezeCommit': '237dbbd5434286e69053c5d857b3f1b53db056dc',
    'runtimeCandidate': 'd59a527d120e4cd256ded6d8270154fbbcff5d36',
    'input': get(OUT / 'input-verification.json'), 'capture': get(OUT / 'evidence-capture.json'),
    'resolver': resolution, 'trees': trees, 'stop': stop,
    'nativeOutputRetention': {'evidenceComplete': True, 'externalOutputFiles': len(outputs['files']), 'bytes': outputs['bytes'], 'note': 'No external output files were produced; native tool/check texts remain in task artifacts and request recording.'},
    'requests': 135, 'knownCompleted': 135, 'knownUsage': 135, 'unknownUsage': 0,
    'investigatorSessions': 1, 'originalTaskAndEnvironmentInAuthorAndChildRequests': True,
    'childFullPatchActuallyDelivered': True, 'noOperatorMessages': True})
print(json.dumps({'Q': False, 'T': True, 'D': False, 'patchPages': len(patch_pages), 'invalidCursorRecoveries': invalid}))
