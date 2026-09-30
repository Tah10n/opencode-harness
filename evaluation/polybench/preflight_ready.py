"""Run scripted native sessions only, once per prepared instance and adapter version."""
import json,subprocess
from pathlib import Path
from campaign import LOCAL as CAMPAIGN_LOCAL, SELECTION, CONFIG
ROOT=Path(__file__).resolve().parents[2];LOCAL=CAMPAIGN_LOCAL;DEV=ROOT/'evaluation/polybench';PYTHON=LOCAL/'venv/bin/python'
environments=json.loads((LOCAL/'environments.json').read_text())
for row in json.loads(SELECTION.read_text())['selected']:
 id=row['instance_id'];source=LOCAL/'author-inputs'/id/'source'
 if str(source) not in environments:continue
 name='scripted-preflight-final' if CONFIG else 'preflight-final-'+id;out=LOCAL/name
 if out.exists():
  verification=out/'verification.json'
  if verification.exists() and json.loads(verification.read_text())['passed']:
   if CONFIG:break
   continue
  raise RuntimeError('Preserve and inspect partial scripted preflight: '+str(out))
 with (LOCAL/(name+'-console.log')).open('x') as log:
  subprocess.run(['node',DEV/'preflight.mjs',name,id],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
 print(id+' scripted arms passed',flush=True)
 if CONFIG:break

if CONFIG:
 import csv,hashlib
 from results import export_started
 from campaign import ARMS
 final=LOCAL/'scripted-preflight-final'
 verification=json.loads((final/'verification.json').read_text())
 if not verification['passed'] or {c['arm'] for c in verification['checks']}!=set(ARMS):raise RuntimeError('Incomplete scripted arms')
 # A targeted repair may retain valid prior checks; each arm names its actual
 # receipt folder. Ordinary first-pass checks all live in the final folder.
 records={};slots=[];original=[];patches={}
 csv.field_size_limit(10000000)
 with (LOCAL/'selected.csv').open(newline='') as f:original=list(csv.DictReader(f))
 for number,arm in enumerate(ARMS,1):
  check=next(c for c in verification['checks'] if c['arm']==arm)
  folder=LOCAL/check.get('source','scripted-preflight-final')
  freeze=json.loads((folder/'freeze.json').read_text())
  attempt=next(a for a in freeze['attempts'] if a['arm']==arm)
  patch=(folder/'runs'/(attempt['task']+'-'+arm)/'model.patch').read_bytes().decode('utf-8')
  patches[arm]=patch;slots.append({'slot':number,'instance_id':attempt['task'],'arm':arm});records[number]={'started':True,'patch':patch}
 export=final/'export'
 if not export.exists():export_started(slots,records,original,export)
 else:
  for s in slots:
   if [json.loads(line) for line in (export/s['arm']/'predictions.jsonl').read_text().splitlines()]!=[{'instance_id':s['instance_id'],'model_patch':patches[s['arm']]}]:raise RuntimeError('Scripted export changed')
 evaluated={};official=[]
 for s in slots:
  arm=s['arm'];digest=hashlib.sha256(patches[arm].encode()).hexdigest();key=(s['instance_id'],digest)
  if key not in evaluated:
   out=final/'evaluations'/arm
   if not out.exists():
    with (LOCAL/('scripted-preflight-evaluation-'+arm+'.log')).open('x') as log:
     subprocess.run([PYTHON,DEV/'evaluate.py','predictions','--subset',export/arm/'subset.csv','--predictions',export/arm/'predictions.jsonl','--out',out],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
   result_path=out/'results'/(s['instance_id']+'_result.json');result=json.loads(result_path.read_text())
   strict=[json.loads(line) for line in (out/'strict-application.jsonl').read_text().splitlines()]
   if not any(x['patch_type']=='code' and x['patch_sha256']==digest for x in strict):raise RuntimeError('Official control not bound to exact scripted patch')
   if not result['patch_applied'] or result['resolved'] is not False or not result['passed_tests']+result['failed_tests']:raise RuntimeError('Scripted official export control failed')
   evaluated[key]={'result_sha256':hashlib.sha256(result_path.read_bytes()).hexdigest(),'patch_sha256':digest,'patch_applied':True,'resolved':False,'representative_arm':arm}
  official.append({'arm':arm,**evaluated[key]})
 verification['official_export_control']={'patch_applied':True,'checks':official,'unique_official_invocations':len(evaluated),'note':'Identical scripted patches share one official control; not model quality results.'}
 (final/'verification.json').write_text(json.dumps(verification,indent=2)+'\n')
