"""Model-free checks of deterministic allocation and prediction validation."""
import collections, csv, importlib.util, json, random, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('pilot_selection',Path(__file__).with_name('selection.py'))
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
csv.field_size_limit(10000000)
saved=json.loads(Path(__file__).with_name('selection.json').read_text())
# Pure metadata fixture keeps ordinary verify independent of downloaded gold data.
rows=[{**r,'patch':'unread','test_patch':'unread','problem_statement':'fixture'} for r in saved['selected']]
dataset=root/'local/polybench/verified.csv'
if '--dataset' in __import__('sys').argv:
 with dataset.open(newline='') as f: rows=list(csv.DictReader(f))
ids=[r['instance_id'] for r in saved['selected']]
for seed in [0,1,17]:
 shuffled=list(rows);random.Random(seed).shuffle(shuffled)
 # Neither gold nor task content may influence selection.
 shuffled=[{**r,'patch':'unread','test_patch':'unread','problem_statement':'unread'} for r in shuffled]
 pool,selected=m.select(shuffled)
 assert [r['instance_id'] for r in selected]==ids
 assert collections.Counter(r['language'] for r in selected)=={'JavaScript':5,'TypeScript':5}
 assert max(collections.Counter(r['repo'] for r in selected).values())<=3
 assert len({r['repo'] for r in selected})>=4
 assert collections.Counter((r['language'],r['task_category']) for r in selected)==m.QUOTAS
slots=saved['slots'];assert len(slots)==30
assert [s['slot'] for s in slots]==list(range(1,31))
assert all(s['status']=='not_started' and s['R'] is None for s in slots)
for i,id in enumerate(ids):
 assert tuple(s['arm'] for s in slots if s['instance_id']==id)==[('P','H0','H1'),('H0','H1','P'),('H1','P','H0')][i%3]
if '--dataset' in __import__('sys').argv:
 with (root/'local/polybench/selected.csv').open(newline='') as f: subset=list(csv.DictReader(f))
 by_id={r['instance_id']:r for r in rows}
 assert subset==[by_id[id] for id in ids]
