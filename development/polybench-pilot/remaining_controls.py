"""Selected images only, one download/control at a time; no model requests."""
import csv,hashlib,json,os,shutil,subprocess,time
from prepare_extra import prepare
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'local/polybench-pilot';DEV=ROOT/'development/polybench-pilot'
PYTHON=LOCAL/'venv/bin/python'
selection=json.loads((DEV/'selection.json').read_text())
first=[next(r for r in selection['selected'] if r['language']==lang) for lang in ['JavaScript','TypeScript']]
def verify_control(id,mode):
 p=LOCAL/'controls'/(id+'-'+mode)/'results'/(id+'_result.json')
 provenance=json.loads((p.parent.parent/'provenance.json').read_text())
 subset=LOCAL/(id+'.csv')
 if provenance['evaluator']!='9c836c5d7f3cb991934132b77d29e6941d912a07' or provenance['instances']!=[id] or provenance['subset_sha256']!=hashlib.sha256(subset.read_bytes()).hexdigest():raise RuntimeError('Control provenance mismatch')
 d=json.loads(p.read_text());n=len(d['passed_tests'])+len(d['failed_tests'])
 if not n or d['resolved']!=(mode=='gold'):raise RuntimeError('Control not reproduced: '+str(p))
for row in first:
 for mode in ['gold','baseline']:verify_control(row['instance_id'],mode)
csv.field_size_limit(10000000)
with (LOCAL/'selected.csv').open(newline='') as f: reader=csv.DictReader(f);rows=list(reader);fields=reader.fieldnames
for row in rows:
 id=row['instance_id']
 if id in {r['instance_id'] for r in first}:continue
 if all((LOCAL/'controls'/(id+'-'+mode)/'results'/(id+'_result.json')).exists() for mode in ['gold','baseline']):
  for mode in ['gold','baseline']:verify_control(id,mode)
  continue
 if shutil.disk_usage(LOCAL).free<50*1024**3:raise RuntimeError('Less than 50 GiB free; no foreign cleanup')
 tag='ghcr.io/timesler/swe-polybench.eval.x86_64.'+id.lower()+':v1.1'
 pinned=json.loads((LOCAL/'images.json').read_text())
 alias='polybench_'+row['language'].lower()+'_'+id.lower()
 if alias not in pinned:
  log=LOCAL/('pull-'+id+'.log');start=time.time()
  with log.open('x') as out:result=subprocess.run(['docker','pull','--platform','linux/amd64',tag],stdout=out,stderr=subprocess.STDOUT)
  (LOCAL/(id+'-pull-accounting.json')).write_text(json.dumps({'elapsed_seconds':time.time()-start,'exit_code':result.returncode,'tag':tag}))
  result.check_returncode()
  subprocess.run([PYTHON,DEV/'pin_images.py'],check=True,cwd=ROOT,stdout=subprocess.DEVNULL)
 prepare(row)
 subset=LOCAL/(id+'.csv')
 with subset.open('w',newline='') as out:
  writer=csv.DictWriter(out,fieldnames=fields);writer.writeheader();writer.writerow(row)
 for mode in ['gold','baseline']:
  out=LOCAL/'controls'/(id+'-'+mode)
  if out.exists():verify_control(id,mode);continue
  start=time.time()
  with (LOCAL/(id+'-'+mode+'-console.log')).open('x') as log:
   result=subprocess.run([PYTHON,DEV/'evaluate.py',mode,'--subset',subset,'--out',out],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'DOCKER_HOST':'unix://'+str(Path.home()/'.docker/run/docker.sock')})
  (LOCAL/(id+'-'+mode+'-accounting.json')).write_text(json.dumps({'elapsed_seconds':time.time()-start,'exit_code':result.returncode}))
  result.check_returncode();verify_control(id,mode)
 print(id+' gold/baseline reproduced',flush=True)
