"""Safe facts only; no automatic causal or full-quality verdict."""
import hashlib
import json
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
LOCAL=ROOT/'local/preservation-nudge-model-pair'
def get(p): return json.loads(p.read_bytes())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,x): p.write_text(json.dumps(x,indent=2)+'\n')
rows=[]
for slot,arm in enumerate(['OFF','ON'],1):
    d=LOCAL/'batch/runs'/('sveltejs__svelte-1190-'+arm)
    row={'slot':slot,'arm':arm,'status':'not_started','A':None,'Q_pair':None,'T':None,'D_pair':None}
    if not (d/'started.json').exists(): rows.append(row); continue
    row['status']='started'
    result=get(d/'result.json') if (d/'result.json').exists() else None
    records=get(d/'provider-metadata.json')
    forwarded=[r for r in records if r['forwarded']]
    row['provider']={'requests':len(forwarded),'recordedRequests':len(records),'notForwarded':len(records)-len(forwarded),'knownUsageRequests':sum(r.get('usage') is not None for r in forwarded),'unknownUsageRequests':sum(r.get('usage') is None for r in forwarded),'terminalStatuses':[r.get('serverCompletion','unknown') for r in forwarded], 'tokens':{k:sum((r.get('usage') or {}).get(k,0) for r in forwarded) for k in ['input_tokens','output_tokens','cached_tokens','reasoning_tokens']}}
    row['provider']['usageMeaning']='Known tokens only; cache/input and reasoning/output are subsets, not additive. Missing usage is unknown.'
    row['result']=result
    row['stop']=get(d/'stop-verification.json') if (d/'stop-verification.json').exists() else None
    native=get(d/'native-evidence.json') if (d/'native-evidence.json').exists() else None
    row['nativeToolCalls']=len(native['tools']) if native else None
    arts=list((d/'task-artifacts').glob('*/tool-events.json')) if (d/'task-artifacts').exists() else []
    events=get(arts[0]) if len(arts)==1 else []
    row['authorChecks']=[{'callID':e['callID'],'command':e['args'].get('command'),'cwd':e['args'].get('workdir'),'exit':e.get('exit'),'startedAt':e.get('startedAt'),'completedAt':e.get('completedAt'),'durationMs':e.get('completedAt',0)-e.get('startedAt',0),'outputSha256':hashlib.sha256(str(e.get('output','')).encode()).hexdigest()} for e in events if e.get('tool')=='bash']
    if len(arts)==1:
        n=arts[0].parent/'preservation-nudge.json'; row['advisory']=get(n) if n.exists() else None
    delivered=[]; inventories=[]
    for p in sorted(d.glob('request-*.json'),key=lambda p:int(p.stem.split('-')[-1])):
        b=get(p); request=int(p.stem.split('-')[-1]);
        assert b.get('store') is False, 'Recorded body must equal outgoing body after existing store=false transform'
        if b.get('tools'): inventories.append({'request':request,'tools':[t['name'] for t in b['tools']]})
        if 'Preservation advisory:' in p.read_text(): delivered.append({'request':request,'sha256':sha(p),'at':records[request-1]['at'],'forwarded':records[request-1]['forwarded']})
    row['advisoryRequests']=delivered;row['inventories']=inventories
    patch=d/'model.patch'
    if patch.exists():
        (HERE/'patches').mkdir(exist_ok=True);target=HERE/'patches'/(arm+'.patch');target.write_bytes(patch.read_bytes());row['patch']={'sha256':sha(patch),'bytes':patch.stat().st_size,'unaltered':target.read_bytes()==patch.read_bytes()}
    if result: row['status']='completed' if result.get('nativeCompleted') else 'incomplete'
    rows.append(row)
save(HERE/'results.json',{'rows':rows,'outcome':get(LOCAL/'batch/outcome.json') if (LOCAL/'batch/outcome.json').exists() else None})
print('Collected safe facts and unchanged patches; quality and causality remain separately assessed')
