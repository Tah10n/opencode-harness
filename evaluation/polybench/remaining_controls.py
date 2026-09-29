"""Selected images only, one download/control at a time; no model requests."""
import csv,hashlib,json,os,shutil,subprocess,time,sys
from pathlib import Path
from prepare_extra import prepare
from campaign import LOCAL, SELECTION, CONFIG
ROOT=Path(__file__).resolve().parents[2];DEV=ROOT/'evaluation/polybench'
PYTHON=Path(sys.executable)
selection=json.loads(SELECTION.read_text())
def verify_control(id,mode):
 p=LOCAL/'controls'/(id+'-'+mode)/'results'/(id+'_result.json')
 provenance=json.loads((p.parent.parent/'provenance.json').read_text())
 subset=LOCAL/(id+'.csv')
 if provenance['evaluator']!='9c836c5d7f3cb991934132b77d29e6941d912a07' or provenance['instances']!=[id] or provenance['subset_sha256']!=hashlib.sha256(subset.read_bytes()).hexdigest():raise RuntimeError('Control provenance mismatch')
 d=json.loads(p.read_text());n=len(d['passed_tests'])+len(d['failed_tests'])
 if not n or d['resolved']!=(mode=='gold'):raise RuntimeError('Control not reproduced: '+str(p))
 return {'resolved':d['resolved'],'passed':len(d['passed_tests']),'failed':len(d['failed_tests']),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}

def prepare_row(row,fields):
 id=row['instance_id']
 if shutil.disk_usage(LOCAL).free<50*1024**3:raise RuntimeError('Less than 50 GiB free; no foreign cleanup')
 tag='ghcr.io/timesler/swe-polybench.eval.x86_64.'+id.lower()+':v1.1'
 pinned=json.loads((LOCAL/'images.json').read_text()) if (LOCAL/'images.json').exists() else {}
 alias='polybench_'+row['language'].lower()+'_'+id.lower()
 if alias not in pinned:
  log=LOCAL/('pull-'+id+'.log');start=time.time()
  with log.open('x') as out:result=subprocess.run(['docker','pull','--platform','linux/amd64',tag],stdout=out,stderr=subprocess.STDOUT,timeout=1800)
  (LOCAL/(id+'-pull-accounting.json')).write_text(json.dumps({'elapsed_seconds':time.time()-start,'exit_code':result.returncode,'tag':tag}))
  result.check_returncode()
  subprocess.run([PYTHON,DEV/'pin_images.py'],check=True,cwd=ROOT,stdout=subprocess.DEVNULL)
 prepare(row)
 subset=LOCAL/(id+'.csv')
 if not subset.exists():
  with subset.open('x',newline='') as out:
   writer=csv.DictWriter(out,fieldnames=fields);writer.writeheader();writer.writerow(row)
 else:
  with subset.open(newline='') as f:
   if list(csv.DictReader(f))!=[row]:raise RuntimeError('Existing subset differs')
 controls={}
 for mode in ['gold','baseline']:
  out=LOCAL/'controls'/(id+'-'+mode)
  if not out.exists():
   start=time.time()
   with (LOCAL/(id+'-'+mode+'-console.log')).open('x') as log:
    result=subprocess.run([PYTHON,DEV/'evaluate.py',mode,'--subset',subset,'--out',out],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,env=os.environ.copy())
   (LOCAL/(id+'-'+mode+'-accounting.json')).write_text(json.dumps({'elapsed_seconds':time.time()-start,'exit_code':result.returncode}))
   result.check_returncode()
  controls[mode]=verify_control(id,mode)
 return controls

def main():
 csv.field_size_limit(10000000)
 with (LOCAL/'selected.csv').open(newline='') as f:reader=csv.DictReader(f);rows=list(reader);fields=reader.fieldnames
 target=LOCAL/'preparation-controls.json'
 records=json.loads(target.read_text()) if target.exists() else {}
 for row in rows:
  id=row['instance_id']
  if id in records:continue
  start=time.time()
  try:record={'status':'controls_passed','controls':prepare_row(row,fields)}
  except Exception as error:
   if not CONFIG:raise
   record={'status':'preparation_error','reason':str(error),'error_type':type(error).__name__}
  records[id]={**record,'elapsed_seconds':time.time()-start}
  target.write_text(json.dumps(records,indent=2)+'\n')
  print(id+' '+record['status'],flush=True)
if __name__=='__main__':main()
