"""Read only the indexed historical archive; emit a bounded, safe chronology.
Run from the repository root. No execution, extraction, provider or model access.
"""
import hashlib
import json
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'local/ledger-review-delivery'
DEV = ROOT / 'development/ledger-review-delivery'
sha = lambda b: hashlib.sha256(b).hexdigest()
index_bytes = (BASE / 'post-capture-followup-evidence-index.json').read_bytes()
index = json.loads(index_bytes)
archive = BASE / 'post-capture-followup-evidence.tar.gz'
assert sha(archive.read_bytes()) == index['archiveSha256']
assert index['archiveSha256'] == json.loads((DEV / 'post-capture-followup/cleanup.json').read_text())['archive']['sha256']
entries = {e['path']: e for e in index['files']}
assert len(entries) == len(index['files'])
used = set()
with tarfile.open(archive) as tar:
    assert set(tar.getnames()) == set(entries)
    for name, entry in entries.items():
        member = tar.getmember(name)
        assert member.isfile() and member.mode == entry['mode']
        data = tar.extractfile(member).read()
        assert len(data) == entry['size'] and sha(data) == entry['sha256'], name

    def read(name):
        used.add(name)
        return json.loads(tar.extractfile(name).read())

    prefix = 'real/F/runs/account-switch-ledger-F/'
    def artifact(suffix):
        names = [n for n in entries if n.startswith(prefix + 'task-artifacts/') and n.endswith('/' + suffix)]
        assert len(names) == 1
        return read(names[0])

    events = artifact('tool-events.json')
    messages = artifact('implementation-messages.json')
    initial, terminal = artifact('initial.json'), artifact('terminal.json')
    requests = {i: read(prefix + f'upstream-request-{i}.json') for i in range(3, 49)}
    task = (ROOT / 'development/plain-ledger-native-high/original-task.txt').read_text()
    environment = (ROOT / 'development/plain-ledger-native-high/environment.txt').read_text()
    review = (DEV / 'post-capture-followup/R.md').read_text()
    handoff = (DEV / 'handoff-template.txt').read_text().replace('{{VERBATIM_REVIEW_RESPONSE}}', review)
    def strings(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, list):
            for v in value:
                yield from strings(v)
        elif isinstance(value, dict):
            for v in value.values():
                yield from strings(v)
    inputs = {}
    for i, req in requests.items():
        texts = list(strings(req['input']))
        inputs[i] = {key: any(value in s for s in texts) for key, value in
                     [('originalTask', task), ('environment', environment), ('verbatimReview', review), ('handoff', handoff)]}
        assert all(inputs[i].values()), (i, inputs[i])
    start = messages[0]['info']['time']['created']
    selected = {0, 7, 8, 10, 11, 12, 13, 19, 26, 27, 47, 53, 54, 55, 58, 60, 64, 69, 70, 71, 72, 73, 74, 75, 77}
    chronology = []
    for number, event in enumerate(events):
        if number not in selected:
            continue
        deliveries = []
        for i, req in requests.items():
            for item in req['input']:
                if item.get('type') == 'function_call_output' and item.get('call_id') == event['callID']:
                    output = item['output']
                    deliveries.append({'request': i, 'sha256': sha(output.encode()),
                                       'equalsNativeOutput': output == event['output']})
        args = dict(event.get('args', {}))
        if 'patchText' in args:
            args = {'patchSha256': sha(args['patchText'].encode())}
        row = {'event': number, 'tool': event['tool'], 'callID': event['callID'],
               'relativeSeconds': round((event['startedAt'] - start) / 1000, 3),
               'startedAt': event['startedAt'], 'completedAt': event['completedAt'],
               'before': event['before'], 'after': event['after'], 'args': args,
               'nativeOutputSha256': sha(event['output'].encode()),
               'firstActualDelivery': deliveries[0] if deliveries else None,
               'exit': event.get('exit')}
        if number == 69:
            row['completeNativeOutput'] = event['output']
        chronology.append(row)
    public_messages = []
    compactions = []
    for message in messages:
        for part in message.get('parts', []):
            if part.get('type') == 'compaction':
                compactions.append({'message': message['info']['id'], 'part': part})
            # Deliberately do not read or export reasoning parts.
            if message['info']['role'] == 'assistant' and part.get('type') == 'text':
                public_messages.append({'message': message['info']['id'], 'time': part.get('time'), 'text': part['text']})
    cli = read('evaluation-final/E-cli-persistence.json')
    supplemental = read('evaluation-final/E-supplemental.json')
    result = {
        'archive': {'path': str(archive.relative_to(ROOT)), 'sha256': index['archiveSha256'],
                    'indexSha256': sha(index_bytes), 'verifiedEntries': len(entries)},
        'inputVerification': {'firstAuthorRequest': 3, 'lastAuthorRequest': 48,
                              'all46AuthorRequests': inputs[3], 'all46ExactMatchesAsserted': True,
                              'taskSha256': sha(task.encode()), 'reviewSha256': sha(review.encode())},
        'authorSession': messages[0]['info']['sessionID'], 'authorStart': start,
        'initialSnapshot': initial['snapshotSha256'], 'terminalSnapshot': terminal['snapshotSha256'],
        'deadline': read('real/F/deadline.json'), 'chain': read('real/chain-result.json'),
        'toolEventCount': len(events), 'chronology': chronology,
        'allBashCommands': [{'event': i, 'callID': e['callID'], 'command': e['args']['command'],
                             'exit': e.get('exit')} for i, e in enumerate(events) if e['tool'] == 'bash'],
        'observableAssistantMessages': public_messages, 'compactionParts': compactions,
        'independentEvidence': {
            'cliExit': cli['exitCode'],
            'cliKnownInputInPersistedMessages': '"messages":{"private-same-event"' in cli['stdout'],
            'cliKnownInputInPersistedIds': '"ids":["private-same-event"]' in cli['stdout'],
            'privacyHex': next(o for o in json.loads(supplemental['stdout'])['observations'] if o['name'] == 'privacy-hex-id')},
        'artifacts': [entries[n] for n in sorted(used)],
        'accounting': {'newProviderCalls': 0, 'newModelRuns': 0, 'newBehaviorExecutions': 0},
    }
    # Preserve only the assertion location, not the raw private receipt.
    result['independentEvidence']['cliFailureStack'] = [s.strip() for s in cli['stdout'].splitlines() if 'at snapshots' in s]
    assert result['independentEvidence']['cliKnownInputInPersistedMessages']
    assert result['independentEvidence']['cliKnownInputInPersistedIds']
    public_paths = [
        'development/plain-ledger-native-high/original-task.txt',
        'development/plain-ledger-native-high/environment.txt',
        'development/plain-ledger-native-high/cli-persistence.test.mjs',
        'development/ledger-review-delivery/D0.patch',
        'development/ledger-review-delivery/handoff-template.txt',
        'development/ledger-review-delivery/supplemental.mjs',
    ]
    public_paths += ['development/ledger-review-delivery/post-capture-followup/' + name for name in
                    ['R.md', 'F-response.md', 'M.patch', 'D0-to-final.patch', 'assessment.json',
                     'model-input-verification.json', 'selected-state.mjs', 'selected-observations.json']]
    result['publicSourceHashes'] = {p: sha((ROOT / p).read_bytes()) for p in public_paths}
    old_index = json.loads((BASE / 'private-evidence-index.json').read_text())
    old_archive = BASE / 'private-evidence.tar.gz'
    assert sha(old_archive.read_bytes()) == old_index['archiveSha256']
    assert old_index['archiveSha256'] == json.loads((DEV / 'post-capture-followup/provenance.json').read_text())['archiveSha256']
    old_used = []
    with tarfile.open(old_archive) as old_tar:
        for entry in old_index['files']:
            if entry['path'] not in ['evaluation-D0/E-cli-persistence.json', 'evaluation-D0/E-supplemental.json']:
                continue
            data = old_tar.extractfile(entry['path']).read()
            assert len(data) == entry['size'] and sha(data) == entry['sha256']
            receipt = json.loads(data)
            if 'cli-persistence' in entry['path']:
                assert receipt['exitCode'] == 1
                assert '"messages":{"private-same-event"' in receipt['stdout']
            else:
                observation = next(o for o in json.loads(receipt['stdout'])['observations'] if o['name'] == 'privacy-hex-id')
                assert observation['rawIdPersisted'] is True
            old_used.append(entry)
    assert len(old_used) == 2
    result['historicalD0Privacy'] = {'archiveSha256': old_index['archiveSha256'], 'verifiedArtifacts': old_used}
    print(json.dumps(result, indent=2, ensure_ascii=False))
