"""Inspect accessible filesystem of each source-free author image as its user."""
import json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'local/polybench-pilot'
for row in json.loads((ROOT/'development/polybench-pilot/selection.json').read_text())['selected']:
 folder=LOCAL/'author-inputs'/row['instance_id'];record=folder/'image.json';out=folder/'image-isolation.json'
 if not record.exists() or out.exists():continue
 image=json.loads(record.read_text())['author_image']
 args=['docker','run','--rm','--platform','linux/amd64','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--pids-limit','64','--workdir','/',image,'find','/','-path','/proc','-prune','-o','-path','/sys','-prune','-o','-path','/dev','-prune','-o','-name','.git','-print','-prune','-o','-name','eval.sh','-print','-o','-name','patch_code.diff','-print','-o','-name','patch_test.diff','-print','-o','-name','custom-reporter.js','-print']
 result=subprocess.run(args,capture_output=True,text=True)
 inaccessible=result.stderr.splitlines()
 acceptable=result.returncode in [0,1] and all('Permission denied' in line for line in inaccessible)
 data={'image':image,'author_user':'1000:1000','accessible_suspect_paths':result.stdout.splitlines(),'inaccessible_paths_diagnostics':inaccessible,'exit_code':result.returncode,'passed':acceptable and not result.stdout.strip(),'original_project_removed':True,'scope':'source-free rootfs; /input audited separately'}
 out.write_text(json.dumps(data,indent=2))
 if not data['passed']:raise RuntimeError('Author image requires inspection: '+str(out))
 print(row['instance_id']+' accessible rootfs isolation passed',flush=True)
