"""Reproduce official acquisition and initial two-language model-free controls.
No provider access. Invoke using an existing Python >=3.12.
"""
import argparse, csv, hashlib, json, os, subprocess, sys, time, urllib.request
from pathlib import Path
from campaign import LOCAL, SELECTION, CONFIG
ROOT=Path(__file__).resolve().parents[2]
DEV=ROOT/'evaluation/polybench'
EVAL_SHA='9c836c5d7f3cb991934132b77d29e6941d912a07'
DATA_SHA='b3fca77b637379f0c01ad86d18753a7ac1998b53'

def command(args, **kwargs):
    subprocess.run([str(a) for a in args],cwd=ROOT,check=True,**kwargs)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--controls',action='store_true');parser.add_argument('--full',action='store_true');parser.add_argument('--plan',action='store_true');args=parser.parse_args()
    if args.plan:
        print(json.dumps({'dataset_revision':DATA_SHA,'evaluator_revision':EVAL_SHA,'selected_tasks':len(json.loads(SELECTION.read_text())['selected']),'model':os.environ.get('POLYBENCH_MODEL'),'variant':os.environ.get('POLYBENCH_VARIANT'),'provider_requests':0,'full_preparation':'Linux ARM64 Docker, Python >=3.12, explicit model/variant; installs public pinned tools; author isolation and official controls before freeze'}));return
    if sys.version_info < (3,12): raise RuntimeError('Preparation requires Python >=3.12')
    if (LOCAL/"batch").exists(): raise RuntimeError("Preparation cannot mutate a frozen batch")
    LOCAL.mkdir(parents=True,exist_ok=True)
    evaluator=LOCAL/'evaluator'
    if not evaluator.exists():
        command(['git','clone','https://github.com/amazon-science/SWE-PolyBench.git',evaluator])
        subprocess.run(['git','checkout','--detach',EVAL_SHA],cwd=evaluator,check=True)
    current=subprocess.check_output(['git','rev-parse','HEAD'],cwd=evaluator,text=True).strip()
    if current!=EVAL_SHA: raise RuntimeError('Unexpected evaluator checkout; preserve and investigate')
    dataset=LOCAL/'verified.csv'
    if not dataset.exists():
        urllib.request.urlretrieve('https://huggingface.co/datasets/AmazonScience/SWE-PolyBench_Verified/resolve/'+DATA_SHA+'/test.csv',dataset)
    if SELECTION.exists():
        expected=json.loads(SELECTION.read_text())['dataset_sha256']
        assert hashlib.sha256(dataset.read_bytes()).hexdigest()==expected
    if not CONFIG:
        command([sys.executable,DEV/'selection.py'])
    python=LOCAL/'venv/bin/python'
    if not python.exists():
        command([sys.executable,'-m','venv',LOCAL/'venv'])
        command([python,'-m','pip','install','-r',DEV/'requirements.lock'])
    command([sys.executable,DEV/'verify.py','--consolidated-dataset' if CONFIG else '--dataset'])
    if not (args.controls or args.full): return
    if CONFIG:
        command([python,DEV/'remaining_controls.py'])
        if not args.full:return
        if not (LOCAL/'runtime.json').exists():command(['node',DEV/'runtime.mjs'])
        command([python,DEV/'prepare_diagnostic.py'])
        command([python,DEV/'prepare_authors.py'])
        command([python,DEV/'environments.py'])
        command([python,DEV/'audit_images.py'])
        command([python,DEV/'preflight_ready.py'])
        return
    selection=json.loads(SELECTION.read_text())
    first=[next(r for r in selection['selected'] if r['language']==lang) for lang in ['JavaScript','TypeScript']]
    csv.field_size_limit(10000000)
    with dataset.open(newline='') as f: reader=csv.DictReader(f);rows=list(reader);fields=reader.fieldnames
    for row in first:
        id=row['instance_id']; image='ghcr.io/timesler/swe-polybench.eval.x86_64.'+id.lower()+':v1.1'
        image_manifest=LOCAL/'images.json'
        pinned=json.loads(image_manifest.read_text()) if image_manifest.exists() else {}
        alias='polybench_'+row['language'].lower()+'_'+id.lower()
        if alias not in pinned:
            command(['docker','pull','--platform','linux/amd64',image])
            command([sys.executable,DEV/'pin_images.py'])
        subset=LOCAL/(id+'.csv')
        with subset.open('w',newline='') as f:
            w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerow(next(r for r in rows if r['instance_id']==id))
        for mode in ['gold','baseline']:
            out=LOCAL/'controls'/(id+'-'+mode)
            if out.exists():
                provenance=json.loads((out/'provenance.json').read_text());result=json.loads((out/'results'/(id+'_result.json')).read_text())
                assert provenance['evaluator']==EVAL_SHA and provenance['instances']==[id] and provenance['subset_sha256']==hashlib.sha256(subset.read_bytes()).hexdigest()
                assert result['resolved']==(mode=='gold') and len(result['passed_tests'])+len(result['failed_tests'])>0
                continue
            command([python,DEV/'evaluate.py',mode,'--subset',subset,'--out',out],env=os.environ.copy())
            result=json.loads((out/'results'/(id+'_result.json')).read_text())
            observed=len(result['passed_tests'])+len(result['failed_tests'])
            if observed==0 or result['resolved']!=(mode=='gold'):
                raise RuntimeError('Official control not reproduced: '+str(out))
    print('Initial JS/TS controls passed.')
    if args.full:
        command([python,DEV/'remaining_controls.py'])
        if not (LOCAL/'bundle').exists():command(['node',DEV/'runtime.mjs'])
        command([python,DEV/'prepare_diagnostic.py'])
        command([python,DEV/'prepare_authors.py'])
        command([python,DEV/'environments.py'])
        command([python,DEV/'audit_images.py'])
        command(['node',ROOT/'scripts/verify-installed.mjs'])
        command(['node',ROOT/'evaluation/support/verify-recording.mjs',LOCAL/'recorder-fixture'])
        command([python,DEV/'preflight_ready.py'])
        if not (LOCAL/'container-preflight-final/verification.json').exists():command(['node',DEV/'verify-container.mjs','container-preflight-final'])
if __name__=='__main__':main()
