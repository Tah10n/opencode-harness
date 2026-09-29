"""Inspect accessible filesystem of each source-free author image as its user."""
import json,subprocess
from pathlib import Path
import sys
from campaign import LOCAL as CAMPAIGN_LOCAL, SELECTION
ROOT=Path(__file__).resolve().parents[2];LOCAL=CAMPAIGN_LOCAL
for row in json.loads(SELECTION.read_text())['selected']:
 if len(sys.argv)>1 and row['instance_id']!=sys.argv[1]:continue
 folder=LOCAL/'author-inputs'/row['instance_id'];record=folder/'image.json';out=folder/'image-isolation.json'
 if not record.exists():continue
 image=json.loads(record.read_text())['author_image']
 env_receipt=folder/'image-environment.json'
 if not env_receipt.exists():
  inspected=json.loads(subprocess.check_output(['docker','image','inspect',image]))[0]
  environment=inspected['Config'].get('Env',[])
  allowed={'PATH','TZ','NVM_DIR','NODE_VERSION','YARN_VERSION','NODE_PATH','HOME','LANG','LC_ALL','TERM','DISPLAY','DEBIAN_FRONTEND','CI','NPM_CONFIG_LOGLEVEL','VSCODECRASHDIR','CHROME_BIN','FIREFOX_BIN'}
  unexpected=[item.split('=',1)[0] for item in environment if item.split('=',1)[0] not in allowed]
  env_receipt.write_text(json.dumps({'image':image,'environment':environment,'unexpected_keys':unexpected,'passed':not unexpected},indent=2)+'\n')
 if not json.loads(env_receipt.read_text())['passed']:raise RuntimeError('Author image environment requires inspection: '+str(env_receipt))
 if out.exists():continue
 args=['docker','run','--rm','--platform','linux/amd64','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--pids-limit','64','--workdir','/',image,'find','/','-path','/proc','-prune','-o','-path','/sys','-prune','-o','-path','/dev','-prune','-o','-name','.git','-print','-prune','-o','-name','eval.sh','-print','-o','-name','patch_code.diff','-print','-o','-name','patch_test.diff','-print','-o','-name','custom-reporter.js','-print']
 result=subprocess.run(args,capture_output=True,text=True)
 inaccessible=result.stderr.splitlines()
 acceptable=result.returncode in [0,1] and all('Permission denied' in line for line in inaccessible)
 data={'image':image,'author_user':'1000:1000','accessible_suspect_paths':result.stdout.splitlines(),'inaccessible_paths_diagnostics':inaccessible,'exit_code':result.returncode,'passed':acceptable and not result.stdout.strip(),'original_project_removed':True,'scope':'source-free rootfs; /input audited separately'}
 out.write_text(json.dumps(data,indent=2))
 if not data['passed']:raise RuntimeError('Author image requires inspection: '+str(out))
 print(row['instance_id']+' accessible rootfs isolation passed',flush=True)
