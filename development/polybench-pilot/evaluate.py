"""Thin pinned-container wrapper; upstream commands, patches, parser/scoring unchanged."""
import argparse, csv, hashlib, importlib, json, os, runpy, subprocess, sys, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'local/polybench-pilot'
EVALUATOR_SHA = '9c836c5d7f3cb991934132b77d29e6941d912a07'

def install_boundary(images):
    import poly_bench_evaluation.docker_utils as module
    original = module.DockerManager
    class PinnedDockerManager(original):
        def check_image_local(self, local_image_name):
            entry = images.get(local_image_name)
            if entry is None:
                raise RuntimeError('Image not in frozen manifest: '+local_image_name)
            image = self.client.images.get(entry['digest'])
            if image.id != entry['id'] or image.attrs['Architecture'] != entry['architecture']:
                raise RuntimeError('Pinned image identity mismatch')
            self.image_id = entry['digest']
            return True
        def build_base_image(self, language, retry=3):
            # Instance images are complete; upstream eagerly builds unused bases.
            # Validate every selected pinned instance before skipping this setup.
            for alias in images:
                if alias.startswith("polybench_"+language.lower()+"_"):
                    self.check_image_local(alias)
        def try_pull_prebuilt_image(self, *args, **kwargs):
            raise RuntimeError('Implicit pull forbidden')
        def docker_build(self, *args, **kwargs):
            raise RuntimeError('Fallback build forbidden')
        def apply_patch_to_container(self, patch_content, patch_type):
            workdir=self._get_workdir_from_image()
            name='strict-application-check.patch'
            if not self.copy_file_to_container(patch_content,name,workdir):
                raise RuntimeError('Cannot prepare strict application check')
            checked=self.container.exec_run(['git','apply','--check','--binary',workdir+'/'+name],workdir=workdir)
            removed=self.container.exec_run(['rm','-f',workdir+'/'+name])
            if removed.exit_code!=0:raise RuntimeError('Cannot remove temporary strict-check input')
            with Path('strict-application.jsonl').open('a') as log:
                log.write(json.dumps({'image':self.image_id,'patch_type':patch_type,'patch_sha256':hashlib.sha256(patch_content.encode()).hexdigest(),'strict_exit_code':checked.exit_code,'strict_output':checked.output.decode(errors='replace')})+'\n')
            return super().apply_patch_to_container(patch_content,patch_type)
        def create_container(self):
            self.container = self.client.containers.create(
                image=self.image_id, detach=True, tty=True,
                working_dir=self._get_workdir_from_image(),
                name='polybench-pilot-eval-'+uuid.uuid4().hex,
                command='tail -f /dev/null', network_mode='none',
                cap_drop=['ALL'], security_opt=['no-new-privileges'],
                pids_limit=1024, mem_limit='8g', nano_cpus=4_000_000_000,
                platform='linux/amd64', labels={'opencode-harness.campaign':'polybench-pilot-v1'})
            self.container.start()
            entries=[(alias,entry) for alias,entry in images.items() if entry['digest']==self.image_id]
            if len(entries)!=1: raise RuntimeError('Ambiguous official image')
            instance=entries[0][0].split('_',2)[2]
            extra=LOCAL/'extra'/instance
            if (extra/'manifest.json').exists():
                metadata=json.loads((extra/'manifest.json').read_text());data=(extra/'prepared.tar').read_bytes()
                if hashlib.sha256(data).hexdigest()!=metadata['sha256']:raise RuntimeError('Prepared dependency changed')
                if not self.container.put_archive(self._get_workdir_from_image(),data):raise RuntimeError('Cannot install prepared dependency')
    module.DockerManager = PinnedDockerManager
    return PinnedDockerManager

