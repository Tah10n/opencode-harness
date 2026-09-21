"""Export safe receipts for the single immutable plain attempt; no dispatch or scoring changes."""
import hashlib, json, shutil, sys
from datetime import datetime
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];LOCAL=ROOT/'local/plain-mui-18141'
sys.path.insert(0,str(ROOT/'development/polybench-pilot'))
from results import usage

def read(p): return json.loads(p.read_bytes())
def receipt(p): return {'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def save(p,v): p.write_text(json.dumps(v,indent=2)+'\n')

def main():
    run=LOCAL/'batch/runs/mui__material-ui-18141-P'
    outcome=read(LOCAL/'batch/outcome.json');result=read(run/'result.json');stop=read(run/'stop-verification.json')
    requests=read(run/'provider-metadata.json');native=read(run/'native-evidence.json');retained=read(run/'native-output/manifest.json')
    patch=run/'model.patch';evaluation=read(LOCAL/'evaluation/summary.json');assert len(evaluation['cases'])==1
    case=evaluation['cases'][0];assert case['patch_sha256']==receipt(patch)['sha256'];f,e=case['F'],case['E']
    final={}
    for message in native['messages']:
        data=message['data']
        if data.get('role')=='assistant':final[message['session_id']]=data.get('finish')
    pending=[t for t in native['tools'] if t['data'].get('state',{}).get('status') in ['pending','running']]
    events=[json.loads(x) for x in (run/'session/events.jsonl').read_text().splitlines()]
    texts=[x['part']['text'] for x in events if x.get('type')=='text' and isinstance(x.get('part',{}).get('text'),str)]
    t=bool(result.get('nativeCompleted') and final and all(v=='stop' for v in final.values()) and not pending and texts and all(stop.get(k) for k in ['terminationVerified','captureSaved','relayRemoved','forwardingClosed']) and retained['evidenceComplete'])
    q=None
    if f['assessment_integrity']=='verified' and e['assessment_integrity']=='verified':
        q=bool(case['delivery_apply'] and f['delivered_checks']=='passed' and e['acceptance_diag']['resolved'] and e['failed']==0 and not e['missing_required_tests'])
    d=False if q is False or t is False else True if q is True and t is True else None
    observed=[]
    for line in (LOCAL/'evaluation/P-E/raw-test.log').read_text().splitlines():
        if line.startswith('LITERAL_ID_OBSERVATION '):observed.append(json.loads(line.split(' ',1)[1]))
    for item in retained['files']:
        assert item['archiveComplete']
        file=run/item['destination'];assert file.stat().st_size==item['size'] and receipt(file)['sha256']==item['sha256']
    iso=lambda value: datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()*1000
    started_ms=iso(read(run/'started.json')['at']);completed_ms=iso(read(run/'completed.json')['at'])
    author_checks=[]
    for tool in native['tools']:
        data=tool['data'];state=data.get('state',{});command=state.get('input',{}).get('command','')
        if data.get('tool')=='bash' and any(x in command for x in ['mocha','eslint','diff --check']):
            author_checks.append({'sessionID':tool['session_id'],'callID':data.get('callID'),'command':command,'status':state.get('status'),'exit':state.get('metadata',{}).get('exit'),'output_sha256':hashlib.sha256(state.get('output','').encode()).hexdigest()})
    records=[{k:r.get(k) for k in ['requestIndex','requestKind','forwarded','status','serverCompletion','responseStatus','terminalEvents','usage','at','forwardedAt','finishedAt']} for r in requests]
    accounting=usage(requests)
    assert accounting['requests']==sum(bool(r.get('forwarded')) for r in requests)
    if q is not None:assert type(q) is bool
    output={'slot':1,'instance_id':'mui__material-ui-18141','arm':'P','status':'finished' if t else 'stopped','outcome':outcome,'delivery_apply':case['delivery_apply'],'F_checks':f['delivered_checks'],'assessment_integrity':e['assessment_integrity'],'acceptance_diag':e['acceptance_diag']['resolved'] if e.get('acceptance_diag') else None,'Q':q,'T':t,'D':d,'F_counts':{k:f.get(k) for k in ['passed','failed','failed_tests','error']},'E_counts':{k:e.get(k) for k in ['passed','failed','failed_tests','missing_required_tests','error']},'literal_id_observation':observed,'patch':receipt(patch),'usage':accounting,'requests_by_kind':{kind:sum(r.get('forwarded',False) and r.get('requestKind')==kind for r in requests) for kind in ['title','work']},'provider_requests':records,'author_checks':author_checks,'tools_by_kind':{k:sum(t['data']['tool']==k for t in native['tools']) for k in sorted({t['data']['tool'] for t in native['tools']})},'end_to_end_ms':round(completed_ms-started_ms),'setup_before_native_ms':round(result['completedAt']-result['executionElapsedMs']-started_ms),'post_native_exit_capture_cleanup_ms':round(completed_ms-result['completedAt']),'native_sessions':len(native['sessions']),'native_tools':len(native['tools']),'pending_tools':len(pending),'native_session_finishes':final,'execution_elapsed_ms':result.get('executionElapsedMs'),'native_cleanup_elapsed_ms':result.get('cleanupElapsedMs'),'native_elapsed_ms':result.get('elapsedMs'),'stop':stop,'native_output':retained,'evaluator_seconds':evaluation['seconds'],'evaluator_created_removed_match':sorted(evaluation['created_containers'])==sorted(evaluation['removed_containers']),'evaluation_summary':receipt(LOCAL/'evaluation/summary.json'),'final_response_retained':bool(texts),'final_response_sha256':hashlib.sha256(texts[-1].encode()).hexdigest() if texts else None,'raw_capture_receipts':[receipt(p) for p in sorted(run.rglob('*')) if p.is_file() and p.suffix in ['.json','.jsonl','.sse','.patch','.txt','.bin']],'scope':'Frozen TextField acceptance only, not official PolyBench resolved or a harness comparison.'}
    save(HERE/'result.json',output)
    shutil.copyfile(patch,HERE/'model.patch');assert (HERE/'model.patch').read_bytes()==patch.read_bytes()
    safe=read(HERE/'receipts.json');safe.setdefault('pre_dispatch_status',safe['real_run']);safe['preparation_evaluator_seconds']=round(safe['preparation_evaluator_seconds'],3);safe['real_run']={k:output[k] for k in ['status','delivery_apply','F_checks','assessment_integrity','acceptance_diag','Q','T','D','usage','native_tools','execution_elapsed_ms','native_cleanup_elapsed_ms','evaluator_seconds']};safe['direct_user_confirmation_received']=True;save(HERE/'receipts.json',safe)
    print(json.dumps({k:output[k] for k in ['Q','T','D','F_counts','E_counts','usage','native_tools','execution_elapsed_ms']},indent=2))
if __name__=='__main__':main()
