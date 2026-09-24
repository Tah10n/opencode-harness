"""Export immutable evaluator receipts and exact paired arithmetic, without rescoring."""
import datetime
import hashlib
import json
from pathlib import Path
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[2]; LOCAL=ROOT/'local/preservation-nudge-model-pair'
def get(p):return json.loads(p.read_bytes())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,x):p.write_text(json.dumps(x,indent=2)+'\n')
def failure_map(r):return {x['fullTitle']:x['err'].get('message') for x in r['failure_details']}
s=get(LOCAL/'evaluation/summary.json');assert set(s['created_containers'])==set(s['removed_containers']);assert len(s['cases'])==2
r=get(HERE/'results.json');base=get(LOCAL/'calibration/baseline-F/result.json');gold=get(LOCAL/'calibration/gold-E/result.json')
for row in r['rows']:
 c=next(x for x in s['cases'] if x['arm']==row['arm']);assert c['model_sha256']==row['patch']['sha256'];row['delivery_apply']=c['delivery_apply'];row['F']=c['F'];row['E']=c['E'];
 row['F_failure_names_and_messages_equal_baseline']=failure_map(c['F'])==failure_map(base)
 row['E_additional_failures']=[x for x in c['E'].get('failure_details',[]) if x['fullTitle'] not in failure_map(gold)]
 row['A']=(c['E']['acceptance_diag']['resolved'] if c['E']['assessment_integrity']=='verified' and c['E']['acceptance_diag'] is not None else None)
 row['result'].pop('source',None)
 stop=row['stop']; ordinary=get(LOCAL/('ordinary-'+row['arm']+'.json'))
 row['ordinary_apply']=ordinary
 row['T']=bool(row['result']['nativeCompleted'] and stop['terminationVerified'] and stop['captureSaved'] and stop['relayRemoved'] and not stop['activeProviderHandlers'] and ordinary['applies'] and ordinary['terminalEqualsFullCollector'])
 # Frozen Q requires A; do not invent a softer snapshot acceptance here.
 row['Q_pair']=False if row['A'] is False else (True if row['A'] is True and c['delivery_apply'] and c['F']['assessment_integrity']=='verified' and row['F_failure_names_and_messages_equal_baseline'] else None)
 row['D_pair']=False if row['Q_pair'] is False or row['T'] is False else (True if row['Q_pair'] is True and row['T'] is True else None)
 done=get(LOCAL/'batch/runs'/('sveltejs__svelte-1190-'+row['arm'])/'completed.json');end=datetime.datetime.fromisoformat(done['at'].replace('Z','+00:00')).timestamp()*1000
 row['post_native_capture_cleanup_seconds']=round((end-row['result']['completedAt'])/1000,3)
 row['build_and_test_commands']=[x for x in row['authorChecks'] if any(k in x['command'] for k in ['npm run build','npm test','mocha','npm run lint'])]
rowkeys=['requests','knownUsageRequests','unknownUsageRequests']
r['totals']={'provider':{k:sum(x['provider'][k] for x in r['rows']) for k in rowkeys},'tokens':{k:sum(x['provider']['tokens'][k] for x in r['rows']) for k in r['rows'][0]['provider']['tokens']},'nativeTools':sum(x['nativeToolCalls'] for x in r['rows'])}
safe=dict(s);safe['containersCreated']=len(safe.pop('created_containers'));safe['containersRemoved']=len(safe.pop('removed_containers'));save(HERE/'evaluation.json',safe)
save(HERE/'results.json',r)
print(json.dumps([{k:x[k] for k in ['arm','A','Q_pair','T','D_pair']} for x in r['rows']]))
