"""Export safe receipts and accounting without changing candidate or acceptance."""
import collections
import datetime
import hashlib
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
DEV = ROOT / 'development/direct-assertion-review/model-pair'
LOCAL = ROOT / 'local/direct-assertion-review-model-pair'
get = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def receipt(p):
    return dict(path=str(p.relative_to(ROOT)), bytes=p.stat().st_size, sha256=sha(p))
def stamp(t):
    return datetime.datetime.fromisoformat(t.replace('Z', '+00:00'))
rows=[]
for slot,arm in enumerate(['AR0','AR1'],1):
    run=LOCAL/'batch/runs'/('account-switch-ledger-'+arm)
    if not run.exists():
        rows.append(dict(slot=slot,arm=arm,status='not_started',Q=None,T=None,D=None,providerRequests=0))
        continue
    result=get(run/'result.json') if (run/'result.json').exists() else {}
    stop=get(run/'stop-verification.json')
    native=get(run/'native-evidence.json') if (run/'native-evidence.json').exists() else None
    sent=[r for r in get(run/'provider-metadata.json') if r.get('forwarded')]
    requestRoles={}
    for r in sent:
        b=get(run/('request-'+str(r['requestIndex'])+'.json'));names=[t.get('name') for t in b.get('tools',[])]
        requestRoles[r['requestIndex']]='title' if not names else 'parent' if 'harness_task' in names else 'author'
    usage={key:dict(observed=sum(r.get('usage',{}).get(key,0) for r in sent if r.get('usage')),unknown_requests=sum(not r.get('usage') or key not in r['usage'] for r in sent)) for key in ['input_tokens','output_tokens','cached_tokens','reasoning_tokens']}
    usage['subsetNote']='Cached is included in input, reasoning in output; never add subsets again.'
    workflow=None
    if native:
        for t in native['tools']:
            if t['data']['tool']=='harness_task':
                try: workflow=json.loads(t['data']['state']['output'])
                except (ValueError,KeyError): pass
    reports=list((run/'task-artifacts').rglob('result.json')) if (run/'task-artifacts').exists() else []
    if workflow and len(reports)==1:workflow={**get(reports[0]),**workflow}
    patch=run/'model.patch'
    terminalEqual=None
    if workflow:
        terminals=list((run/'task-artifacts').rglob('terminal.patch'))
        if len(terminals)==1: terminalEqual=terminals[0].read_bytes()==patch.read_bytes()
    T=bool(result.get('nativeCompleted') and workflow and bool(workflow.get('authorSummary','').strip()) and workflow.get('termination',{}).get('verified') and terminalEqual and stop['captureSaved'] and stop['terminationVerified'] and stop['forwardingClosed'] and stop['relayRemoved'] and stop['activeProviderHandlers']==0)
    evaluation=LOCAL/('evaluation-'+arm)/'summary.json'
    assessment=DEV/(arm+'-assessment.json')
    Q=get(assessment)['Q'] if assessment.exists() else None
    D=False if Q is False or T is False else True if Q is True and T is True else None
    selected=['started.json','completed.json','result.json','error.json','stop-verification.json','provider-metadata.json','native-evidence.json','patch-capture.json','evidence-capture.json','native-output/manifest.json','session/finished.json','session/cleanup.json']
    row=dict(slot=slot,arm=arm,status='completed' if T else 'stopped',nativeOutcome=result,workflowStatus=workflow.get('status') if workflow else None,Q=Q,T=T,D=D,providerRequests=len(sent),requestsByKind=dict(collections.Counter(r['requestKind'] for r in sent)),unknownServerCompletion=sum(r.get('serverCompletion') not in ['completed','failed','incomplete','known_refusal'] for r in sent),usage=usage,termination=stop,terminalPatchEqualsCapture=terminalEqual,receipts=[receipt(run/n) for n in selected if (run/n).is_file()])
    row['requestsByRole']=dict(collections.Counter(requestRoles.values()))
    row['usageByRole']={role:{key:sum(r.get('usage',{}).get(key,0) for r in sent if r.get('usage') and requestRoles[r['requestIndex']]==role) for key in ['input_tokens','output_tokens','cached_tokens','reasoning_tokens']} for role in set(requestRoles.values())}
    if native:
        row['nativeTools']=len(native['tools']);row['toolsByKind']=dict(collections.Counter(t['data']['tool'] for t in native['tools']));row['nativeSessions']=len(native['sessions'])
        roles={s['id']:('parent' if not s.get('parent_id') else 'child') for s in native['sessions']}
        if workflow:
            roles.update({v:k for k,v in workflow.get('sessions',{}).items()})
        row['toolsBySessionRole']=dict(collections.Counter(roles.get(t['session_id'],'unknown') for t in native['tools']))
        row['bashDurationMs']=sum(max(0,t['data'].get('state',{}).get('time',{}).get('end',0)-t['data'].get('state',{}).get('time',{}).get('start',0)) for t in native['tools'] if t['data']['tool']=='bash' and t['data'].get('state',{}).get('time',{}).get('end'))
    if native:
        groups=collections.defaultdict(lambda:dict(calls=0,durationMs=0))
        for t in native['tools']:
            if t['data']['tool']!='bash':continue
            st=t['data'].get('state',{});c=st.get('input',{}).get('command','');times=st.get('time',{})
            key='tests' if 'node --test' in c else 'projectVerify' if 'pnpm verify' in c else 'syntax' if 'node --check' in c else 'otherBash'
            groups[key]['calls']+=1
            if times.get('end'):groups[key]['durationMs']+=max(0,times['end']-times.get('start',times['end']))
        row['bashTimeByPurpose']=dict(groups)
    if (run/'completed.json').exists():row['slotElapsedMs']=round((stamp(get(run/'completed.json')['at'])-stamp(get(run/'started.json')['at'])).total_seconds()*1000)
    if patch.exists():
        (DEV/(arm+'.patch')).write_bytes(patch.read_bytes());row['patch']=receipt(patch)
    if evaluation.exists():row['evaluation']=get(evaluation)
    rows.append(row)
result=dict(freezeCommit=get(LOCAL/'batch/freeze-commit.json')['commit'],outcome=get(LOCAL/'batch/outcome.json'),rows=rows,rawProviderSSE='Not saved for this new experiment kind: response recording allowlist was not extended. Terminal provider metadata, outgoing request histories, native evidence and linked full tool outputs remain the evidence sources; no raw SSE reconstruction.',monetaryCost=None,monetaryCostReason='No billing record; no dollar estimate.',separateAccounting='Scripted/preparation/evaluator/developing-agent work is excluded from Luna totals; developing-agent token and billing totals unavailable.')
(DEV/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps([dict(arm=r['arm'],status=r['status'],Q=r['Q'],T=r['T'],D=r['D'],requests=r['providerRequests']) for r in rows]))
