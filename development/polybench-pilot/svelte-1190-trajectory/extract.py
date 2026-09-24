#!/usr/bin/env python3
"""Read-only, bounded extraction of retained Svelte 1190 events; JSON to stdout.
Run from this worktree: python3 development/polybench-pilot/svelte-1190-trajectory/extract.py
No execution of captured commands, model requests, builds, or patch application on disk.
"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[3]
HIST = '9317ccc9e2e3af6cfe7e876acd4541f3e7445f3b'
START = '2ac25116ec2d16d4c73eb0c3c6749a2ab588149b'
INSTANCE = 'sveltejs__svelte-1190'
BASE = ROOT / 'local/polybench-pilot'
RUN = BASE / 'batch/runs' / (INSTANCE + '-H1')
ELEMENT = 'src/generators/nodes/Element.ts'
SAMPLE = 'test/runtime/samples/event-handler-event-methods/'
refs = {}

def sha(b):
    return hashlib.sha256(b).hexdigest()

def read(p):
    b = p.read_bytes()
    refs[str(p.relative_to(ROOT))] = sha(b)
    return b

def js(p):
    return json.loads(read(p))

def gitfile(commit, name):
    b = subprocess.check_output(['git', 'show', f'{commit}:{name}'], cwd=ROOT)
    refs[f'git:{commit}:{name}'] = sha(b)
    return b

def millis(s):
    return round(dt.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() * 1000)

def blob(b):
    return hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()

started = js(RUN / 'started.json')
assert (started['slot'], started['task'], started['arm']) == (16, INSTANCE, 'H1')
meta = js(RUN / 'provider-metadata.json')
assert len(meta) == 67 and all(x['serverCompletion'] == 'completed' for x in meta)
# maxDuration is evaluated after at and before forwardedAt (pinned scheduler).
deadline_lo = max(millis(x['at']) + x['maxDurationMs'] for x in meta)
deadline_hi = min(millis(x['forwardedAt']) + x['maxDurationMs'] for x in meta)
assert deadline_lo == deadline_hi
D = deadline_lo
T0 = D - 1800000
artifact_dirs = list((RUN / 'task-artifacts').iterdir())
assert len(artifact_dirs) == 1
ART = artifact_dirs[0]
initial = js(ART / 'initial.json')
events = js(ART / 'tool-events.json')
assert len(events) == 163
assert sum(e['state'] == 'completed' for e in events) == 158
assert sum(e['state'] == 'error' for e in events) == 5
assert all(a['after'] == b['before'] and a['completedAt'] <= b['completedAt']
           for a, b in zip(events, events[1:]))
native = js(RUN / 'native-evidence.json')
assert len(native['sessions']) == 2
session = next(s for s in native['sessions'] if s['parent_id'])
assert session['directory'].endswith('/' + ART.name + '/worktree')
tools = {x['data']['callID']: x for x in native['tools']}
assert len(tools) == len(native['tools'])
requests = [js(RUN / f'request-{i}.json') for i in range(1, 68)]
delivered = {}
messages = []
seen = set()
for i, r in enumerate(requests, 1):
    for x in r['input']:
        if x.get('type') == 'function_call_output':
            delivered.setdefault(x['call_id'], (i, x['output']))
        if x.get('role') == 'assistant' and x.get('type') != 'reasoning':
            texts = x.get('content', [])
            if isinstance(texts, list):
                for c in texts:
                    if c.get('type') == 'output_text' and c['text'] not in seen:
                        seen.add(c['text'])
                        messages.append({'first_request': i, 'text': c['text']})
terminal_items = []
for line in read(RUN / 'response-67.sse').decode().splitlines():
    if not line.startswith('data: '):
        continue
    try:
        x = json.loads(line[6:])
    except json.JSONDecodeError:
        continue
    if x.get('type') == 'response.output_item.done' and x['item']['type'] in ('message', 'function_call'):
        terminal_items.append(x['item'])

manifest = json.loads(gitfile(START, 'development/polybench-pilot/frozen-manifest.json'))
mt = next(x for x in manifest['tasks'] if x['instance_id'] == INSTANCE)
archive = BASE / 'author-inputs' / INSTANCE / 'base.tar'
assert sha(read(archive)) == mt['archives']['base.tar']
with tarfile.open(archive) as tar:
    names = [ELEMENT, SAMPLE + 'main.html', SAMPLE + '_config.js', 'package.json',
             'test/test.js', 'test/setup.js', 'test/helpers.js', 'test/runtime/index.js', 'test/server-side-rendering/index.js', 'mocha.opts', 'rollup.config.js']
    baseline = {n: tar.extractfile(n).read() for n in names}
patch = gitfile(HIST, 'development/polybench-pilot/results/patches/H1/' + INSTANCE + '.patch')
assert patch == read(RUN / 'model.patch')
assert patch == gitfile(START, 'development/polybench-pilot/results/patches/H1/' + INSTANCE + '.patch')
provenance = []
for name, b in baseline.items():
    assert read(BASE / 'author-inputs' / INSTANCE / 'source' / name) == b
    if name.startswith(SAMPLE):
        assert read(ART / 'original-tests' / name) == b
        assert ('diff --git a/' + name + ' ') not in patch.decode()
    provenance.append({'path': name, 'baseline_sha256': sha(b), 'baseline_blob_sha1': blob(b),
                       'delivery_unchanged': ('diff --git a/' + name + ' ') not in patch.decode()})

# Replay ONLY the exact Element.ts text edits, in memory, with unique exact context.
# Bash writes are separately inventoried; none target this file.
text = baseline[ELEMENT].decode()
read_lines = re.findall(r'^\d+: ?(.*)$', events[14]['output'], re.M)
assert '\n'.join(read_lines) + '\n' == text
states = []
for i, e in enumerate(events):
    a = e.get('args', {})
    if e['tool'] != 'apply_patch':
        continue
    p = a['patchText']
    marker = '*** Update File: ' + ELEMENT + '\n'
    if marker not in p:
        continue
    body = p.split(marker, 1)[1].split('\n*** ', 1)[0] + '\n'
    before = sha(text.encode())
    for hunk in re.split(r'^@@[^\n]*\n', body, flags=re.M)[1:]:
        old, new = [], []
        for line in hunk.splitlines(keepends=True):
            if line.startswith((' ', '-')):
                old.append(line[1:])
            if line.startswith((' ', '+')):
                new.append(line[1:])
        old, new = ''.join(old), ''.join(new)
        assert old and text.count(old) == 1, ('ambiguous hunk', i)
        text = text.replace(old, new, 1)
    states.append({'event_index': i, 'call_id': e['callID'], 'start_ms': e['startedAt'],
                   'end_ms': e['completedAt'], 'relative_start_s': round((e['startedAt']-T0)/1000, 3),
                   'remaining_at_end_s': round((D-e['completedAt'])/1000, 3),
                   'edit_receipt_first_request': delivered[e['callID']][0],
                   'recorded_before_snapshot': e['before'], 'recorded_after_snapshot': e['after'],
                   'reconstructed_element_before_sha256': before,
                   'reconstructed_element_after_sha256': sha(text.encode()),
                   'unconditional_class_skip': 'if (attr === classAttribute) return;' in text})
idx = re.search(r'diff --git a/' + re.escape(ELEMENT) + r'.*?\nindex ([a-f0-9]+)\.\.([a-f0-9]+)', patch.decode(), re.S)
assert idx[1] == blob(baseline[ELEMENT]) and idx[2] == blob(text.encode()), (idx.groups(), blob(baseline[ELEMENT]), blob(text.encode()))
# The historical diff read gives a second independent binding to the late implementation.
late = events[153]['output']
assert idx[2].startswith(re.search(r'diff --git a/' + re.escape(ELEMENT) + r'.*?\nindex [a-f0-9]+\.\.([a-f0-9]+)', late, re.S)[1])
checks = []
for i, e in enumerate(events):
    if e['tool'] != 'bash':
        continue
    a = e['args']
    if not any(x in a['command'] for x in ('npm test', 'mocha', 'npm run lint')):
        continue
    t = tools[e['callID']]
    assert t['session_id'] == session['id']
    s = t['data']['state']; m = s.get('metadata', {})
    delivery = delivered.get(e['callID'])
    assert delivery is not None and delivery[1] == e['output'] == s['output']
    assert e['startedAt'] <= e['completedAt']
    checks.append({'event_index': i, 'call_id': e['callID'], 'command': a['command'],
                   'cwd': session['directory'], 'timeout_ms': a.get('timeout'),
                   'start_ms': e['startedAt'], 'end_ms': e['completedAt'],
                   'relative_start_s': round((e['startedAt']-T0)/1000, 3),
                   'relative_end_s': round((e['completedAt']-T0)/1000, 3),
                   'remaining_at_end_s': round((D-e['completedAt'])/1000, 3),
                   'before': e['before'], 'after': e['after'], 'exit': m.get('exit'),
                   'signal': e.get('signal'), 'timeout_observation': e.get('timeout'),
                   'state': s['status'], 'counts': re.findall(r'\d+ (?:passing|pending|failing)', e['output']),
                   'truncated': m.get('truncated'), 'full_output_path': m.get('outputPath'),
                   'output_sha256': sha(e['output'].encode()), 'first_request': delivery[0],
                   'request_at': meta[delivery[0]-1]['at'],
                   'target_runtime_failure_in_delivered_output': "Cannot read properties of null (reading 'dispatchEvent')" in delivery[1]})
last = native['tools'][-1]
s = last['data']['state']
assert s['status'] == 'running' and last['data']['callID'] not in delivered
assert 'event-handler-event-methods' not in s['metadata']['output']
assert not any(c['target_runtime_failure_in_delivered_output'] for c in checks)
assert all('event-handler-event-methods' not in c['command'] for c in checks)

comparison = []
for arm in ('P', 'H0'):
    other = RUN.with_name(INSTANCE + '-' + arm)
    n = js(other / 'native-evidence.json')
    pp = gitfile(HIST, 'development/polybench-pilot/results/patches/' + arm + '/' + INSTANCE + '.patch')
    rows = []
    pending_serializer = False
    other_requests = {}
    for f in sorted(other.glob('request-*.json'), key=lambda p: int(p.stem.split('-')[1])):
        # Only extract delivery of bounded selected tool outputs, not reasoning.
        r = json.loads(f.read_bytes())
        for x in r['input']:
            if x.get('type') == 'function_call_output':
                other_requests.setdefault(x['call_id'], (f, x['output']))
    for t in n['tools']:
        d = t['data']; st = d['state']; a = st.get('input', {})
        if d['tool'] == 'apply_patch' and ELEMENT in a.get('patchText', ''):
            pending_serializer = True
            rows.append({'call_id': d['callID'], 'time': st.get('time'),
                         'patch_sha256': sha(a['patchText'].encode()),
                         'adds_unconditional_skip': '+\t\t\t\tif (attr === classAttribute) return;' in a['patchText']})
        if d['tool'] == 'bash' and any(c in a.get('command', '') for c in ('npm test', 'mocha')) and (pending_serializer or '--grep' not in a['command']):
            pending_serializer = False
            out = st.get('output', '')
            delivery = other_requests.get(d['callID'])
            if delivery:
                assert delivery[1] == out
                read(delivery[0])
            rows.append({'call_id': d['callID'], 'command': a['command'], 'time': st.get('time'),
                         'state': st['status'], 'exit': st.get('metadata', {}).get('exit'),
                         'first_request': delivery[0].name if delivery else None,
                         'event_sample_lines': [l for l in out.splitlines() if 'event-handler-event-methods' in l],
                         'counts': re.findall(r'\d+ (?:passing|pending|failing)', out)})
    comparison.append({'arm': arm, 'serializer_and_full_checks_only': rows,
                       'patch_sha256': sha(pp), 'unconditional_skip_in_patch': b'+\t\t\t\tif (attr === classAttribute) return;' in pp})

for name in ('development/polybench-pilot/REPORT.md', 'development/polybench-pilot/two-world-diagnostic/REPORT.md',
             'development/polybench-pilot/two-world-diagnostic/evidence/failure-analysis.json',
             'development/native-task-ab/run-comparison.mjs', 'development/native-task-abc/native-run.mjs',
             'development/polybench-pilot/run.mjs', 'development/polybench-pilot/capture.mjs'):
    gitfile(START, name)

out = {'scope': INSTANCE + '/H1; saved evidence only', 'start_commit': START, 'output_commit': HIST,
       'runtime_commit': manifest['runtimeSha'], 'slot': 16, 'author_session': session,
       'parent_session': session['parent_id'], 'task_artifact_id': ART.name,
       'session_first_messages': [{'session_id': sid, 'message_id': next(m['id'] for m in native['messages'] if m['session_id']==sid),
                                   'created_ms': next(m['data']['time']['created'] for m in native['messages'] if m['session_id']==sid)}
                                  for sid in (session['parent_id'], session['id'])],
       'clock': {'slot_started_at': started['at'], 'budget_start_ms_derived': T0,
                 'deadline_ms_derived': D, 'method': 'intersection of [at+maxDurationMs, forwardedAt+maxDurationMs] for all 67 scheduler records; budget=1800s',
                 'precision_limit': 'same-host wall timestamps, not an independent measurement of process instruction times'},
       'baseline': {'upstream_commit': mt['base_commit'], 'prepared_commit': initial['base'],
                    'initial_snapshot': initial['snapshotSha256'], 'archive_sha256': mt['archives']['base.tar'],
                    'files': provenance, 'package_scripts': json.loads(baseline['package.json'])['scripts']},
       'element_edits': states, 'element_final_sha256': sha(text.encode()),
       'element_final_blob_sha1': blob(text.encode()), 'checks': checks,
       'bash_noncheck_commands': [{'event_index': i, 'call_id': e['callID'], 'command': e['args']['command'],
                                  'before': e['before'], 'after': e['after']}
                                 for i, e in enumerate(events) if e['tool']=='bash' and not any(c['event_index']==i for c in checks)],
       'author_messages': messages, 'last_provider_items': terminal_items,
       'last_provider': {k: meta[-1][k] for k in ('requestIndex','at','forwardedAt','finishedAt','responseId','responseStatus','serverCompletion','clientDelivery')},
       'unfinished_full_test': {'call_id': last['data']['callID'], 'session': last['session_id'],
                               'input': s['input'], 'state': s['status'], 'start_ms': s['time']['start'],
                               'remaining_at_start_s': round((D-s['time']['start'])/1000,3),
                               'exit': None, 'completed_at': None, 'delivered_in_next_request': False,
                               'native_partial_output_sha256': sha(s['metadata']['output'].encode()),
                               'native_partial_output_chars': len(s['metadata']['output']),
                               'native_partial_output_tail': s['metadata']['output'][-150:]},
       'stop': js(RUN/'session/finished.json'), 'cleanup': js(RUN/'session/cleanup.json'),
       'stop_verification': js(RUN/'stop-verification.json'),
       'comparison': comparison,
       'limits': ['Ignored compiler outputs were not archived; build logs plus runner imports are historical evidence, not archived build hashes.',
                  'Whole intermediate trees not reconstructed: recorded snapshot IDs are references, not independently recomputed hashes.',
                  'Native live output has no per-line timestamp or flush guarantee; no process-complete stdout for unfinished npm test.',
                  'Full truncation output path is container-local and absent from retained capture; only retained fragments can be verified.',
                  'No hidden reasoning inspected or inferred; only function calls, tool outputs and public assistant text are extracted.'],
       'current_stage': {'project_test_executions': 0, 'builds': 0, 'containers': 0, 'provider_calls': 0},
       'originals_sha256': refs}
print(json.dumps(out, ensure_ascii=False, indent=2))
