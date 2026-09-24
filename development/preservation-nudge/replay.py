"""Offline input projection only; no shell/project/evaluator/model execution."""
import json, re, hashlib, difflib
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=root/'local/polybench-pilot/author-inputs/sveltejs__svelte-1190/source'
art=root/'local/polybench-pilot/batch/runs/sveltejs__svelte-1190-H1/task-artifacts/900b7402-f2bb-413c-b78f-531cbd7efe22'
events=json.loads((art/'tool-events.json').read_text())
initial=json.loads((art/'initial.json').read_text())
changed={}; before={}
for i,e in enumerate(events[:92]):
    if e['tool']!='apply_patch': continue
    patch=e['args']['patchText']
    for m in re.finditer(r'^\*\*\* (Add File|Update File): ([\w/.-]+)\n([\s\S]*?)(?=^\*\*\* |\Z)',patch,re.M):
        kind,name,body=m.groups()
        assert '..' not in Path(name).parts
        if name not in before: before[name]=(source/name).read_text() if (source/name).exists() else None
        text=changed.get(name,before[name])
        if kind=='Add File':
            assert text is None
            text=''.join(line[1:] for line in body.splitlines(keepends=True) if line.startswith('+'))
        else:
            assert text is not None
            for hunk in re.split(r'^@@[^\n]*\n',body,flags=re.M)[1:]:
                old=''.join(line[1:] for line in hunk.splitlines(keepends=True) if line.startswith((' ','-')))
                new=''.join(line[1:] for line in hunk.splitlines(keepends=True) if line.startswith((' ','+')))
                assert old and text.count(old)==1, (i,name,'ambiguous context')
                text=text.replace(old,new,1)
        changed[name]=text
parts=[]
for name,text in changed.items():
    if before[name]==text: continue
    parts.append('diff --git a/'+name+' b/'+name+'\n'+''.join(difflib.unified_diff((before[name] or '').splitlines(keepends=True),text.splitlines(keepends=True),fromfile='a/'+name,tofile='b/'+name)))
# Snapshot IDs remain recorded links, not recomputed whole-tree claims.
print(json.dumps({'initial':initial,'events':events[:93],'diff':''.join(parts),'changed':changed,'source':str(source),'originals':str(art/'original-tests'),
 'provenance':{'toolEventsSha256':hashlib.sha256((art/'tool-events.json').read_bytes()).hexdigest(),'projection':'Exact unique-context replay of every native apply_patch through e91; only changed-file bytes reconstructed. No whole intermediate tree or ignored build hashes claimed.'}}))
