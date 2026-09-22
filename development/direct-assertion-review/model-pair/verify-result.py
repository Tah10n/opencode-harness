"""Model-free final evidence and arithmetic audit, no experiment retries."""
import collections
import hashlib
import json
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
DEV=ROOT/'development/direct-assertion-review/model-pair'
LOCAL=ROOT/'local/direct-assertion-review-model-pair'
get=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
f=get(LOCAL/'batch/freeze.json');manifest=get(DEV/'manifest.json');result=get(DEV/'result.json')
assert manifest['freezeSha256']==sha(LOCAL/'batch/freeze.json')
assert subprocess.check_output(['git','show',result['freezeCommit']+':development/direct-assertion-review/model-pair/manifest.json'],cwd=ROOT)==(DEV/'manifest.json').read_bytes()
for p,h in f['files'].items():assert sha(Path(p))==h,p
assert [r['arm'] for r in result['rows']]==['AR0','AR1']
run_dirs=list((LOCAL/'batch/runs').iterdir());assert len(run_dirs)<=2
for row in result['rows']:
    arm=row['arm'];run=LOCAL/'batch/runs'/('account-switch-ledger-'+arm)
    if row['status']=='not_started':assert not run.exists();continue
    for r in row['receipts']:
        p=ROOT/r['path'];assert p.stat().st_size==r['bytes'] and sha(p)==r['sha256']
    sent=[r for r in get(run/'provider-metadata.json') if r.get('forwarded')]
    assert row['providerRequests']==len(sent)
    assert sum(row['requestsByRole'].values())==len(sent)
    for key in ['input_tokens','output_tokens','cached_tokens','reasoning_tokens']:assert sum(x[key] for x in row['usageByRole'].values())==row['usage'][key]['observed']
    assert row['requestsByKind']==dict(collections.Counter(r['requestKind'] for r in sent))
    for key in ['input_tokens','output_tokens','cached_tokens','reasoning_tokens']:
        values=[r['usage'][key] for r in sent if r.get('usage') and key in r['usage']]
        assert row['usage'][key]==dict(observed=sum(values),unknown_requests=len(sent)-len(values))
    for r in sent:
        u=r.get('usage') or {}
        for sub,full in [('cached_tokens','input_tokens'),('reasoning_tokens','output_tokens')]:
            if sub in u and full in u:assert u[sub]<=u[full]
    if 'patch' in row:
        assert (DEV/(arm+'.patch')).read_bytes()==(run/'model.patch').read_bytes()
        assert row['patch']['sha256']==sha(run/'model.patch')
    if 'evaluation' in row:
        e=row['evaluation'];assert e==get(LOCAL/('evaluation-'+arm)/'summary.json')
        assert e['patchSha256']==sha(run/'model.patch')
        for receipt in [e['applyReceipt'],*e['F'],*e['E'],e.get('projectVerify'),*e.get('supplemental',[]),*e.get('additionalF',[])]:
            if receipt:assert sha(ROOT/receipt['file'])==receipt['sha256']
        assert e['contractTests']=={k:sum(x['counts'][k] or 0 for x in e['E']) for k in ['tests','pass','fail','skipped']}
    native_result=get(run/'result.json');stop=get(run/'stop-verification.json');reports=list((run/'task-artifacts').rglob('result.json'));terminal=list((run/'task-artifacts').rglob('terminal.patch'))
    full=get(reports[0]) if len(reports)==1 else {}
    expected_T=bool(native_result.get('nativeCompleted') and full.get('authorSummary','').strip() and full.get('termination',{}).get('verified') and len(terminal)==1 and terminal[0].read_bytes()==(run/'model.patch').read_bytes() and stop['captureSaved'] and stop['terminationVerified'] and stop['forwardingClosed'] and stop['relayRemoved'] and stop['activeProviderHandlers']==0)
    assert row['T']==expected_T
    assert row['D']==(False if row['Q'] is False or row['T'] is False else True if row['Q'] is True and row['T'] is True else None)
    assessment=get(DEV/(arm+'-assessment.json'))
    assert row['Q']==assessment['Q']
    for observation in assessment['supplementalObservations']:
        receipt=observation['receipt'];p=ROOT/receipt['path'];assert sha(p)==receipt['sha256'];assert json.loads(get(p)['stdout'])==observation['data']
    replay=assessment['originalPublicReplay'];assert sha(ROOT/replay['receipt']['path'])==replay['receipt']['sha256']
    trace=get(DEV/(arm+'-trajectory.json'))
    for event in trace['selectedEvents']:
        delivery=event['delivery']
        if not delivery:continue
        request=run/('request-'+str(delivery['firstRequest'])+'.json');assert sha(request)==delivery['requestSha256']
        item=next(x for x in get(request)['input'] if x.get('type')=='function_call_output' and x.get('call_id')==event['callID'])
        text=item['output'] if isinstance(item['output'],str) else json.dumps(item['output'],ensure_ascii=False)
        assert len(text.encode())==delivery['bytes'] and hashlib.sha256(text.encode()).hexdigest()==delivery['sha256']
assert result['monetaryCost'] is None
print('Frozen candidates, inputs, unchanged patches, receipts, usage arithmetic and Q/T/D verified.')

comparison=get(DEV/'input-comparison.json');texts={};inventories={}
for arm,receipt in comparison['receipts'].items():
    request=LOCAL/'batch/runs'/('account-switch-ledger-'+arm)/receipt['request'];assert sha(request)==receipt['sha256'];body=get(request)
    texts[arm]=next(part['text'] for x in body['input'] if isinstance(x.get('content'),list) for part in x['content'] if 'Implement the complete original task below' in part.get('text',''))
    inventories[arm]=body['tools']
assert inventories['AR0']==inventories['AR1']
block=(DEV/'AR1-initial-fixture-prompt.txt').read_text();block=block[block.index('During self-review,'):block.index('\nOriginal task:')]
assert any(texts['AR1'].replace(b,'',1)==texts['AR0'] for b in ['\n'+block,'\\n'+block.replace('\n','\\n')])
print('Actual initial author requests and terminal delivery independently verified.')
