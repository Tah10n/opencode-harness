"""Declared representation-adapted checks on the untouched final; one 180s cap."""
import hashlib
import json
import subprocess
import time
from pathlib import Path
root=Path(__file__).resolve().parents[3]
dev=root/'development/ledger-review-delivery'
follow=dev/'post-capture-followup'
local=root/'local/ledger-review-delivery/post-capture-followup/evaluation-final'
source=local/'E'
assert (local/'summary.json').is_file()
assert json.loads((local/'summary.json').read_text())['assessment_integrity']=='verified'
image=json.loads((follow/'manifest.json').read_text())['image']
started=time.monotonic()
rows=[]
for label,script in [('state','/delivery/post-capture-followup/selected-state.mjs'),('retention','/delivery/retention-probe.mjs')]:
 name='ledger-followup-'+label
 existing=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
 assert existing.returncode!=0 and 'no such object' in existing.stderr.lower(), 'Refuse existing/unknown container identity'
 argv=['docker','run','--rm','--init','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','--memory','3g','--pids-limit','256','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--tmpfs','/work:rw,exec,nosuid,uid=1000,gid=1000,mode=0700,size=256m','-e','TMPDIR=/work','--mount',f'type=bind,source={source},target=/workspace,readonly','--mount',f'type=bind,source={dev},target=/delivery,readonly','--workdir','/workspace',image,'node',script]
 remaining=180-(time.monotonic()-started)
 assert remaining>0
 begin=time.monotonic()
 try:
  r=subprocess.run(argv,capture_output=True,text=True,timeout=remaining)
  result={'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr,'seconds':time.monotonic()-begin}
 except subprocess.TimeoutExpired as e:
  result={'exitCode':None,'status':'unknown: declared evaluator cap','stdout':(e.stdout or b'').decode(errors='replace'),'stderr':(e.stderr or b'').decode(errors='replace'),'seconds':time.monotonic()-begin}
 finally:
  state=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
  if state.returncode==0:
   subprocess.run(['docker','rm','--force',name],check=True,capture_output=True)
  else:
   assert 'no such object' in state.stderr.lower(),state.stderr
  gone=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
  assert gone.returncode!=0 and 'no such object' in gone.stderr.lower()
 result['containerAbsent']=True
 p=local/('E-'+label+'.json');p.write_text(json.dumps(result,indent=2)+'\n')
 observations=[]
 for line in result['stdout'].splitlines():
  try:observations.append(json.loads(line))
  except json.JSONDecodeError:pass
 rows.append({'check':label,'exitCode':result['exitCode'],'seconds':result['seconds'],'containerAbsent':True,'rawSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'observations':observations})
(follow/'selected-observations.json').write_text(json.dumps({'results':rows,'seconds':time.monotonic()-started,'modelRequests':0},indent=2)+'\n')
print(json.dumps({'results':[{k:v for k,v in r.items() if k!='observations'} for r in rows]}))
