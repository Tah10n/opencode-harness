"""Model-free checks of deterministic allocation and prediction validation."""
import collections, csv, importlib.util, json, random
from pathlib import Path
root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('pilot_selection',Path(__file__).with_name('selection.py'))
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
csv.field_size_limit(10000000)
with (root/'local/polybench-pilot/verified.csv').open(newline='') as f: rows=list(csv.DictReader(f))
saved=json.loads(Path(__file__).with_name('selection.json').read_text())
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
with (root/'local/polybench-pilot/selected.csv').open(newline='') as f: subset=list(csv.DictReader(f))
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
with tempfile.TemporaryDirectory(dir=root/'local/polybench-pilot') as tmp:
 status=r.export_started(slots,{1:{'started':True,'patch':''},2:{'started':True}},rows,Path(tmp)/'export')
 assert status['P']['evaluable']==1 and status['H0']['missing_capture']==[2] and status['H1']['started']==0
u=r.usage([{'forwarded':True,'usage':{'input_tokens':100,'output_tokens':20,'cached_tokens':80,'reasoning_tokens':10}},{'forwarded':True,'usage':None}])
assert u['input_tokens']=={'observed':100,'unknown_requests':1} and u['money'] is None
assert r.paired([{'instance_id':'a','arm':'P','R':True},{'instance_id':'a','arm':'H1','R':False},{'instance_id':'b','arm':'P','R':None}], 'H1','P','R')=={'wins':0,'losses':1,'ties':0,'unknown':1}
print('Prediction subsets, empty delivery, missing capture, unknown usage and paired accounting passed')
with tempfile.TemporaryDirectory(dir=root/'local/polybench-pilot') as tmp:
 patch='diff --git a/file b/file\n-old\r\n+new\r\n'
 r.export_started(slots,{1:{'started':True,'patch':patch}},rows,Path(tmp)/'export')
 prediction=json.loads((Path(tmp)/'export/P/predictions.jsonl').read_bytes().decode())
 assert prediction['model_patch'].encode()==patch.encode()
print('CRLF patch bytes survive prediction JSONL export')