def main():
    p=argparse.ArgumentParser()
    p.add_argument('mode',choices=['gold','baseline','predictions'])
    p.add_argument('--subset',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--predictions',type=Path)
    args=p.parse_args()
    evaluator=LOCAL/'evaluator'
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=evaluator,text=True).strip()==EVALUATOR_SHA
    assert not subprocess.check_output(['git','diff','HEAD','--','src'],cwd=evaluator,text=True).strip()
    csv.field_size_limit(10000000)
    with args.subset.open(newline='') as f: rows=list(csv.DictReader(f))
    ids=[r['instance_id'] for r in rows]
    assert ids and len(ids)==len(set(ids))
    if args.mode=='predictions':
        predictions=[json.loads(line) for line in args.predictions.read_text().splitlines()]
        assert len(predictions)==len(ids) and {r['instance_id'] for r in predictions}==set(ids)
        assert all(isinstance(r['model_patch'],str) for r in predictions)
    images=json.loads((LOCAL/'images.json').read_text())
    for r in rows: assert 'polybench_'+r['language'].lower()+'_'+r['instance_id'].lower() in images
    args.out=args.out.resolve(); args.subset=args.subset.resolve()
    if args.predictions: args.predictions=args.predictions.resolve()
    args.out.mkdir(parents=True,exist_ok=False)
    os.chdir(args.out)
    sys.path.insert(0,str(evaluator/'src'))
    Manager=install_boundary(images)
    provenance={'evaluator':EVALUATOR_SHA,'mode':args.mode,'instances':ids,
                'subset_sha256':hashlib.sha256(args.subset.read_bytes()).hexdigest(),
                'images':{k:v for k,v in images.items() if any(k.endswith(i.lower()) for i in ids)},
                'prepared_dependencies':{r['instance_id']:json.loads((LOCAL/'extra'/r['instance_id']/'manifest.json').read_text()) for r in rows if (LOCAL/'extra'/r['instance_id']/'manifest.json').exists()},
                'wrapper_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'container_boundary':{'network':'none','cap_drop':['ALL'],'no_new_privileges':True,'memory':'8g','cpus':4}}
    Path('provenance.json').write_text(json.dumps(provenance,indent=2))
    if args.mode!='baseline':
        sys.argv=[str(evaluator/'src/poly_bench_evaluation/run_evaluation.py'),
                  '--dataset-path',str(args.subset),'--result-path',str(args.out/'results'),
                  '--repo-path',str(args.out/'repos'),'--num-threads','1']
        sys.argv += ['--evaluate-gold'] if args.mode=='gold' else ['--predictions-path',str(args.predictions)]
        runpy.run_path(sys.argv[0],run_name='__main__')
    else:
        import docker, pandas as pd
        from poly_bench_evaluation.polybench_data import dataset_generator
        from poly_bench_evaluation.constants import REPO_TO_PARSER_CLASS, DEFAULT_TIMEOUT
        from poly_bench_evaluation.scoring import instance_level_scoring, store_instance_level_output
        parsers=importlib.import_module('poly_bench_evaluation.parsers')
        client=docker.from_env()
        for instance in dataset_generator(pd.read_csv(args.subset).fillna('')):
            manager=Manager('polybench_'+instance.language.lower()+'_'+instance.instance_id.lower(),False,client)
            try:
                manager.check_image_local(manager.image_id); manager.create_container()
                applied=manager.apply_patch_to_container(instance.test_patch,'test')
                assert applied==0
                code=manager.docker_run(instance.test_command,DEFAULT_TIMEOUT)
                logs='\n'.join(manager.run_logs)
                Path(instance.instance_id+'.log').write_text(logs)
                parsed=getattr(parsers,REPO_TO_PARSER_CLASS[instance.repo])(test_content=logs).parse()
                output=instance_level_scoring(instance_id=instance.instance_id,result=parsed,f2p=instance.f2p,p2p=instance.p2p,patch_applied=True,generation=True)
                store_instance_level_output(instance_output=output,result_path=str(args.out/'results'))
                Path(instance.instance_id+'-execution.json').write_text(json.dumps({'exit_code':code,'parsed_tests':len(parsed.get('passed_tests',[]))+len(parsed.get('failed_tests',[])),'production_patch_applied':False}))
            finally:
                manager._cleanup()
        client.close()

if __name__=='__main__': main()
