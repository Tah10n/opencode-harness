"""Offline check of the frozen full-task wrapper using preserved scripted evidence.

Does not launch OpenCode, call a provider, or change the candidate. Restores only
the two patches and seven baseline files needed for this predicate regression.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[3]
DEV = Path(__file__).resolve().parent
CANDIDATE = 'd59a527d120e4cd256ded6d8270154fbbcff5d36'
WRAPPER = 'development/investigation-direct-ledger-pair/inspect-full-task/session.mjs'
ARCHIVE = ROOT / 'local/investigation-followup-evidence.tar.gz'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def command(args, cwd=ROOT, data=None):
    return subprocess.run(args, cwd=cwd, input=data, capture_output=True, check=True).stdout


source = command(['git', 'show', CANDIDATE + ':' + WRAPPER])
# Historical baseline remains immutable after the authorized wrapper correction.
predicate = "assert.equal(resolved.patch.toString(),fs.readFileSync(out+'/model.patch','utf8'));"
assert predicate.encode() in source
assert sha(ARCHIVE.read_bytes()) == '10eed6e5cef028ada2d798a65628137e485fcd85c9a2919fbc04873e6753c5dd'

with tarfile.open(ARCHIVE) as archive:
    prefix = 'installed/scripted-input-release-check/'
    baseline = [(member, archive.extractfile(member).read())
                for member in archive.getmembers()
                if member.isfile() and member.name.startswith(prefix)]
    assert len(baseline) == 7
    collector = archive.extractfile('installed/release-check-H/model.patch').read()
    terminal = archive.extractfile('installed/release-check-H/task-artifacts/'
                                   'c904f9d6-86b4-4594-8aab-0c646f615d27/terminal.patch').read()

trees = []
with tempfile.TemporaryDirectory(prefix='ledger-full-task-wiring-') as temporary:
    for name, patch in [('terminal', terminal), ('collector', collector)]:
        folder = Path(temporary) / name
        folder.mkdir()
        for member, data in baseline:
            relative = Path(member.name.removeprefix(prefix))
            assert not relative.is_absolute() and '..' not in relative.parts
            destination = folder / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            destination.chmod(member.mode & 0o777)
        for args in [['init', '-q'], ['add', '-A'],
                     ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture',
                      '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'baseline'],
                     ['apply', '--check', '-'], ['apply', '-',], ['add', '-A']]:
            command(['git', *args], folder, patch if args[0] == 'apply' else None)
        trees.append(command(['git', 'write-tree'], folder).decode().strip())
    # Execute the exact candidate predicate, without printing synthetic diff bytes.
    (Path(temporary) / 'terminal.patch').write_bytes(terminal)
    (Path(temporary) / 'model.patch').write_bytes(collector)
    check = subprocess.run(['node', '--input-type=module', '-e',
        "import fs from 'node:fs';import assert from 'node:assert/strict';"
        "const out=process.argv[1],resolved={patch:fs.readFileSync(out+'/terminal.patch')};"
        "try{" + predicate + "console.log('accepted')}catch(e){"
        "console.log(JSON.stringify({code:e.code,operator:e.operator}));process.exitCode=3}",
        temporary], capture_output=True, text=True)
    assert check.returncode == 3
    error = json.loads(check.stdout)
    assert error['code'] == 'ERR_ASSERTION' and trees[0] == trees[1]
assert not Path(temporary).exists()

receipt = {
    'candidate': CANDIDATE,
    'scope': 'Exact capture-wrapper predicate on saved final installed scripted patches; no full matrix rerun',
    'wrapper': WRAPPER, 'wrapperSha256': sha(source), 'predicate': predicate,
    'archiveSha256': sha(ARCHIVE.read_bytes()),
    'restoredBaselineFiles': len(baseline),
    'terminalPatchSha256': sha(terminal), 'collectorPatchSha256': sha(collector),
    'patchBytesEqual': terminal == collector,
    'ordinaryGitApplyBothPassed': True, 'appliedTrees': trees,
    'appliedTreesEqual': True, 'wrapperPredicateExitCode': check.returncode,
    'wrapperError': error,
    'boundary': 'Resolver can succeed; the full-task wrapper then classifies equivalent delivery as evidence_incomplete',
    'result': 'preparation_blocked', 'realProviderCalls': 0,
    'newScriptedRequests': 0, 'newTaskRuns': 0,
    'temporaryDirectoryRemoved': True,
}
assert receipt == json.loads((DEV / 'wiring-verification.json').read_text())
print(json.dumps(receipt))
