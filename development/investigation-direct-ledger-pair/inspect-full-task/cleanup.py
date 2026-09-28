"""Archive all unique task evidence, verify every entry, remove only owned copies."""
import hashlib,json,os,shutil,tarfile
from pathlib import Path
ROOT=Path.cwd();BASE=ROOT/'local/investigation-inspect-full-task';DEV=ROOT/'development/investigation-direct-ledger-pair/inspect-full-task'
assert BASE.is_dir() and not BASE.is_symlink()
assert json.loads((BASE/'batch/runs/account-switch-ledger-I1/stop-verification.json').read_text())['relayRemoved']
containers=json.loads((BASE/'containers-absent.json').read_text());assert len(containers['verifiedAbsent'])==2
archive=ROOT/'local/investigation-inspect-full-task-evidence.tar.gz';index_path=ROOT/'local/investigation-inspect-full-task-evidence-index.json'
assert not archive.exists() and not index_path.exists()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
# Reproducible source/dependency/assessment copies have already been bound to M.
exclude={'candidate','candidate.tar','bundle','source','assessment/I1/F','assessment/I1/E','assessment/I1/privacy'}
selected=[];index={};allocated=sum(p.lstat().st_blocks*512 for p in BASE.rglob('*') if p.is_file() and not p.is_symlink())
for p in sorted(BASE.rglob('*')):
 rel=p.relative_to(BASE).as_posix()
 if any(rel==x or rel.startswith(x+'/') for x in exclude):continue
 if p.is_symlink():index[rel]={'symlink':os.readlink(p)};selected.append(p)
 elif p.is_file():index[rel]={'bytes':p.stat().st_size,'sha256':sha(p),'mode':p.stat().st_mode&0o777};selected.append(p)
with tarfile.open(archive,'w:gz') as tar:
 for p in selected:tar.add(p,arcname=p.relative_to(BASE).as_posix(),recursive=False)
os.chmod(archive,0o600)
with tarfile.open(archive,'r:gz') as tar:
 members=tar.getmembers();assert len(members)==len(index)
 for member in members:
  expected=index[member.name]
  if member.issym():assert member.linkname==expected['symlink']
  else:
   data=tar.extractfile(member).read();assert len(data)==expected['bytes'] and hashlib.sha256(data).hexdigest()==expected['sha256'];assert member.mode==expected['mode']
index_path.write_text(json.dumps(index,indent=2)+'\n');os.chmod(index_path,0o600)
# Confirm irreplaceable bytes in the verified archive before deleting their source.
run='batch/runs/account-switch-ledger-I1/'
for name in ['model.patch','native-evidence.json','delivery-inventory.json','candidate.tar','native-output/manifest.json','provider-metadata.json','recording-config.json','response-130.sse']:
 assert run+name in index,name
assert index[run+'model.patch']['sha256']==sha(DEV/'M.patch')
assert all(run+f'{prefix}-{i}.{suffix}' in index for i in range(1,131) for prefix,suffix in [('request','json'),('upstream-request','json'),('response','sse')])
archive_hash=sha(archive)
shutil.rmtree(BASE)
assert not BASE.exists()
retained=archive.stat().st_blocks*512+index_path.stat().st_blocks*512
receipt={'completed':True,'containersVerifiedAbsent':containers['verifiedAbsent'],'archive':{'path':str(archive.relative_to(ROOT)),'sha256':archive_hash,'bytes':archive.stat().st_size,'entriesVerified':len(index)},'index':{'path':str(index_path.relative_to(ROOT)),'sha256':sha(index_path)},'allocatedBytesRemoved':allocated,'allocatedBytesRetained':retained,'netAllocatedBytesReleased':allocated-retained,'removed':[str(BASE.relative_to(ROOT))],'preserved':'all unique private request/response/native/child evidence and assessment receipts in verified archive; public partial M and child patch; shared baseline, caches, image and historical runs untouched','globalPrune':False}
(DEV/'cleanup.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
