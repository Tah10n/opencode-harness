"""Independent full-tree binding to the actual delivery snapshot."""
import json,hashlib
from pathlib import Path
ROOT=Path.cwd();DEV=ROOT/'development/investigation-direct-ledger-pair/inspect-full-task';LOCAL=ROOT/'local/investigation-inspect-full-task';OUT=LOCAL/'batch/runs/account-switch-ledger-I1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
expected=json.loads((OUT/'delivery-inventory.json').read_text())
# TASK.md is the unchanged host task injection, absent from the public baseline.
if 'TASK.md' in expected:
 assert expected['TASK.md']['sha256']==sha(LOCAL/'source/TASK.md')
 del expected['TASK.md']
actual={}
for p in (LOCAL/'assessment/I1/F').rglob('*'):
 rel=p.relative_to(LOCAL/'assessment/I1/F')
 if '.git' in rel.parts:continue
 if p.is_symlink():actual[str(rel)]={'link':str(p.readlink())}
 elif p.is_file():actual[str(rel)]={'sha256':sha(p),'executable':bool(p.stat().st_mode&0o111)}
assert actual==expected,{'missing':sorted(expected.keys()-actual.keys()),'extra':sorted(actual.keys()-expected.keys()),'different':[k for k in actual.keys()&expected.keys() if actual[k]!=expected[k]]}
receipt={'actualDeliveryTreeMatchesAppliedM':True,'files':len(actual),'treeSha256':hashlib.sha256(json.dumps(actual,sort_keys=True).encode()).hexdigest(),'patchSha256':sha(OUT/'model.patch'),'injectedTaskUnchangedAndExcluded':True}
(DEV/'delivery-tree.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
