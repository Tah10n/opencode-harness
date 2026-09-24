"""Inspect only explicitly pulled v1.1 images; never trust evaluator aliases."""
import json, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
local=root/'local/polybench-pilot'
selection=json.loads((root/'development/polybench-pilot/selection.json').read_text())
images=json.loads((local/'images.json').read_text()) if (local/'images.json').exists() else {}
for row in selection['selected']:
    tag='ghcr.io/timesler/swe-polybench.eval.x86_64.'+row['instance_id'].lower()+':v1.1'
    result=subprocess.run(['docker','image','inspect',tag],capture_output=True,text=True)
    if result.returncode:
        if "No such image:" in result.stderr: continue
        raise RuntimeError("Docker image inspection failed: "+result.stderr)
    data=json.loads(result.stdout)[0]
    digest=next(d for d in data['RepoDigests'] if d.startswith(tag.split(':')[0]+'@'))
    alias='polybench_'+row['language'].lower()+'_'+row['instance_id'].lower()
    entry={'tag':tag,'digest':digest,'id':data['Id'],'architecture':data['Architecture'],'os':data['Os'],'size':data['Size'],'workdir':data['Config']['WorkingDir']}
    if alias in images and images[alias]!=entry: raise RuntimeError('Previously pinned identity changed')
    images[alias]=entry
(local/'images.json').write_text(json.dumps(images,indent=2)+'\n')
print(json.dumps(images,indent=2))
