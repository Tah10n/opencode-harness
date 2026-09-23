"""Retain unique follow-up evidence; remove only verified task-owned copies."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

repo = Path(__file__).resolve().parents[3]
base = repo / 'local/ledger-review-delivery'
root = base / 'post-capture-followup'
dev = repo / 'development/ledger-review-delivery/post-capture-followup'
assert (root / 'real/chain-result.json').is_file(), 'Cannot clean an active chain'
assert (dev / 'delivery-receipt.json').is_file()
assert (dev / 'assessment.json').is_file()
names = []
for run in ['scripted', 'scripted-corrected', 'real']:
    for p in (root / run).glob('*/runs/*/session/container.json'):
        name = json.loads(p.read_text())['name']
        r = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True)
        assert r.returncode != 0 and 'no such object' in r.stderr.lower(), name
        names.append(name)
archive = base / 'post-capture-followup-evidence.tar.gz'
assert not archive.exists()
excluded_roots = {'history', 'D0', 'D0-integrity', 'fixture-baseline', 'fixture-baseline-corrected'}
files = []
for p in sorted(root.rglob('*')):
    rel = p.relative_to(root)
    parts = rel.parts
    if parts[0] in excluded_roots:
        continue
    if parts[0].startswith('evaluation-') and any(v in {'F', 'E'} for v in parts[1:]):
        continue
    if parts[0] in {'scripted', 'scripted-corrected', 'real'} and any(v in {'input', 'final', 'portable', 'partial-final', 'partial-portable'} for v in parts[1:]):
        continue
    if any(v.startswith('apply-') for v in parts):
        continue
    if p.is_dir():
        continue
    assert p.is_file() and not p.is_symlink(), p
    files.append(p)
index = []
with tarfile.open(archive, 'w:gz') as t:
    for p in files:
        b = p.read_bytes()
        rel = str(p.relative_to(root))
        index.append({'path': rel, 'size': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'mode': p.stat().st_mode & 0o777})
        t.add(p, arcname=rel, recursive=False)
os.chmod(archive, 0o600)
with tarfile.open(archive, 'r:gz') as t:
    members = t.getmembers()
    assert len(members) == len(index)
    for m, e in zip(members, index):
        assert m.isfile() and m.name == e['path'] and m.mode == e['mode']
        b = t.extractfile(m).read()
        assert len(b) == e['size'] and hashlib.sha256(b).hexdigest() == e['sha256']
archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
(base / 'post-capture-followup-evidence-index.json').write_text(json.dumps({'archiveSha256': archive_hash, 'files': index}, indent=2) + '\n')
# The restored history is already retained in the unchanged historical archive.
historical = json.loads((base / 'private-evidence-index.json').read_text())['archiveSha256']
assert hashlib.sha256((base / 'private-evidence.tar.gz').read_bytes()).hexdigest() == historical
paths = [root, base / 'author-bundle', base / 'reviewer-bundle', base / 'baseline']
def allocated(p):
    return sum(f.lstat().st_blocks * 512 for f in p.rglob('*') if f.is_file() and not f.is_symlink())
before = sum(allocated(p) for p in paths)
for p in paths:
    assert p.parent == base and p.exists() and not p.is_symlink()
    shutil.rmtree(p)
for name in ['prepared.json', 'author-config.json', 'reviewer-config.json']:
    p = base / name
    prior = next(e for e in json.loads((base / 'private-evidence-index.json').read_text())['files'] if e['path'] == name)
    assert hashlib.sha256(p.read_bytes()).hexdigest() == prior['sha256']
    p.unlink()
receipt = {'completed': True, 'containersVerifiedAbsent': names, 'archive': {'path': str(archive.relative_to(repo)), 'sha256': archive_hash, 'bytes': archive.stat().st_size, 'entriesVerified': len(index)}, 'historicalArchiveUnchanged': historical, 'allocatedBytesRemoved': before, 'netAllocatedBytesReleased': before - archive.stat().st_blocks * 512 - (base / 'post-capture-followup-evidence-index.json').stat().st_blocks * 512, 'removed': [str(p.relative_to(repo)) for p in paths], 'preserved': 'two verified private archives and indexes; public patches and receipts; shared runtime/image/dependencies untouched', 'globalPrune': False}
(dev / 'cleanup.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
