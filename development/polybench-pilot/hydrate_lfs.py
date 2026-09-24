"""Preserve baseline LFS assets only when their bytes match committed OIDs."""
import argparse,hashlib,json,re,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'local/polybench-pilot'
p=argparse.ArgumentParser();p.add_argument('instance_id');args=p.parse_args();folder=LOCAL/'author-inputs'/args.instance_id
record=folder/'lfs-audit.json'
if record.exists():raise RuntimeError('Existing LFS audit must be inspected, not overwritten')
audit=json.loads((folder/'audit.json').read_text());pointers={}
archives=[('base.tar','')]+[(r['archive'],r['path']+'/') for r in audit.get('submodules',[])]
for archive,prefix in archives:
 with tarfile.open(folder/archive) as tar:
  for member in tar.getmembers():
   if not member.isfile() or member.size>1024:continue
   data=tar.extractfile(member).read()
   match=re.fullmatch(rb'version https://git-lfs.github.com/spec/v1\noid sha256:([a-f0-9]{64})\nsize ([0-9]+)\n',data)
   if match:pointers[prefix+member.name]={'oid':match[1].decode(),'size':int(match[2]),'pointer_sha256':hashlib.sha256(data).hexdigest()}
if pointers:
 image=audit['image']['digest'];archive=folder/'lfs-assets.tar'
 with archive.open('xb') as out:
  subprocess.run(['docker','run','--rm','--platform','linux/amd64','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--pids-limit','64',image,'tar','-C','/testbed','-cf','-',*pointers],stdout=out,check=True)
 with tarfile.open(archive) as tar:
  for member in tar.getmembers():
   if not member.isfile() or member.name not in pointers:raise RuntimeError('Unexpected LFS archive entry')
   data=tar.extractfile(member).read();sha=hashlib.sha256(data).hexdigest();expected=pointers[member.name]
   if sha==expected['oid'] and len(data)==expected['size']:expected['state']='materialized_matching_oid'
   elif sha==expected['pointer_sha256']:expected['state']='pointer_in_official_image'
   else:raise RuntimeError('Image LFS asset does not match base_commit pointer: '+member.name)
   expected['actual_sha256']=sha
  tar.extractall(folder/'source',filter='data')
record.write_text(json.dumps({'instance_id':args.instance_id,'files':pointers,'verified':True},indent=2))
print(args.instance_id+' LFS assets verified: '+str(len(pointers)))
