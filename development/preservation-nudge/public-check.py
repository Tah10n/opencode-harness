"""Two disposable public-test copies. Uses only the saved base, dependencies and H1 patch."""
import hashlib,json,subprocess,time,uuid
from pathlib import Path
root=Path(__file__).resolve().parents[2]
manifest=json.loads((root/'development/polybench-pilot/frozen-manifest.json').read_text())
task=next(t for t in manifest['tasks'] if t['instance_id']=='sveltejs__svelte-1190')
inputs=root/'local/polybench-pilot/author-inputs/sveltejs__svelte-1190'
patch=root/'development/polybench-pilot/results/patches/H1/sveltejs__svelte-1190.patch'
out=root/'local/native-preservation-public';out.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
for name in ['base.tar','dependencies.tar']:assert sha((inputs/name).read_bytes())==task['archives'][name]
assert sha(patch.read_bytes())=='0cf9b1a0ef4c3087c2bfa7afea475056916955bd40afc1dc0251ebb42d577453'
image=task['authorImage']
assert subprocess.check_output(['docker','image','inspect',image,'--format','{{.Id}}'],text=True).strip()==image
results=[]
for arm in ['baseline','saved-H1']:
 name='preservation-public-'+uuid.uuid4().hex
 # No commands from trace or project configuration execute on the host.
 setup='mkdir /work/project && cd /work/project && tar xf /inputs/base.tar && tar xf /inputs/dependencies.tar && git init -q && git add . && git -c core.hooksPath=/dev/null -c user.name=Fixture -c user.email=fixture@localhost commit -qm baseline'
 if arm=='saved-H1':setup+=' && git apply --binary /saved.patch'
 check=". /usr/local/nvm/nvm.sh && nvm use 16.20.2 && npm test -- --grep '^runtime event-handler-event-methods '"
 script=setup+' && '+check
 args=['docker','run','--name',name,'--rm','--pull=never','--platform','linux/amd64','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','512','--memory','4g','--cpus','2','--user','1000:1000','--tmpfs','/tmp:rw,noexec,nosuid,size=128m','--tmpfs','/work:rw,exec,nosuid,uid=1000,gid=1000,mode=0700,size=2g','--mount',f'type=bind,source={inputs},target=/inputs,readonly','--mount',f'type=bind,source={patch},target=/saved.patch,readonly',image,'bash','-c',script]
 start=time.monotonic()
 try:r=subprocess.run(args,capture_output=True,timeout=180)
 finally:
  # Target only this task's uniquely named temporary container, if it survived.
  found=subprocess.run(['docker','ps','-aq','--filter','name=^/'+name+'$'],capture_output=True,text=True,check=True).stdout.strip()
  if found:subprocess.run(['docker','rm','-f',found],check=True,capture_output=True)
 duration=time.monotonic()-start
 (out/(arm+'.log')).write_bytes(r.stdout+r.stderr)
 text=(r.stdout+r.stderr).decode(errors='replace')
 assert r.returncode==(0 if arm=='baseline' else 3),text[-4000:]
 assert ('3 passing' if arm=='baseline' else '3 failing') in text
 if arm=='saved-H1':assert 'dispatchEvent' in text
 results.append({'arm':arm,'exit':r.returncode,'durationSeconds':duration,'freshBuild':'created compiler/svelte.js' in text,'logSha256':sha(r.stdout+r.stderr)})
receipt={'command':check,'image':image,'baseTarSha256':task['archives']['base.tar'],'patchSha256':sha(patch.read_bytes()),'results':results,'realProviderCalls':0,'hiddenTests':False,'historicalPatchRepaired':False}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
