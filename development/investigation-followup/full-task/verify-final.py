"""Bounded final artifact/integrity audit; no repeat of completed model or suites."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
DEV = Path(__file__).resolve().parent
LOCAL = ROOT / 'local/investigation-followup-full-task'
OUT = LOCAL / 'batch/runs/account-switch-ledger-I1'
get = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
freeze = get(LOCAL / 'batch/freeze.json')
assert sha(LOCAL / 'batch/freeze.json') == get(DEV / 'manifest.json')['freezeSha256']
for name, digest in freeze['files'].items():
    p = Path(name)
    if p.is_absolute():
        assert sha(p) == digest
    else:
        frozen = subprocess.check_output(['git', 'show', '237dbbd5434286e69053c5d857b3f1b53db056dc:' + name], cwd=ROOT)
        assert hashlib.sha256(frozen).hexdigest() == digest, name
for name, digest in freeze['historical'].items():
    assert sha(ROOT / name) == digest
for name, digest in get(DEV / 'assignment-verification.json')['unchangedCandidateFiles'].items():
    assert sha(ROOT / name) == digest

for name in ['assess.py', 'verify-delivery.py']:
    old = (ROOT / 'development/investigation-direct-ledger-pair/inspect-full-task' / name).read_text()
    new = (DEV / name).read_text().replace('development/investigation-followup/full-task', 'development/investigation-direct-ledger-pair/inspect-full-task').replace('local/investigation-followup-full-task', 'local/investigation-inspect-full-task')
    assert old == new
cost = get(DEV / 'costs.json')
assert sum(r['requests'] for r in cost['roles'].values()) == cost['requests'] == 135
for key, value in cost['total'].items():
    assert sum(r[key] for r in cost['roles'].values()) == value
assert cost['total']['cached_tokens'] <= cost['total']['input_tokens']
assert cost['total']['reasoning_tokens'] <= cost['total']['output_tokens']
assert cost['total']['unknownUsage'] == 0
records = get(OUT / 'provider-metadata.json')
verified = 0
for row in records:
    assert row['terminalResponse']['status'] == 'completed' and row['recording']['evidenceComplete']
    for key in ['clientRequest', 'upstreamRequest', 'response']:
        item = row['recording'][key]; file = OUT / item['file']
        assert file.stat().st_size == item['size'] and sha(file) == item['sha256']
        verified += 1
assert verified == 405
assessment = get(DEV / 'assessment.json')
assert sum(s['counts']['pass'] for s in assessment['F_checks'].values()) == 205
assert sum(s['counts']['tests'] for s in assessment['behavioralProbes'].values()) == 23
assert sum(s['counts']['pass'] for s in assessment['behavioralProbes'].values()) == 19
assert assessment['Q'] is False and assessment['T'] is True and assessment['D'] is False
assert sha(DEV / 'M.patch') == sha(OUT / 'model.patch') == assessment['patchSha256']
assert get(DEV / 'delivery-tree.json')['actualDeliveryTreeMatchesAppliedM']

syntax = []
for file in DEV.iterdir():
    if file.suffix == '.py':
        compile(file.read_text(), str(file), 'exec'); syntax.append(file.name)
    if file.suffix == '.mjs':
        subprocess.run(['node', '--check', str(file)], check=True); syntax.append(file.name)
    if file.suffix in ['.md', '.json', '.mjs', '.py']:
        assert all(line.rstrip() == line for line in file.read_text().splitlines()), file
    if file.is_file():
        text = file.read_text()
        assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bAKIA[A-Z0-9]{16}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}', text), file.name
subprocess.run(['git', 'diff', '--check'], cwd=ROOT, check=True)
receipt = {'passed': True, 'syntax': syntax, 'frozenExecutionCommitHashes': 'pass',
           'fixedRuntimeAndInfrastructureHashes': 'pass', 'historicalFilesUnchanged': True,
           'evaluatorScoringUnchanged': True, 'recordingFilesHashVerified': verified,
           'arithmetic': 'pass', 'MUnmodified': True, 'actualDeliveryTreeBound': True,
           'scopedWhitespace': 'pass', 'scopedCredentialPatterns': 'no matches; gitleaks unavailable on PATH',
           'finalDiffReview': 'Capture semantics correction and single exact admission only; result artifacts separate native delivery from full-task quality and preserve evaluator limits',
           'notRun': ['repeated technical matrices', 'new model repair or retry', 'full platform matrix', 'remote CI validation'],
           'fullProjectVerify': 'attempted once in offline evaluator; unavailable, not PASS'}
(DEV / 'verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'passed': True, 'recordingFiles': verified, 'syntaxFiles': len(syntax)}))
