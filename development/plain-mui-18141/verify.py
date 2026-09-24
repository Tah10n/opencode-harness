"""Read-only verification of this stage's frozen inputs, receipts and arithmetic."""
import ast, hashlib, json, subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];LOCAL=ROOT/'local/plain-mui-18141'
def get(p):return json.loads(p.read_bytes())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
old=get(ROOT/'development/plain-contract-admission/receipts.json')
for item in old['preserved_local_stop_state']:assert sha(ROOT/item['path'])==item['sha256']
for path in ['development/plain-contract-admission','development/polybench-pilot/results','development/polybench-pilot/frozen-manifest.json','development/polybench-pilot/prompts']:
    assert not subprocess.check_output(['git','diff','711f91185eca48059ff4fcd0d031cf3963501a5a','--',path],cwd=ROOT),path
r=LOCAL/'preflight/runs/mui__material-ui-18141-P';out=get(r/'result.json');stop=get(r/'stop-verification.json');retained=get(r/'native-output/manifest.json');requests=get(r/'provider-metadata.json')
assert out['nativeCompleted'] and out['sessions']==1 and out['toolCalls']==5 and out['requests']==len(requests)==7
assert all(stop[k] for k in ['terminationVerified','captureSaved','forwardingClosed','relayRemoved']);assert stop['activeProviderHandlers']==0
assert retained['evidenceComplete']
for f in retained['files']:
    assert f['archiveComplete'] and f['linkStatus']=='linked'
    data=(r/f['destination']).read_bytes();assert len(data)==f['size'] and hashlib.sha256(data).hexdigest()==f['sha256']
expected=''.join('PLAIN_SPILL_'+str(i)+'\n' for i in range(2400)).encode()
assert any(f['sha256']==hashlib.sha256(expected).hexdigest() for f in retained['files'])
prompt=(ROOT/'development/polybench-pilot/prompts/mui__material-ui-18141.md').read_bytes().decode()
for file in r.glob('request-*.json'):
    req=get(file);texts=[c.get('text','') for x in req['input'] if isinstance(x.get('content'),list) for c in x['content']]
    assert any(prompt in t for t in texts)
    names=[t['name'] for t in req.get('tools',[])];assert 'webfetch' not in names and not any('harness' in n for n in names)
    assert req['reasoning']['effort']=='high' and req['model']=='gpt-5.6-luna'
cal=LOCAL/'calibration-2/summary.json'
if cal.exists():
    c=get(cal);assert c['calibration_passed'] and c['historical_inputs_unchanged'];assert sorted(c['created_containers'])==sorted(c['removed_containers'])
    for case in c['cases']:
        e=case['E'];assert e['assessment_integrity']=='verified' and e['expectations_unchanged'] and e['missing_required_tests']==[]
        assert e['runner_stats']['passes']==e['passed'] and e['runner_stats']['failures']==e['failed']
        assert e['integrity']['outside_surface_equal']
print('Stage input, scripted capture, preservation, inventory and arithmetic checks passed.')
