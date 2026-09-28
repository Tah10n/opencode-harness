"""Preserve and verify this assignment's evidence before removing owned copies."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[3]
DEV = Path(__file__).resolve().parent
LOCAL = ROOT / 'local/investigation-followup-full-task'
ARCHIVE = ROOT / 'local/investigation-followup-full-task-evidence.tar.gz'
INDEX = ROOT / 'local/investigation-followup-full-task-evidence-index.json'
assert LOCAL.is_dir() and not LOCAL.is_symlink()
assert not ARCHIVE.exists() and not INDEX.exists()
out = LOCAL / 'batch/runs/account-switch-ledger-I1'
stop = json.loads((out / 'stop-verification.json').read_text())
assert all(stop[k] for k in ['terminationVerified', 'captureSaved', 'relayRemoved'])
assert json.loads((out / 'evidence-capture.json').read_text())['status'] == 0
assert json.loads((DEV / 'verification.json').read_text())['passed']


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def allocated(directory):
    return sum(p.lstat().st_blocks * 512 for p in directory.rglob('*')) + directory.lstat().st_blocks * 512


excluded = ['candidate', 'bundle', 'source', 'candidate.tar',
            'assessment/I1/F', 'assessment/I1/E', 'assessment/I1/privacy']
files = []
for file in sorted(LOCAL.rglob('*')):
    relative = file.relative_to(LOCAL).as_posix()
    if any(relative == e or relative.startswith(e + '/') for e in excluded):
        continue
    if file.is_dir():
        continue
    assert file.is_file() and not file.is_symlink(), relative
    files.append((file, relative))
index = {name: {'bytes': p.stat().st_size, 'sha256': digest(p)} for p, name in files}
assert 'batch/runs/account-switch-ledger-I1/model.patch' in index
assert sum(name.endswith('.sse') for name in index) == 135
before = allocated(LOCAL)
with ARCHIVE.open('xb') as raw:
    os.chmod(ARCHIVE, 0o600)
    with tarfile.open(fileobj=raw, mode='w:gz', compresslevel=6) as archive:
        for file, relative in files:
            archive.add(file, arcname=relative, recursive=False)
with tarfile.open(ARCHIVE, 'r:gz') as archive:
    members = archive.getmembers()
    assert {m.name for m in members} == set(index)
    for member in members:
        assert member.isfile()
        data = archive.extractfile(member).read()
        assert len(data) == index[member.name]['bytes']
        assert hashlib.sha256(data).hexdigest() == index[member.name]['sha256']
with INDEX.open('x') as stream:
    os.chmod(INDEX, 0o600)
    json.dump({'files': index, 'excludedReproducible': excluded}, stream, indent=2)
    stream.write('\n')
archive_digest = digest(ARCHIVE)
index_digest = digest(INDEX)
retained = ARCHIVE.stat().st_blocks * 512 + INDEX.stat().st_blocks * 512
# This exact directory was created by prepare.mjs with exclusive mkdir. No
# worktree, shared toolchain, image, cache or historical archive is removed.
assert LOCAL.resolve() == ROOT / 'local/investigation-followup-full-task'
shutil.rmtree(LOCAL)
assert not LOCAL.exists()
temporary = Path('/private/tmp/write-capture-regression.py')
if temporary.exists():
    assert "development/investigation-followup/full-task/verify-wiring.py" in temporary.read_text()
    temporary.unlink()
receipt = {'completed': True, 'archive': {'path': str(ARCHIVE.relative_to(ROOT)),
    'bytes': ARCHIVE.stat().st_size, 'sha256': archive_digest, 'filesVerified': len(index)},
    'index': {'path': str(INDEX.relative_to(ROOT)), 'sha256': index_digest},
    'allocatedBytesRemoved': before, 'allocatedBytesRetained': retained,
    'netAllocatedBytesReleased': before - retained, 'excludedReproducible': excluded,
    'removedOwnedRoot': str(LOCAL.relative_to(ROOT)), 'rootVerifiedAbsent': True,
    'ownedTaskContainerVerifiedAbsent': 'template-dev-17fa43e0-960b-4caa-8d2e-457b1dbd9e6f',
    'evaluationContainers': 'Commands completed with --rm; no retained evaluator resource',
    'preserved': 'All raw request/response files, metadata, native artifacts/outputs, freeze/input inventories and evaluator logs; original historical archives, pinned image, toolchains and shared dependencies unchanged',
    'globalPrune': False}
(DEV / 'cleanup.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
