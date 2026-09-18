"""Extract baseline archive and prepared dependencies from an untouched image.
This does not accept gold/test patches or inspect evaluation results.
"""
import argparse, hashlib, io, json, os, subprocess, tarfile, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; LOCAL=ROOT/'local/polybench-pilot'

def main():
    p=argparse.ArgumentParser();p.add_argument('instance_id');a=p.parse_args()
    rows=json.loads((ROOT/'development/polybench-pilot/selection.json').read_text())['selected']
    row=next(r for r in rows if r['instance_id']==a.instance_id)
    image=json.loads((LOCAL/'images.json').read_text())['polybench_'+row['language'].lower()+'_'+a.instance_id.lower()]
    out=LOCAL/'author-inputs'/a.instance_id;out.mkdir(parents=True,exist_ok=False)
    name='polybench-pilot-prep-'+uuid.uuid4().hex
    command=['docker','run','--name',name,'--platform','linux/amd64','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1g','--pids-limit','128','--cpus','2',image['digest']]
    def run(args,target):
        with target.open('wb') as f:
            subprocess.run(command+args,stdout=f,check=True)
        subprocess.run(['docker','rm',name],check=True,stdout=subprocess.DEVNULL)
    try:
        run(['git','-c','filter.lfs.required=false','-c','filter.lfs.smudge=','-c','filter.lfs.process=','archive','--format=tar',row['base_commit']],out/'base.tar')
        run(['git','ls-tree','-r',row['base_commit']],out/'tree.txt')
        submodules=[]
        for line in (out/'tree.txt').read_text().splitlines():
            if line.startswith('160000 '):
                meta,relative=line.split('\t',1);commit=meta.split()[2]
                if relative.startswith('/') or '..' in Path(relative).parts: raise RuntimeError('Invalid submodule path')
                archive='submodule-'+str(len(submodules))+'.tar'
                run(['git','-C','/testbed/'+relative,'-c','filter.lfs.required=false','-c','filter.lfs.smudge=','-c','filter.lfs.process=','archive','--format=tar',commit],out/archive)
                submodules.append({'path':relative,'commit':commit,'archive':archive})
        # Inventory before deciding which additional dependency trees are needed.
        run(['bash','-lc',"set -e; find /testbed -name .git -prune -o -type d -name node_modules -prune -print; git -c filter.lfs.required=false -c filter.lfs.clean= -c filter.lfs.process= status --short; git submodule status; command -v node; node --version; printf '%s\\n' \"$PATH\""],out/'preparation.txt')
        run(['find','/testbed','-name','.git','-prune','-o','-type','d','-name','node_modules','-prune','-print0'],out/'dependency-paths.bin')
        dependency_paths=[p.decode().removeprefix('/testbed/') for p in (out/'dependency-paths.bin').read_bytes().split(b'\0') if p]
        if not dependency_paths or any(p.startswith('/') or '..' in Path(p).parts for p in dependency_paths): raise RuntimeError('Invalid dependency inventory')
        if row['repo']=='coder/code-server':
            # Prepared vendored packages live outside node_modules; include the
            # whole dependency root, not only their transitive node_modules.
            dependency_paths=[p for p in dependency_paths if not p.startswith('vendor/modules/')]+['vendor/modules']
        run(['tar','-C','/testbed','-cf','-',*dependency_paths],out/'dependencies.tar')
        source=out/'source';source.mkdir()
        for archive in ['base.tar','dependencies.tar']:
            with tarfile.open(out/archive) as tar:
                tar.extractall(source,filter='data')
        for submodule in submodules:
            target=source/submodule['path'];target.mkdir(parents=True,exist_ok=True)
            with tarfile.open(out/submodule['archive']) as tar:tar.extractall(target,filter='data')
        extra=LOCAL/'extra'/a.instance_id
        extra_metadata=None
        if (extra/'manifest.json').exists():
            extra_metadata=json.loads((extra/'manifest.json').read_text())
            if hashlib.sha256((extra/'prepared.tar').read_bytes()).hexdigest()!=extra_metadata['sha256']:raise RuntimeError('Prepared dependency changed')
            with tarfile.open(extra/'prepared.tar') as tar:tar.extractall(source,filter='data')
            dependency_paths.extend(extra_metadata['directories'])
        git_nodes=list(source.rglob('.git'))
        if git_nodes: raise RuntimeError('Unexpected Git metadata in extracted dependency tree')
        # All dependency links must resolve to this same clean input, including workspaces.
        links=[]
        for directory, dirs, files in os.walk(source):
            for name in dirs+files:
                path=Path(directory)/name
                if path.is_symlink():
                    resolved=path.resolve()
                    if not resolved.is_relative_to(source.resolve()): raise RuntimeError('External dependency link: '+str(path))
                    links.append({'path':str(path.relative_to(source)),'target':os.readlink(path),'exists':resolved.exists()})
        broken=[link['path'] for link in links if not link['exists']]
        if broken:
            script='for p in "$@"; do if test -e "$p"; then printf "PRESENT %s\\n" "$p"; else printf "MISSING %s\\n" "$p"; fi; done'
            run(['bash','-c',script,'bash',*broken],out/'original-link-probe.txt')
            stdout=(out/'original-link-probe.txt').read_text()
            (out/'original-link-probe.json').write_text(json.dumps({'paths':broken,'exit':0,'stdout':stdout,'stderr':''},indent=2))
            if any('MISSING '+name not in stdout.splitlines() for name in broken):raise RuntimeError('Preparation broke an original dependency link')
        (out/'audit.json').write_text(json.dumps({'instance_id':a.instance_id,'base_commit':row['base_commit'],'image':image,'archives':{name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in ['base.tar','dependencies.tar']},'submodules':submodules,'prepared_extra':extra_metadata,'dependency_directories':dependency_paths,'dependency_links':links,'future_git_objects_present':False,'task_input_added':False},indent=2))
    finally:
        present=subprocess.run(['docker','inspect',name],capture_output=True)
        if present.returncode==0: subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
if __name__=='__main__':main()
