"""Extract observed tool/receipt timing; never run an OFF shadow classifier."""
import hashlib
import json
import re
from pathlib import Path
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[2]; LOCAL=ROOT/'local/preservation-nudge-model-pair'
def get(p):return json.loads(p.read_bytes())
def digest(data):return hashlib.sha256(data).hexdigest()
all_arms=[]
for arm in ['OFF','ON']:
 d=LOCAL/'batch/runs'/('sveltejs__svelte-1190-'+arm)
 if not (d/'session/finished.json').exists():continue
 finished=get(d/'session/finished.json');start=finished['completedAt']-finished['executionElapsedMs'];deadline=start+1800000
 arts=list((d/'task-artifacts').glob('*/tool-events.json'))
 if len(arts)!=1:continue
 events=get(arts[0]);records=get(d/'provider-metadata.json');first_receipt={};advisory=[]
 for p in sorted(d.glob('request-*.json'),key=lambda p:int(p.stem.split('-')[1])):
  n=int(p.stem.split('-')[1]);b=get(p)
  for item in b.get('input',[]):
   if item.get('type')!='function_call_output':continue
   text=str(item.get('output',''));cid=item.get('call_id')
   first_receipt.setdefault(cid,{'request':n,'requestSha256':digest(p.read_bytes()),'at':records[n-1]['at'],'forwarded':records[n-1]['forwarded'],'receiptSha256':digest(text.encode()),'receiptBytes':len(text.encode()),'reportTotals':re.findall(r'\d+ (?:passing|failing|pending)[^\n]*',text),'runtimeCssPass':'css (shared helpers)' in text,'eventHandlerDOMPass':'event-handler-event-methods (shared helpers)' in text})
   if 'Preservation advisory:' in text:advisory.append({'callID':cid,'request':n,'at':records[n-1]['at'],'requestSha256':digest(p.read_bytes()),'forwarded':records[n-1]['forwarded']})
 commands=[];edits=[]
 for index,e in enumerate(events,1):
  args=e.get('args',{})
  if e['tool']=='bash':
   commands.append({'event':index,'callID':e['callID'],'command':args.get('command'),'cwd':args.get('workdir','.'),'exit':e.get('exit'),'state':e.get('state'),'startSeconds':round((e['startedAt']-start)/1000,3),'durationSeconds':round((e['completedAt']-e['startedAt'])/1000,3),'remainingSecondsAfter':round((deadline-e['completedAt'])/1000,3),'outputSha256':digest(str(e.get('output','')).encode()),'reportTotals':re.findall(r'\d+ (?:passing|failing|pending)[^\n]*',str(e.get('output',''))),'firstModelReceipt':first_receipt.get(e['callID'])})
  if e['tool'] in ['apply_patch','edit','write']:
   patch=args.get('patchText','');paths=re.findall(r'^\*\*\* (?:Update|Add|Delete) File: (.+)$',patch,re.M) or [args.get('filePath')]
   edits.append({'event':index,'tool':e['tool'],'paths':paths,'atSeconds':round((e['completedAt']-start)/1000,3)})
 all_arms.append({'arm':arm,'taskStartEpochMs':start,'commands':commands,'edits':edits,'advisoryInRequests':advisory,'rawToolEventsSha256':digest(arts[0].read_bytes()),'limits':'Receipt hashes refer to actual outgoing request context. No hidden reasoning reconstructed. Build freshness requires source/import analysis; ignored author build outputs are not cryptographically retained.'})
(HERE/'trajectory.json').write_text(json.dumps({'arms':all_arms},indent=2)+'\n')
print('Observed native commands, edits and first model receipts extracted')
