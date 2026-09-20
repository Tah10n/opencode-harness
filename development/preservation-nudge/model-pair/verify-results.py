"""Bounded post-run arithmetic, provenance, receipt and immutable patch audit."""
import hashlib
import ast
import csv
import json
from pathlib import Path
import subprocess
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[2]; LOCAL=ROOT/'local/preservation-nudge-model-pair'
def get(p):return json.loads(p.read_bytes())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
m=get(HERE/'manifest.json');f=get(LOCAL/'batch/freeze.json');freeze=get(LOCAL/'batch/freeze-commit.json')['commit']
assert sha(LOCAL/'batch/freeze.json')==m['freezeSha256']
for name in ['PLAN.md','TASK.md','manifest.json','evaluate.py','run.mjs']:
 assert (HERE/name).read_bytes()==subprocess.check_output(['git','show',freeze+':'+str((HERE/name).relative_to(ROOT))],cwd=ROOT)
for name,digest in f['files'].items():assert sha(Path(name))==digest,name
assert sha(HERE/'calibration.json')==m['calibrationSha256']
assert sha(HERE/'preflight.json')==m['preflightSha256']
csv.field_size_limit(10000000)
with (ROOT/'local/polybench-pilot/sveltejs__svelte-1190.csv').open(newline='') as stream: task=next(csv.DictReader(stream))
f2p=set(ast.literal_eval(task['F2P']));p2p=set(ast.literal_eval(task['P2P']))
r=get(HERE/'results.json');assert [x['arm'] for x in r['rows']]==['OFF','ON']
for row in r['rows']:
 d=LOCAL/'batch/runs'/('sveltejs__svelte-1190-'+row['arm'])
 if row['status']=='not_started': assert not (d/'started.json').exists();assert row['T'] is None;continue
 records=get(d/'provider-metadata.json');forwarded=[x for x in records if x['forwarded']]
 assert row['provider']['requests']==len(forwarded)
 assert row['provider']['unknownUsageRequests']==sum(x.get('usage') is None for x in forwarded)
 for key,total in row['provider']['tokens'].items():assert total==sum((x.get('usage') or {}).get(key,0) for x in forwarded)
 for x in forwarded:
  u=x.get('usage') or {};assert u.get('cached_tokens',0)<=u.get('input_tokens',float('inf'));assert u.get('reasoning_tokens',0)<=u.get('output_tokens',float('inf'))
 if 'patch' in row:assert sha(HERE/'patches'/(row['arm']+'.patch'))==sha(d/'model.patch')==row['patch']['sha256']
 if row['arm']=='OFF':assert row.get('advisory') is None and not row['advisoryRequests']
 assert all('webfetch' not in x['tools'] for x in row.get('inventories',[]))
 if row.get('D_pair') is True:assert row['A'] is True and row['Q_pair'] is True and row['T'] is True
 for world in ['F','E']:
  raw=get(LOCAL/'evaluation'/(row['arm']+'-'+world)/'result.json');assert raw==row[world]
  parsed=get(LOCAL/'evaluation'/(row['arm']+'-'+world)/'parsed.json')
  passed=set(parsed['passed_tests']);failed=set(parsed['failed_tests']);assert not passed & failed
  assert raw['passed']==len(parsed['passed_tests'])==raw['runner_stats']['passes']
  assert raw['failed']==len(parsed['failed_tests'])==raw['runner_stats']['failures']
  assert raw['runner_stats']['pending']==53 and raw['expectations_unchanged']
  assert raw['integrity']['outside_surface_equal'] and raw['resolved_modules']
  if world=='E':
   assert (f2p|p2p)<=passed|failed
   assert raw['acceptance_diag']['all_f2p_passed']==(f2p<=passed)
   assert raw['acceptance_diag']['no_p2p_failed']==(not p2p & failed)
   assert row['A']==(f2p<=passed and not p2p & failed)
 if row.get('A') is True:assert row['E']['assessment_integrity']=='verified' and row['E']['acceptance_diag']['resolved'] is True
 if row.get('T') is True:assert row['result']['nativeCompleted'] and row['stop']['terminationVerified'] and row['stop']['captureSaved'] and row['stop']['relayRemoved'] and row['delivery_apply']
print('New pair accounting, frozen inputs, immutable patches and verdict prerequisites verified')
