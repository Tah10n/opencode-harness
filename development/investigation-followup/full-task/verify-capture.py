"""Focused capture correction: real Git trees, preserved index, negative cases."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[3]
DEV = Path(__file__).resolve().parent
WRAPPER = ROOT / 'development/investigation-direct-ledger-pair/inspect-full-task/session.mjs'


def run(args, cwd, data=None):
    return subprocess.run(args, cwd=cwd, input=data, capture_output=True, check=True).stdout


with tarfile.open(ROOT / 'local/investigation-followup-evidence.tar.gz') as archive:
    prefix = 'installed/scripted-input-release-check/'
    files = [(m, archive.extractfile(m).read()) for m in archive.getmembers()
             if m.isfile() and m.name.startswith(prefix)]
    collector = archive.extractfile('installed/release-check-H/model.patch').read()
    terminal = archive.extractfile('installed/release-check-H/task-artifacts/'
        'c904f9d6-86b4-4594-8aab-0c646f615d27/terminal.patch').read()

with tempfile.TemporaryDirectory(prefix='capture-regression-') as temporary:
    folder = Path(temporary)
    repo = folder / 'repo'
    repo.mkdir()
    for member, data in files:
        relative = Path(member.name.removeprefix(prefix))
        assert not relative.is_absolute() and '..' not in relative.parts
        p = repo / relative
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        p.chmod(member.mode & 0o777)
    for args in [['init', '-q'], ['add', '-A'], ['-c', 'core.hooksPath=/dev/null',
                 '-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost',
                 'commit', '-qm', 'base']]:
        run(['git', *args], repo)
    baseline = run(['git', 'rev-parse', 'HEAD'], repo).decode().strip()
    run(['git', 'apply', '-'], repo, collector)
    (folder / 'terminal.patch').write_bytes(terminal)
    (folder / 'collector.patch').write_bytes(collector)
    script = r'''
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const [root,wrapper,baseline]=process.argv.slice(1),repo=path.join(root,'repo');
const {verifyCapturedPatchTrees:verify}=await import(pathToFileURL(wrapper));
const session={exec:args=>spawnSync(args[0],args.slice(1),{cwd:repo,env:{...process.env,TMPDIR:root},encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024})};
const captured={baseline,delivery:repo},terminal=fs.readFileSync(root+'/terminal.patch'),collector=fs.readFileSync(root+'/collector.patch');
const index=fs.readFileSync(repo+'/.git/index'),note=fs.readFileSync(repo+'/preserved.txt');
const positive=verify(session,captured,terminal,collector),negative=[];
const reject=(name,fn)=>{assert.throws(fn,/comparison failed/);negative.push(name);};
reject('omitted-terminal-patch',()=>verify(session,captured,Buffer.alloc(0),collector));
reject('corrupted-collector-patch',()=>verify(session,captured,terminal,Buffer.from('invalid patch')));
const value=fs.readFileSync(repo+'/value.mjs');fs.appendFileSync(repo+'/value.mjs','\n// substituted delivery\n');
reject('delivery-content-substitution',()=>verify(session,captured,terminal,collector));fs.writeFileSync(repo+'/value.mjs',value);
const mode=fs.statSync(repo+'/value.mjs').mode;fs.chmodSync(repo+'/value.mjs',mode^0o111);
reject('delivery-mode-substitution',()=>verify(session,captured,terminal,collector));fs.chmodSync(repo+'/value.mjs',mode);
assert.deepEqual(fs.readFileSync(repo+'/.git/index'),index);assert.deepEqual(fs.readFileSync(repo+'/preserved.txt'),note);
assert.deepEqual(fs.readdirSync(root).filter(n=>n.startsWith('capture-trees-')),[]);
console.log(JSON.stringify({positive,negative,indexPreserved:true,userFilePreserved:true,temporaryIndicesRemoved:true}));
'''
    result = json.loads(run(['node', '--input-type=module', '-e', script,
                             temporary, str(WRAPPER), baseline], ROOT))
assert not Path(temporary).exists()
receipt = {'passed': True, 'scope': 'Host capture helper with native execution adapter; no OpenCode/provider',
           'wrapperSha256': hashlib.sha256(WRAPPER.read_bytes()).hexdigest(),
           **result, 'realProviderCalls': 0, 'newTaskRuns': 0,
           'temporaryRepositoriesRemoved': True}
(DEV / 'capture-verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
