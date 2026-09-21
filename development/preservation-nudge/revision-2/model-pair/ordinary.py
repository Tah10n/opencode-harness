"""Apply each unchanged full patch in an ordinary archive-backed Git copy."""
import hashlib
import json
from pathlib import Path
import subprocess
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[3]
LOCAL=ROOT/'local/preservation-nudge-revision-2-model-pair'
def git(cwd,*args):return subprocess.check_output(['git','-c','core.autocrlf=false','-c','core.hooksPath=/dev/null',*args],cwd=cwd)
for arm in ['ON','OFF']:
    run=LOCAL/'batch/runs'/('sveltejs__svelte-1190-'+arm)
    patch=run/'model.patch'
    if not patch.exists():continue
    target=LOCAL/('ordinary-'+arm);target.mkdir(mode=0o700)
    subprocess.run(['tar','-xf',str(ROOT/'local/polybench-pilot/author-inputs/sveltejs__svelte-1190/base.tar'),'-C',str(target)],check=True)
    git(target,'init','--quiet');git(target,'add','.');git(target,'-c','user.name=Development','-c','user.email=development@localhost','commit','--quiet','-m','Exact public baseline')
    git(target,'apply','--check',str(patch));git(target,'apply','--index',str(patch))
    changed=git(target,'diff','--cached','--name-only','-z').decode().split('\0')
    assert not any(p.startswith(('.git/','.opencode/')) or '/template/' in p or '/work/' in p for p in changed)
    entries={}
    for record in git(target,'ls-files','--stage','-z').split(b'\0'):
        if not record:continue
        meta,name=record.split(b'\t',1);mode,blob,stage=meta.split();file=target/name.decode()
        assert stage==b'0' and mode in (b'100644',b'100755') and not file.is_symlink()
        assert git(target,'cat-file','blob',blob.decode())==file.read_bytes()
        assert bool(file.stat().st_mode & 0o111)==(mode==b'100755')
        entries[name.decode()]={'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'mode':mode.decode()}
    terminal=list((run/'task-artifacts').glob('*/terminal.patch'))
    equal=len(terminal)==1 and terminal[0].read_bytes()==patch.read_bytes()
    result={'applies':True,'tree':git(target,'write-tree').decode().strip(),'terminalEqualsFullCollector':equal,'patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'bytesAndModesVerified':True,'files':len(entries),'inventorySha256':hashlib.sha256(json.dumps(entries,sort_keys=True).encode()).hexdigest()}
    (LOCAL/('ordinary-'+arm+'.json')).write_text(json.dumps(result,indent=2)+'\n')
    print(arm,json.dumps(result))
