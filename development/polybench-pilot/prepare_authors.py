"""Prepare selected calibrated author inputs; never alter partial preparations."""
import json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'local/polybench-pilot';DEV=ROOT/'development/polybench-pilot';PYTHON=LOCAL/'venv/bin/python'
for row in json.loads((DEV/'selection.json').read_text())['selected']:
 id=row['instance_id'];control=LOCAL/'controls'/(id+'-baseline')/'results'/(id+'_result.json')
 if not control.exists():continue
 baseline=json.loads(control.read_text());gold=json.loads((LOCAL/'controls'/(id+'-gold')/'results'/(id+'_result.json')).read_text())
 if baseline['resolved'] or not gold['resolved']:raise RuntimeError('Uncalibrated instance '+id)
 folder=LOCAL/'author-inputs'/id
 if not folder.exists():
  with (LOCAL/(id+'-author-input.log')).open('x') as out:subprocess.run([PYTHON,DEV/'author_input.py',id],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True)
 if not (folder/'audit.json').exists():raise RuntimeError('Partial author input requires inspection: '+id)
 if not (folder/'lfs-audit.json').exists():subprocess.run([PYTHON,DEV/'hydrate_lfs.py',id],cwd=ROOT,check=True)
 if not (folder/'image.json').exists():subprocess.run([PYTHON,DEV/'author_image.py',id],cwd=ROOT,check=True)
 print(id+' author input/image prepared',flush=True)
