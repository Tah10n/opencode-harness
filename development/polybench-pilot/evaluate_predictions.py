"""Official evaluation of exactly the exported, actually-started subset per arm."""
import hashlib,json,os,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'local/polybench-pilot';DEV=ROOT/'development/polybench-pilot';PYTHON=LOCAL/'venv/bin/python'
freeze=json.loads((LOCAL/'batch/freeze.json').read_text())
for filename,digest in freeze['files'].items():
 if hashlib.sha256(Path(filename).read_bytes()).hexdigest()!=digest:raise RuntimeError('Frozen implementation changed: '+filename)
subprocess.run([PYTHON,DEV/'collect.py'],cwd=ROOT,check=True)
for arm in ['P','H0','H1']:
 folder=LOCAL/'batch/export'/arm;predictions=folder/'predictions.jsonl';subset=folder/'subset.csv'
 if not subset.exists():continue
 out=LOCAL/'evaluations'/arm
 if out.exists():raise RuntimeError('Evaluation output already exists; no automatic repeat or skip-existing')
 start=time.time()
 with (LOCAL/(arm+'-evaluation-console.log')).open('x') as log:
  result=subprocess.run([PYTHON,DEV/'evaluate.py','predictions','--subset',subset,'--predictions',predictions,'--out',out],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'DOCKER_HOST':'unix://'+str(Path.home()/'.docker/run/docker.sock')})
 (LOCAL/(arm+'-evaluation-process.json')).write_text(json.dumps({'exit_code':result.returncode,'elapsed_seconds':time.time()-start}))
 # Even on evaluator error, retain any per-instance outputs and continue arms.
 subprocess.run([PYTHON,DEV/'collect.py'],cwd=ROOT,check=True)
