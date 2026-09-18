"""Prepare missing public Electron dependency with the original project script.
No source fixes, tests, evaluator inputs or provider access. No host installation.
"""
import hashlib,json,subprocess,tarfile,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'local/polybench-pilot'
def prepare(row):
 if row['repo']!='microsoft/vscode':return
 folder=LOCAL/'extra'/row['instance_id']
 if (folder/'manifest.json').exists():
  m=json.loads((folder/'manifest.json').read_text())
  if hashlib.sha256((folder/'prepared.tar').read_bytes()).hexdigest()!=m['sha256']:raise RuntimeError('Prepared Electron changed')
  return
 folder.mkdir(parents=True,exist_ok=False)
 image=json.loads((LOCAL/'images.json').read_text())['polybench_'+row['language'].lower()+'_'+row['instance_id'].lower()]['digest']
 name='polybench-pilot-electron-prep-'+uuid.uuid4().hex
 try:
  with (folder/'preparation.log').open('x') as log:
   subprocess.run(['docker','run','--name',name,'--platform','linux/amd64','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','2g','--cpus','2','--pids-limit','256',image,'node','build/lib/electron'],stdout=log,stderr=subprocess.STDOUT,check=True,timeout=180)
  subprocess.run(['docker','cp',name+':/testbed/.build/electron',folder/'electron'],check=True)
  with tarfile.open(folder/'prepared.tar','w') as tar:tar.add(folder/'electron',arcname='.build/electron')
  metadata={'directories':['.build/electron'],'sha256':hashlib.sha256((folder/'prepared.tar').read_bytes()).hexdigest(),'version':(folder/'electron/version').read_text(),'preparation':'node build/lib/electron','reason':'Published image lacks required Electron binary; downloaded by unchanged original project script before offline evaluation.'}
  (folder/'manifest.json').write_text(json.dumps(metadata,indent=2))
 finally:
  inspected=subprocess.run(['docker','inspect',name],capture_output=True)
  if inspected.returncode==0:subprocess.run(['docker','rm','-f',name],check=True)
if __name__=='__main__':
 for row in json.loads((ROOT/'development/polybench-pilot/selection.json').read_text())['selected']:prepare(row)
