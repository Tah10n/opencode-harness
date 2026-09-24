"""Bounded post-run arithmetic, provenance, receipt and immutable patch audit."""
import hashlib
import ast
import csv
import json
from pathlib import Path
import subprocess
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[3]; LOCAL=ROOT/'local/preservation-nudge-revision-2-model-pair'
def get(p):return json.loads(p.read_bytes())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
m=get(HERE/'manifest.json');f=get(LOCAL/'batch/freeze.json');freeze=get(LOCAL/'batch/freeze-commit.json')['commit']
assert sha(LOCAL/'batch/freeze.json')==m['freezeSha256']
for name in ['PLAN.md','TASK.md','manifest.json']:
 assert (HERE/name).read_bytes()==subprocess.check_output(['git','show',freeze+':'+str((HERE/name).relative_to(ROOT))],cwd=ROOT)
for name,digest in f['files'].items():assert sha(Path(name))==digest,name
assert sha(HERE/'calibration.json')==m['calibrationSha256']
assert sha(HERE/'preflight.json')==m['preflightSha256']
csv.field_size_limit(10000000)
with (ROOT/'local/polybench-pilot/sveltejs__svelte-1190.csv').open(newline='') as stream: task=next(csv.DictReader(stream))
f2p=set(ast.literal_eval(task['F2P']));p2p=set(ast.literal_eval(task['P2P']))
r=get(HERE/'results.json');assert [x['arm'] for x in r['rows']]==['ON','OFF']
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
# Native spill retention and outgoing-body receipts are independent evidence.
receipts=get(HERE/'provider-receipts.json');cost=get(HERE/'costs.json')
assert r['outcome']['pause']['kind']=='unknown_submission' and r['outcome']['pause']['slot']==1
assert receipts['OFF']==[] and not (LOCAL/'batch/runs/sveltejs__svelte-1190-OFF').exists()
row=r['rows'][0];d=LOCAL/'batch/runs/sveltejs__svelte-1190-ON'
assert row['T'] is False and row['result']['timedOut'] and row['result']['stopReason']['kind']=='hard_deadline'
assert not list((d/'task-artifacts').glob('*/terminal.patch'))
records=get(d/'provider-metadata.json');assert records[-1]['serverCompletion']=='unknown' and records[-1]['usage'] is None
roles={}
for receipt in receipts['ON']:
 n=receipt['request'];p=d/f'request-{n}.json';q=d/f'response-{n}.sse'
 assert sha(p)==receipt['bodySha256'] and p.stat().st_size==receipt['bodyBytes']
 assert sha(q)==receipt['responseSha256'] and q.stat().st_size==receipt['responseBytes']
 assert receipt['usage']==records[n-1]['usage'];roles[receipt['kind']]=roles.get(receipt['kind'],0)+1
assert roles==cost['requestsByRole'] and sum(roles.values())==row['provider']['requests']
assert row['provider']['unknownUsageRequests']==1
retained=get(d/'native-output/manifest.json');assert retained['evidenceComplete'] and not retained['errors']
for file in retained['files']:
 target=d/file['destination'];assert sha(target)==file['sha256'] and target.stat().st_size==file['size']
 assert file['archiveComplete'] and file['linkStatus']=='linked' and file['links']
assert sum(x['size'] for x in retained['files'])==retained['bytes']==215684
assert get(d/'evidence-capture.json')['kind']=='evidence_complete'
assert row['stop']['forwardingClosed'] and row['stop']['relayRemoved'] and row['stop']['activeProviderHandlers']==0
assert row['ordinary_apply']['bytesAndModesVerified'] and row['ordinary_apply']['applies']
assert sha(HERE/'TASK.md')==m['task']['promptSha256'] and (HERE/'TASK.md').stat().st_size==1377
base=get(ROOT/'local/preservation-nudge-model-pair/calibration/baseline-F/result.json')
failures=lambda x:{v['fullTitle']:v['err'].get('message') for v in x['failure_details']}
assert failures(row['F'])==failures(base)
assert cost['taskExecutionSeconds']==row['result']['executionElapsedMs']/1000
assert cost['npmTestIncludingBuildSeconds']==sum(x['durationMs'] for x in row['authorChecks'] if 'npm test' in x['command'])/1000
print('Interrupted-pair stop, unknown usage, complete spill files and safe receipt hashes verified')
