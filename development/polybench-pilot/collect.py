"""Export captured bytes and preserve unknown/infra outcomes for all 30 slots."""
import csv,hashlib,importlib.util,json,os,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'local/polybench-pilot';DEV=ROOT/'development/polybench-pilot'
spec=importlib.util.spec_from_file_location('pilot_results',DEV/'results.py');helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)
def read(path,default=None):return json.loads(path.read_text()) if path.exists() else default

def main():
 selection=read(DEV/'selection.json');batch=LOCAL/'batch';frozen=read(batch/'freeze.json')
 if frozen is None:raise RuntimeError('Real pilot is not frozen')
 records={};rows=[];meta={r['instance_id']:r for r in selection['selected']}
 for slot in selection['slots']:
  id=slot['instance_id'];arm=slot['arm'];folder=batch/'runs'/(id+'-'+arm)
  requests=read(folder/'provider-metadata.json',[]);started=any(r.get('forwarded') for r in requests)
  result=read(folder/'result.json',{});stop=read(folder/'stop-verification.json',{});native=read(folder/'native-evidence.json',{})
  capture=folder/'model.patch';patch=capture.read_bytes().decode('utf-8') if capture.exists() else None
  strict=None;strict_error=None
  if started and patch is not None:
   if not patch.strip():strict=True
   else:
    with tempfile.TemporaryDirectory(dir=LOCAL) as tmp:
     gitdir=Path(tmp)/'git';env={**os.environ,'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null'}
     subprocess.run(['git','init','--bare','--template=',gitdir],env=env,check=True,capture_output=True)
     source=LOCAL/'author-inputs'/id/'source'
     checked=subprocess.run(['git','--git-dir='+str(gitdir),'--work-tree='+str(source),'apply','--check','--binary',str(capture)],cwd=source,env=env,capture_output=True,text=True)
     strict=checked.returncode==0;strict_error=checked.stderr
  records[slot['slot']]={'started':started,'patch':patch}
  pending=sum(t.get('data',{}).get('state',{}).get('status') in ['pending','running'] for t in native.get('tools',[]))
  last={}
  for message in native.get('messages',[]):
   data=message.get('data',{})
   if data.get('role')=='assistant':last[message['session_id']]=data.get('finish')
  native_stops=bool(last) and all(value=='stop' for value in last.values())
  terminal=bool(result.get('nativeCompleted') and native_stops and stop.get('terminationVerified') and stop.get('captureSaved') and stop.get('relayRemoved') and stop.get('forwardingClosed') and not pending)
  harness_terminals=list((folder/'task-artifacts').glob('*/terminal.json')) if (folder/'task-artifacts').exists() else []
  delivery_record=arm=='P' or (len(harness_terminals)==1 and read(harness_terminals[0],{}).get('status')=='captured')
  T=bool(terminal and delivery_record and strict is True) if started else None
  row={**meta[id],**slot,'status':'started' if started else 'not_started','R':None,'T':T,'D_bench':None,'evaluation_status':'not_evaluated' if started and patch is not None else 'missing_capture' if started else 'not_started',
       'autonomous_delivery_record':delivery_record,'native_completed':result.get('nativeCompleted'),'native_session_stops':last,'pending_tools':pending,'termination':stop,'strict_patch_applicable':strict,'strict_application_diagnostic':strict_error,
       'patch_sha256':hashlib.sha256(capture.read_bytes()).hexdigest() if capture.exists() else None,'patch_bytes':capture.stat().st_size if capture.exists() else None,
       'author_elapsed_ms':result.get('elapsedMs'),'stop_reason':result.get('stopReason') or read(folder/'error.json',{}).get('message'),'workflow_status':result.get('workflowStatus'),'usage':helpers.usage(requests)}
  compat=list((folder/'task-artifacts').glob('*/type-compat.json')) if (folder/'task-artifacts').exists() else []
  row['type_compat']=read(compat[0]) if len(compat)==1 else None
  official=LOCAL/'evaluations'/arm/'results'/(id+'_result.json')
  evaluation_process=read(LOCAL/(arm+'-evaluation-process.json'))
  if evaluation_process and started and patch is not None and not official.exists():
   row['evaluation_status']='evaluator_error' if evaluation_process['exit_code']!=0 else 'missing_per_instance_output'
   row['evaluation_process']=evaluation_process
  if official.exists():
   if not started or patch is None:raise RuntimeError('Official result for an unevaluable slot')
   raw=read(official)
   if type(raw.get('resolved')) is not bool:raise RuntimeError('Invalid official result')
   row.update(R=raw['resolved'],D_bench=raw['resolved'] and T is True,evaluation_status='official_result',official_result=raw,observed_tests=len(raw['passed_tests'])+len(raw['failed_tests']))
   row['evaluation_tests_unobserved']=bool(patch and not row['observed_tests'])
   if not row['observed_tests']:row['evaluation_status']='official_empty_patch' if not patch.strip() else 'official_patch_rejected' if not raw['patch_applied'] else 'official_result_no_tests'
  rows.append(row)
 csv.field_size_limit(10000000)
 with (LOCAL/'selected.csv').open(newline='') as f:original=list(csv.DictReader(f))
 export=batch/'export'
 if not export.exists():helpers.export_started(selection['slots'],records,original,export)
 else:
  # Existing exported bytes are immutable; verify against current captured bytes.
  for arm in ['P','H0','H1']:
   expected=[{'instance_id':s['instance_id'],'model_patch':records[s['slot']]['patch']} for s in selection['slots'] if s['arm']==arm and records[s['slot']]['started'] and isinstance(records[s['slot']]['patch'],str)]
   actual=[json.loads(line) for line in (export/arm/'predictions.jsonl').read_text().splitlines()]
   if actual!=expected:raise RuntimeError('Export differs from immutable captured patches')
 output={'outcome':read(batch/'outcome.json'),'scheduling_pause':read(batch/'scheduling-paused.json'),'assigned':30,'started':sum(r['status']=='started' for r in rows),'slots':rows,'comparisons':{a+'-'+b:{field:helpers.paired(rows,a,b,field) for field in ['R','D_bench']} for a,b in [('H1','P'),('H0','P'),('H1','H0')]},'leave_one_repository_out':{repo:helpers.paired([r for r in rows if r['repo']!=repo],'H1','P','R') for repo in sorted({r['repo'] for r in rows})}}
 (batch/'accounting.json').write_text(json.dumps(output,indent=2))
 print(json.dumps({'assigned':30,'started':output['started'],'comparisons':output['comparisons']}))
if __name__=='__main__':main()
