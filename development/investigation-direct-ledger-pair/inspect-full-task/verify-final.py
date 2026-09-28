"""Verify final evidence bindings/arithmetic, with raw evidence retained privately."""
import ast,hashlib,json,subprocess,tarfile
from pathlib import Path
ROOT=Path.cwd();DEV=ROOT/'development/investigation-direct-ledger-pair/inspect-full-task'
def get(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
cleanup=get(DEV/'cleanup.json');archive=ROOT/cleanup['archive']['path'];index=get(ROOT/cleanup['index']['path'])
assert sha(archive)==cleanup['archive']['sha256'];assert sha(ROOT/cleanup['index']['path'])==cleanup['index']['sha256']
assert all(not (ROOT/p).exists() for p in cleanup['removed'])
with tarfile.open(archive,'r:gz') as tar:freeze_bytes=tar.extractfile('batch/freeze.json').read();freeze=json.loads(freeze_bytes)
assert hashlib.sha256(freeze_bytes).hexdigest()==get(DEV/'manifest.json')['freezeSha256']
for name,digest in {**freeze['files'],**freeze['historical']}.items():assert sha(Path(name))==digest,name
assert not subprocess.check_output(['git','diff','f7ab1f8b','--','lib','prompts'])
run='batch/runs/account-switch-ledger-I1/'
assert sha(DEV/'M.patch')==index[run+'model.patch']['sha256']==get(DEV/'assessment.json')['patchSha256']==get(DEV/'delivery-tree.json')['patchSha256']
assert sha(DEV/'child-test.patch')==get(DEV/'child-result.json')['patchSha256']
records=get(DEV/'recording-receipts.json')['requests'];cost=get(DEV/'costs.json');assert len(records)==cost['requests']==130
for field in ['requests','unknownUsage','input_tokens','output_tokens','cached_tokens','reasoning_tokens','clientBytes','upstreamBytes','responseBytes']:assert cost['total'][field]==sum(r[field] for r in cost['roles'].values()),field
assert cost['total']['unknownUsage']==1
for role,totals in cost['roles'].items():
 rows=[r for r in records if r['role']==role and r['forwarded']];assert len(rows)==totals['requests']
 for key in ['input_tokens','output_tokens','cached_tokens','reasoning_tokens']:assert sum((r['usage'] or {}).get(key,0) for r in rows)==totals[key]
 for field,key in [('clientRequest','clientBytes'),('upstreamRequest','upstreamBytes'),('response','responseBytes')]:assert sum(r['files'].get(field,{}).get('bytes',0) for r in rows)==totals[key]
 for row in rows:
  for field,prefix,suffix in [('clientRequest','request','json'),('upstreamRequest','upstream-request','json'),('response','response','sse')]:
   i=index[run+f'{prefix}-{row["request"]}.{suffix}'];assert i['bytes']==row['files'][field]['bytes'] and i['sha256']==row['files'][field]['sha256']
assert all(r['evidenceComplete'] for r in records[:129]) and records[129]['evidenceComplete'] is False
assert cost['total']['clientBytes']+cost['total']['upstreamBytes']+cost['total']['responseBytes']==193854623<1073741824
assert cost['cumulativeStorageMs']<30000
chain=get(DEV/'integration.json');assert [x['action'] for x in chain['actions']]==['investigate','inspect','decline']
assert len(chain['investigatorNativeSessions'])==1
assert all(x['allVisibleRepliesExact'] and not x['anyTruncationNotice'] for x in chain['actions'])
assert chain['actions'][1]['receipt']=={'status':'invalid-cursor'} and chain['actions'][1]['nativeOutputBytes']==27
assessment=get(DEV/'assessment.json');assert assessment['Q'] is False and assessment['T'] is False and assessment['D'] is False
assert assessment['delivery_apply'] and assessment['behavioralCounts']=={'tests':23,'pass':19,'fail':4,'skipped':0}
assert sum(v['counts']['pass'] for v in assessment['F_checks'].values())==208
assert assessment['privacy']['counts']=={'tests':3,'pass':3,'fail':0,'skipped':0}
original=(DEV.parent/'assess.py').read_text().replace('"""Offline, after-run assessment of the two unchanged captured Git patches."""','"""Same I0/I1 assessment, routed to the single new slot; no scoring changes."""').replace('parents[2]','parents[3]').replace("DEV = ROOT / 'development/investigation-direct-ledger-pair'", "DEV = ROOT / 'development/investigation-direct-ledger-pair/inspect-full-task'").replace("LOCAL = ROOT / 'local/investigation-direct-ledger-pair'", "LOCAL = ROOT / 'local/investigation-inspect-full-task'").replace("for arm in ('I0', 'I1'):", "for arm in ('I1',):")
assert original==(DEV/'assess.py').read_text()
for p in DEV.glob('*.py'):ast.parse(p.read_text())
for p in [*DEV.glob('*.mjs'),ROOT/'development/native-task-ab/provider-recording.mjs',ROOT/'development/native-task-ab/run-comparison.mjs']:subprocess.run(['node','--check',str(p)],check=True)
for name in ['M.patch','child-test.patch']:
 for line in (DEV/name).read_text().splitlines():
  if line.startswith('+') and not line.startswith('+++'):assert line.rstrip(' \t')==line,(name,'added-source whitespace')
# Required patch context whitespace stays byte-identical; check other files directly.
for p in DEV.iterdir():
 if p.suffix in ['.md','.json','.mjs','.py']:
  assert p.read_bytes().endswith(b'\n'),p.name
  assert all(s.rstrip(' \t')==s for s in p.read_text().splitlines()),p.name
subprocess.run(['git','diff','--check','f7ab1f8b','--','development/native-task-ab','development/provider-recording/README.md'],check=True)
receipt={'passed':True,'frozenFiles':len(freeze['files']),'historicalFiles':len(freeze['historical']),'productRuntimeUnchanged':True,'evaluatorProcedureUnchangedExceptRouting':True,'archiveAnd390RecordingFileBindings':True,'fullPartialMTreeBound':True,'allRoleArithmetic':True,'oneInvalidInspectNoPages':True,'partialNativeOutcomePreserved':True,'syntax':True,'scopedWhitespace':True,'patchesByteIdentical':True,'cleanupVerified':True,'fullControllerInstalledRetentionMatrix':'not repeated','remoteCI':'separate; not claimed'}
(DEV/'final-verification.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
