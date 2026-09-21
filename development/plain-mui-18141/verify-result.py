"""Verify immutable delivery and exported arithmetic against actual retained records."""
import hashlib, json, subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];LOCAL=ROOT/'local/plain-mui-18141'
def get(p):return json.loads(p.read_bytes())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
r=get(HERE/'result.json');run=LOCAL/'batch/runs/mui__material-ui-18141-P'
assert (HERE/'model.patch').read_bytes()==(run/'model.patch').read_bytes()
assert r['patch']['sha256']==sha(HERE/'model.patch')
assert len(list((LOCAL/'batch/runs').iterdir()))==1
manifest=get(HERE/'manifest.json');frozen=get(LOCAL/'batch/freeze.json');commit=get(LOCAL/'batch/freeze-commit.json')['commit']
assert subprocess.check_output(['git','show',commit+':development/plain-mui-18141/manifest.json'],cwd=ROOT)==(HERE/'manifest.json').read_bytes()
assert manifest['freezeSha256']==sha(LOCAL/'batch/freeze.json')
for path,h in frozen['files'].items():assert sha(Path(path))==h,path
for path,expected in [(run/'result.json',None),(run/'stop-verification.json',None)]:assert path.is_file()
provider=get(run/'provider-metadata.json');sent=[x for x in provider if x.get('forwarded')]
assert r['usage']['requests']==len(sent)==15
assert r['requests_by_kind']=={'title':1,'work':14}
for key in ['input_tokens','output_tokens','cached_tokens','reasoning_tokens']:
    values=[x['usage'][key] for x in sent if x.get('usage') and key in x['usage']]
    assert r['usage'][key]['observed']==sum(values)
    assert r['usage'][key]['unknown_requests']==len(sent)-len(values)
assert r['usage']['cached_tokens']['observed']<=r['usage']['input_tokens']['observed']
assert r['usage']['reasoning_tokens']['observed']<=r['usage']['output_tokens']['observed']
assert r['end_to_end_ms']==r['setup_before_native_ms']+r['execution_elapsed_ms']+r['post_native_exit_capture_cleanup_ms']
assert r['native_tools']==sum(r['tools_by_kind'].values())==33
assert r['native_sessions']==1 and r['pending_tools']==0
for artifact in r['raw_capture_receipts']:
    p=ROOT/artifact['path'];assert p.stat().st_size==artifact['bytes'] and sha(p)==artifact['sha256']
eval=get(LOCAL/'evaluation/summary.json');assert eval['historical_inputs_unchanged'] and sorted(eval['created_containers'])==sorted(eval['removed_containers'])
case=eval['cases'][0];assert case['delivery_apply'] and case['patch_sha256']==sha(HERE/'model.patch')
for world,count in [('F',19),('E',20)]:
    item=case[world];assert item['assessment_integrity']=='verified' and item['passed']==count and item['failed']==0 and item['exit_code']==0
    assert item['expectations_unchanged'] and item['integrity']['outside_surface_equal']
assert case['E']['missing_required_tests']==[] and case['E']['acceptance_diag']['resolved']
assert r['literal_id_observation']==[{'suppliedId':'labelled-select','selectId':'labelled-select','labelHtmlFor':'labelled-select'}]
assert all(r[k] is True for k in ['delivery_apply','acceptance_diag','Q','T','D'])
print('Immutable M, frozen protocol, real capture, exact F/E inventory, Q/T/D and accounting verified.')