print(json.dumps({'deterministic_selection':True,'stratification':True,'slots':30,'source_rows_preserved':True,'provider_requests':0}))
import importlib.util, tempfile
spec=importlib.util.spec_from_file_location('pilot_results',Path(__file__).with_name('results.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
for predictions,expected in [([{'instance_id':'a','model_patch':None}],['a']),([{'instance_id':'a','model_patch':''}]*2,['a','b']),([],['a'])]:
 try: r.validate_predictions(predictions,expected)
 except ValueError: pass
 else: raise AssertionError('Invalid export accepted')
r.validate_predictions([{'instance_id':'a','model_patch':''}],['a'])
with tempfile.TemporaryDirectory() as tmp:
 status=r.export_started(slots,{1:{'started':True,'patch':''},2:{'started':True}},rows,Path(tmp)/'export')
 assert status['P']['evaluable']==1 and status['H0']['missing_capture']==[2] and status['H1']['started']==0
u=r.usage([{'forwarded':True,'usage':{'input_tokens':100,'output_tokens':20,'cached_tokens':80,'reasoning_tokens':10}},{'forwarded':True,'usage':None}])
assert u['input_tokens']=={'observed':100,'unknown_requests':1} and u['money'] is None
assert r.paired([{'instance_id':'a','arm':'P','R':True},{'instance_id':'a','arm':'H1','R':False},{'instance_id':'b','arm':'P','R':None}], 'H1','P','R')=={'wins':0,'losses':1,'ties':0,'unknown':1}
print('Prediction subsets, empty delivery, missing capture, unknown usage and paired accounting passed')
with tempfile.TemporaryDirectory() as tmp:
 patch='diff --git a/file b/file\n-old\r\n+new\r\n'
 r.export_started(slots,{1:{'started':True,'patch':patch}},rows,Path(tmp)/'export')
 prediction=json.loads((Path(tmp)/'export/P/predictions.jsonl').read_bytes().decode())
 assert prediction['model_patch'].encode()==patch.encode()
print('CRLF patch bytes survive prediction JSONL export')

# New campaign selection is metadata-only, deterministic and preserves pilot.
config=json.loads((root/'evaluation/polybench/campaigns/consolidated-v1/campaign.json').read_text())
new_saved=json.loads((root/'evaluation/polybench/campaigns/consolidated-v1/selection.json').read_text())
# Metadata fixture preserves the full pool distribution without private rows.
fixture=[]
for lang, counts in new_saved['pool_categories'].items():
 for cat, count in counts.items():
  existing=[x for x in new_saved['selected'] if x['language']==lang and x['task_category']==cat]
  fixture.extend(existing)
  fixture.extend(dict(instance_id=f'fixture-{lang}-{cat}-{i}',language=lang,task_category=cat,repo=f'fixture-repo-{i%10}') for i in range(count-len(existing)))
for seed in [0,1,17]:
 shuffled=list(fixture);random.Random(seed).shuffle(shuffled)
 pool,chosen,quotas,counts=m.select_campaign(shuffled,config)
 assert len(chosen)==20
 assert collections.Counter(x['language'] for x in chosen)=={'JavaScript':10,'TypeScript':10}
 assert max(collections.Counter(x['repo'] for x in chosen).values())<=4
 assert quotas==new_saved['quotas']
 assert not set(x['instance_id'] for x in chosen)&set(config['excluded_instance_ids'])
 if seed==0: expected=[x['instance_id'] for x in chosen]
 else: assert [x['instance_id'] for x in chosen]==expected
assert len(new_saved['slots'])==60
for i,row in enumerate(new_saved['selected']):
 assert [s['arm'] for s in new_saved['slots'][3*i:3*i+3]]==config['arms'][i%3:]+config['arms'][:i%3]
# A cap cannot be silently relaxed to fill a language.
try:m.select_campaign([{**x,'repo':'only-repository'} for x in fixture],config)
except ValueError:pass
else:raise AssertionError('Infeasible repository cap accepted')
if '--consolidated-dataset' in __import__('sys').argv:
 from campaign import CONFIG as active_config, SELECTION as active_selection
 active_config=active_config or config
 with (root/active_config['local_directory']/'verified.csv').open(newline='') as f: full=list(csv.DictReader(f))
 if active_config['name'] in ['evidence-backed-core-development-v1','evidence-backed-core-h2-v1','quality-confirmation-v1']:
  active_saved=json.loads(active_selection.read_text())
  assert len(active_saved['selected'])==active_config['task_count']
  assert len(active_saved['slots'])==active_config['slot_count']
  assert __import__('hashlib').sha256((root/active_config['local_directory']/'verified.csv').read_bytes()).hexdigest()==active_saved['dataset_sha256']
  by_id={x['instance_id']:x for x in full};chosen=[by_id[x['instance_id']] for x in active_saved['selected']]
  assert all(all(row[k]==saved[k] for k in saved) for row,saved in zip(chosen,active_saved['selected']))
  checked=subprocess.run(['node','--input-type=module','-e',"import {qualityAssignments} from './evaluation/polybench/campaign.mjs'; qualityAssignments("+json.dumps(active_config['name'])+");"],cwd=root,capture_output=True,text=True)
  if checked.returncode:raise RuntimeError(checked.stdout+checked.stderr)
 elif active_config['name']=='consolidated-remaining-v1':
  selected,slots=m.remaining_assignment(active_config)
  active_saved=json.loads(active_selection.read_text());assert active_saved['selected']==selected and active_saved['slots']==slots
  by_id={x['instance_id']:x for x in full};chosen=[by_id[x['instance_id']] for x in selected]
  assert all(all(row[k]==saved[k] for k in saved) for row,saved in zip(chosen,selected))
 else:
  _,chosen,quotas,counts=m.select_campaign(full,active_config)
  assert [x['instance_id'] for x in chosen]==[x['instance_id'] for x in new_saved['selected']]
  assert quotas==new_saved['quotas'] and counts==new_saved['pool_categories']
 with (root/active_config['local_directory']/'selected.csv').open(newline='') as f: assert list(csv.DictReader(f))==chosen
print('Consolidated selection: quotas, exclusions, global cap, cyclic slots and input-order independence passed')

remaining_config=json.loads((root/'evaluation/polybench/campaigns/consolidated-remaining-v1/campaign.json').read_text())
remaining_saved=json.loads((root/'evaluation/polybench/campaigns/consolidated-remaining-v1/selection.json').read_text())
selected,remaining_slots=m.remaining_assignment(remaining_config)
assert selected==remaining_saved['selected'] and remaining_slots==remaining_saved['slots']
assert len({(s['instance_id'],s['arm']) for s in remaining_slots})==24
for numbers in [remaining_config['origin']['original_slots']+[60],remaining_config['origin']['original_slots'][:-1],remaining_config['origin']['original_slots'][:-1]+[54]]:
 bad=json.loads(json.dumps(remaining_config));bad['origin']['original_slots']=numbers
 try:m.remaining_assignment(bad)
 except ValueError:pass
 else:raise AssertionError('Extra/duplicate/wrong historical assignment accepted')
with tempfile.TemporaryDirectory() as tmp:
 bad=json.loads(json.dumps(remaining_config));source=Path(bad['origin']['results_path']);data=json.loads(source.read_text())
 next(s for s in data['slots'] if s['slot']==31)['usage']['requests']=1
 changed=Path(tmp)/'already-executed.json';changed.write_text(json.dumps(data))
 bad['origin']['results_path']=str(changed);bad['origin']['results_sha256']=__import__('hashlib').sha256(changed.read_bytes()).hexdigest()
 try:m.remaining_assignment(bad)
 except ValueError as error:assert 'already executed' in str(error)
 else:raise AssertionError('Already executed historical attempt accepted')
print('Remaining historical projection and already-executed refusal passed')

# Evaluator imports must not see extra Python modules (including ignored files).
import subprocess
spec=importlib.util.spec_from_file_location('evaluator_integrity',Path(__file__).with_name('evaluator_integrity.py'))
integrity=importlib.util.module_from_spec(spec);spec.loader.exec_module(integrity)
with tempfile.TemporaryDirectory() as tmp:
 repo=Path(tmp)
 def git(*args):return subprocess.check_output(['git',*args],cwd=repo,stderr=subprocess.DEVNULL,text=True).strip()
 git('init','--quiet');(repo/'source.py').write_text('value = 1\n');(repo/'.gitignore').write_text('ignored.py\n')
 git('add','.');git('-c','user.name=fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','fixture')
 integrity.SHA=git('rev-parse','HEAD');integrity.verify(repo)
 for name in ['extra.py','ignored.py']:
  (repo/name).write_text('raise RuntimeError("not imported")\n')
  try:integrity.verify(repo)
  except RuntimeError:pass
  else:raise AssertionError('Extra evaluator source accepted')
  (repo/name).unlink()
 (repo/'source.py').write_text('value = 2\n')
 try:integrity.verify(repo)
 except RuntimeError:pass
 else:raise AssertionError('Modified evaluator source accepted')
print('Evaluator tracked and extra/ignored source integrity checks passed')
# Known paired outcomes exercise the prespecified analysis, including missing pairs.
six=[{'instance_id':str(i),'arm':arm,'R':arm=='T'} for i in range(6) for arm in ['P','T']]
stat=r.paired_statistics(six,'T','P','R',formal=True)
assert stat['wins']==6 and stat['losses']==0 and stat['delta_pp']==100 and stat['ci95_pp']==[100,100]
assert stat['exact_mcnemar_p']==0.03125
missing=r.paired_statistics([{'instance_id':'missing','arm':'P','R':None}],'T','P','R',formal=True)
assert missing['paired_tasks']==0 and missing['unknown']==1 and missing['delta_pp'] is None and missing['exact_mcnemar_p'] is None
assert r.paired_statistics(six,'T','P','R')['exact_mcnemar_p'] is None
print('Paired task statistics and missing-data accounting passed')
for wins,losses,ties in [(0,0,30),(6,0,0),(3,0,3),(2,4,24),(30,0,0)]:
 outcomes=[(True,False)]*wins+[(False,True)]*losses+[(False,False)]*ties
 sample=[{'instance_id':str(i),'arm':arm,'D':pair[j]} for i,pair in enumerate(outcomes) for j,arm in enumerate(['H','P'])]
 q=r.quality_paired_statistics(sample,'H','P','D',formal=True)
 assert q['paired_tasks']==len(outcomes) and q['delta_pp']==100*(wins-losses)/len(outcomes)
 assert q['ci95_pp'][0] < q['delta_pp'] < q['ci95_pp'][1] or q['delta_pp'] in [-100,100]
 if wins==6 and not losses and not ties:assert q['exact_mcnemar_p']==.03125
 if wins==3 and not losses:assert q['exact_mcnemar_p']==.25
 if not wins and not losses:
  bound=100*(1-.0125**(1/30));assert abs(q['ci95_pp'][0]+bound)<1e-10 and abs(q['ci95_pp'][1]-bound)<1e-10
  assert q['exact_mcnemar_p']==1 and q['ci95_pp'][0]<0<q['ci95_pp'][1]
assert r.quality_paired_statistics([{'instance_id':'missing','arm':'P','D':None}],'H','P','D',True)['ci95_pp'] is None
print('New quality interval is nondegenerate for all ties; exact McNemar and missing-pair checks passed')
# Independent multinomial enumeration checks interval coverage, including ties.
import math
intervals={}
for w in range(7):
 for l in range(7-w):
  sample=[{'instance_id':str(i),'arm':arm,'D':pair[j]} for i,pair in enumerate([(True,False)]*w+[(False,True)]*l+[(False,False)]*(6-w-l)) for j,arm in enumerate(['H','P'])]
  intervals[w,l]=r.quality_paired_statistics(sample,'H','P','D')['ci95_pp']
minimum_coverage=1.
for a in range(21):
 for b in range(21-a):
  pw,pl=a/20,b/20;coverage=0.;delta=100*(pw-pl)
  for (w,l),(low,high) in intervals.items():
   if low-1e-10<=delta<=high+1e-10:
    t=6-w-l;coverage+=math.factorial(6)/math.factorial(w)/math.factorial(l)/math.factorial(t)*pw**w*pl**l*max(0.,1-pw-pl)**t
  minimum_coverage=min(minimum_coverage,coverage)
assert minimum_coverage>=.95-1e-10
print('Exact multinomial interval coverage grid passed; minimum='+str(minimum_coverage))
checked=subprocess.run(['node',str(root/'evaluation/polybench/verify-campaign.mjs')],capture_output=True,text=True)
if checked.returncode:raise RuntimeError(checked.stdout+checked.stderr)
print(checked.stdout.splitlines()[-1])
# Reader contract: official partial-patch quality is independent of delivery and
# unknown provider usage; missing capture is never exported as an empty patch.
spec=importlib.util.spec_from_file_location('campaign_collect',Path(__file__).with_name('collect.py'))
collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
import contextlib,io,hashlib
with tempfile.TemporaryDirectory() as tmp:
 base=Path(tmp);batch=base/'batch';batch.mkdir();task='fixture-task'
 slots=[{'slot':i+1,'instance_id':task,'arm':arm,'status':'not_started'} for i,arm in enumerate(['P','C','T'])]
 selected={'instance_id':task,'repo':'fixture/repo','language':'JavaScript','task_category':'Bug Fix','base_commit':'0'*40}
 (base/'selection.json').write_text(json.dumps({'selected':[selected],'slots':slots}))
 (batch/'freeze.json').write_text(json.dumps({'preparation':{task:{'status':'ready'}}}))
 source=base/'author-inputs'/task/'source';source.mkdir(parents=True);(source/'a.txt').write_text('old\n')
 patch='diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n'
 records={}
 for slot in slots:
  arm=slot['arm'];folder=batch/'runs'/(task+'-'+arm);folder.mkdir(parents=True)
  def put(name,data):(folder/name).write_text(json.dumps(data))
  put('provider-metadata.json',[{'forwarded':True,'serverCompletion':'unknown' if arm=='T' else 'completed','usage':None if arm=='T' else {'input_tokens':10,'output_tokens':2,'cached_tokens':0,'reasoning_tokens':0},'recording':{'evidenceComplete':True}}])
  put('result.json',{'nativeCompleted':arm=='P'})
  put('stop-verification.json',{'terminationVerified':True,'captureSaved':arm!='C','relayRemoved':True,'forwardingClosed':True})
  put('native-evidence.json',{'tools':[],'messages':[{'session_id':'s','data':{'role':'assistant','finish':'stop','time':{'created':2}}},{'session_id':'s','data':{'role':'assistant','finish':'tool-calls','time':{'created':1}}}]})
  put('evidence-capture.json',{'kind':'evidence_complete' if arm!='C' else 'evidence_incomplete'})
  if arm!='C':(folder/'model.patch').write_text(patch)
  records[slot['slot']]={'started':True,**({'patch':patch} if arm!='C' else {})}
 with (base/'selected.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(selected));w.writeheader();w.writerow(selected)
 r.export_started(slots,records,[selected],batch/'export')
 for arm in ['P','T']:
  evaluation=base/'evaluations'/arm;out=evaluation/'results';out.mkdir(parents=True)
  (out/(task+'_result.json')).write_text(json.dumps({'resolved':True,'passed_tests':['public-fixture'],'failed_tests':[],'patch_applied':True}))
  (evaluation/'provenance.json').write_text(json.dumps({'evaluator':'9c836c5d7f3cb991934132b77d29e6941d912a07','predictions_sha256':hashlib.sha256((batch/'export'/arm/'predictions.jsonl').read_bytes()).hexdigest()}))
 collector.LOCAL=base;collector.SELECTION=base/'selection.json';collector.CONFIG={'name':'fixture'};collector.ARMS=['P','C','T']
 with contextlib.redirect_stdout(io.StringIO()):collector.main()
 data=json.loads((batch/'accounting.json').read_text());by={x['arm']:x for x in data['slots']}
 assert by['P']['R'] is True and by['P']['T'] is True and by['P']['D'] is True and by['P']['artifact_kind']=='terminal'
 assert by['C']['R'] is None and by['C']['D'] is None and by['C']['artifact_kind'] is None
 assert by['T']['R'] is True and by['T']['T'] is False and by['T']['D'] is False and by['T']['artifact_kind']=='partial'
 assert by['T']['provider_outcome']=='unknown_submission' and by['T']['usage_complete'] is False
 assert (batch/'export/C/predictions.jsonl').read_text()==''
 print('Campaign reader preserves partial R, autonomous T/D, missing capture and unknown usage independently')
 # New native core labels deliver directly; no task terminal record is required.
 import shutil
 shutil.copytree(batch/'runs'/(task+'-C'),batch/'runs'/(task+'-C0'))
 shutil.copytree(batch/'runs'/(task+'-T'),batch/'runs'/(task+'-H1'))
 shutil.copytree(base/'evaluations/T',base/'evaluations/H1')
 new_slots=[{**slot,'arm':arm} for slot,arm in zip(slots,['P','C0','H1'])]
 (base/'selection.json').write_text(json.dumps({'selected':[selected],'slots':new_slots}))
 for arm in ['P','H1']:
  folder=batch/'runs'/(task+'-'+arm)
  (folder/'result.json').write_text(json.dumps({'nativeCompleted':True}))
  (folder/'patch-capture.json').write_text(json.dumps({'roundtripVerified':True}))
  (folder/'provider-metadata.json').write_text(json.dumps([{'forwarded':True,'serverCompletion':'completed','usage':{'input_tokens':10,'output_tokens':2,'cached_tokens':0,'reasoning_tokens':0},'recording':{'evidenceComplete':True}}]))
 shutil.rmtree(batch/'export')
 collector.CONFIG={'name':'evidence-backed-core-development-v1','arm_modes':{'P':'plain','C0':'core','H1':'core'}};collector.ARMS=['P','C0','H1']
 new_records={1:records[1],2:records[2],3:records[3]};r.export_started(new_slots,new_records,[selected],batch/'export')
 with contextlib.redirect_stdout(io.StringIO()):collector.main()
 data=json.loads((batch/'accounting.json').read_text());by={x['arm']:x for x in data['slots']}
 assert by['H1']['R'] is True and by['H1']['T_delivery'] is True and by['H1']['D'] is True and by['H1']['autonomous_delivery_record'] is True
 assert by['C0']['D'] is None and data['comparisons']['H1-P']['D']['unknown']==0
 (batch/'runs'/(task+'-H1')/'provider-metadata.json').write_text(json.dumps([{'forwarded':True,'serverCompletion':'unknown','usage':None,'recording':{'evidenceComplete':True}}]))
 with contextlib.redirect_stdout(io.StringIO()):collector.main()
 by={x['arm']:x for x in json.loads((batch/'accounting.json').read_text())['slots']}
 assert by['H1']['R'] is True and by['H1']['T_delivery'] is False and by['H1']['D'] is False and by['H1']['artifact_kind']=='partial'
print('New direct core delivery, roundtrip/capture/provider trust and primary D accounting passed')
subprocess.run([__import__('sys').executable, Path(__file__).with_name('verify_tap_identity.py')], check=True)
