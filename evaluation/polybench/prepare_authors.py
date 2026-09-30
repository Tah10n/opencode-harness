"""Prepare each selected author input once; preserve failures for all three arms."""
import json,subprocess,sys,time
from pathlib import Path
from campaign import LOCAL,SELECTION,CONFIG
ROOT=Path(__file__).resolve().parents[2];DEV=ROOT/'evaluation/polybench';PYTHON=Path(sys.executable)
controls=json.loads((LOCAL/'preparation-controls.json').read_text()) if CONFIG else None
summary=LOCAL/'preparation.json'
records=json.loads(summary.read_text()) if summary.exists() else {}
for row in json.loads(SELECTION.read_text())['selected']:
 id=row['instance_id']
 if CONFIG and id in records:continue
 if CONFIG:
  control=controls.get(id)
  if not control:continue
  if control['status']!='controls_passed':
   records[id]={**control,'phase':'official_controls'};summary.write_text(json.dumps(records,indent=2)+'\n');continue
 baseline_path=LOCAL/'controls'/(id+'-baseline')/'results'/(id+'_result.json')
 if not baseline_path.exists():continue
 start=time.time();phase='author_input'
 try:
  baseline=json.loads(baseline_path.read_text());gold=json.loads((LOCAL/'controls'/(id+'-gold')/'results'/(id+'_result.json')).read_text())
  if baseline['resolved'] or not gold['resolved']:raise RuntimeError('Uncalibrated instance '+id)
  folder=LOCAL/'author-inputs'/id
  if not folder.exists():
   with (LOCAL/(id+'-author-input.log')).open('x') as out:subprocess.run([PYTHON,DEV/'author_input.py',id],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True)
  if not (folder/'audit.json').exists():raise RuntimeError('Partial author input requires inspection: '+id)
  phase='lfs'
  if not (folder/'lfs-audit.json').exists():subprocess.run([PYTHON,DEV/'hydrate_lfs.py',id],cwd=ROOT,check=True)
  phase='author_image'
  if not (folder/'image.json').exists():subprocess.run([PYTHON,DEV/'author_image.py',id],cwd=ROOT,check=True)
  if CONFIG:
   phase='environment';subprocess.run([PYTHON,DEV/'environments.py',id],cwd=ROOT,check=True)
   phase='image_isolation';subprocess.run([PYTHON,DEV/'audit_images.py',id],cwd=ROOT,check=True)
   phase='input_preflight'
   subprocess.run(['node',DEV/'input-preflight.mjs',id],cwd=ROOT,check=True)
  records[id]={'status':'ready','phase':'prepared','elapsed_seconds':time.time()-start}
 except Exception as error:
  if not CONFIG:raise
  records[id]={'status':'preparation_error','phase':phase,'error_type':type(error).__name__,'reason':str(error),'elapsed_seconds':time.time()-start}
 if CONFIG:summary.write_text(json.dumps(records,indent=2)+'\n')
 print(id+' '+records[id]['status'],flush=True)
