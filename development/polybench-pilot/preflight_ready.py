"""Run scripted native sessions only, once per prepared instance and adapter version."""
import json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'local/polybench-pilot';DEV=ROOT/'development/polybench-pilot'
environments=json.loads((LOCAL/'environments.json').read_text())
for row in json.loads((DEV/'selection.json').read_text())['selected']:
 id=row['instance_id'];source=LOCAL/'author-inputs'/id/'source'
 if str(source) not in environments:continue
 name='preflight-final-'+id;out=LOCAL/name
 if out.exists():
  verification=out/'verification.json'
  if verification.exists() and json.loads(verification.read_text())['passed']:continue
  raise RuntimeError('Preserve and inspect partial scripted preflight: '+str(out))
 with (LOCAL/(name+'-console.log')).open('x') as log:
  subprocess.run(['node',DEV/'preflight.mjs',name,id],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
 print(id+' scripted P/H0/H1 passed',flush=True)
