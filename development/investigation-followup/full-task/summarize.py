"""Post-stop evidence accounting only; never sends a request or edits M."""
import hashlib,json
from collections import Counter,defaultdict
from pathlib import Path
ROOT=Path.cwd();DEV=ROOT/'development/investigation-followup/full-task';LOCAL=ROOT/'local/investigation-followup-full-task';OUT=LOCAL/'batch/runs/account-switch-ledger-I1'
def get(p):return json.loads(p.read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
def save(n,o):(DEV/n).write_text(json.dumps(o,indent=2,ensure_ascii=False)+'\n')
records=get(OUT/'provider-metadata.json');native=get(OUT/'native-evidence.json');run=get(OUT/'result.json') if (OUT/'result.json').exists() else get(OUT/'error.json');stop=get(OUT/'stop-verification.json')
roles={};rows=[];totals=defaultdict(lambda:{'requests':0,'unknownUsage':0,'input_tokens':0,'output_tokens':0,'cached_tokens':0,'reasoning_tokens':0,'clientBytes':0,'upstreamBytes':0,'responseBytes':0})
task=(ROOT/'development/plain-ledger-native-high/original-task.txt').read_text();env=(ROOT/'development/plain-ledger-native-high/environment.txt').read_text();bodies=[]
for rec in records:
 i=rec['requestIndex'];p=OUT/f'request-{i}.json';b=get(p) if p.exists() else {};text=json.dumps(b,ensure_ascii=False);names=[t.get('name') for t in b.get('tools',[])]
 role='title' if not names else 'parent' if 'harness_task' in names else 'child' if 'Investigate this concrete behavior question and deliver only relevant' in text else 'author' if 'harness_investigate' in names or 'Implement the complete original task' in text else 'parent' if 'harness_task' in names else 'unknown'
 roles[i]=role;bodies.append((i,role,b));
 if (OUT/f'upstream-request-{i}.json').exists():assert get(OUT/f'upstream-request-{i}.json')=={**b,'store':False}
 r=rec.get('recording',{});item={'request':i,'role':role,'forwarded':rec['forwarded'],'usage':rec.get('usage'),'serverCompletion':rec.get('serverCompletion'),'evidenceComplete':r.get('evidenceComplete',False),'files':{}}
 for field,label in [('clientRequest','clientBytes'),('upstreamRequest','upstreamBytes'),('response','responseBytes')]:
  d=r.get(field)
  if d and (OUT/d['file']).exists():
   data=(OUT/d['file']).read_bytes();assert len(data)==d['size'] and sha(data)==d['sha256'],(i,field)
   item['files'][field]={'bytes':len(data),'sha256':sha(data)};totals[role][label]+=len(data)
 if rec['forwarded']:
  totals[role]['requests']+=1;totals[role]['unknownUsage']+=not bool(rec.get('usage'))
  for k in ['input_tokens','output_tokens','cached_tokens','reasoning_tokens']:totals[role][k]+=rec.get('usage',{}).get(k,0) if rec.get('usage') else 0
 # JSON dumps uses the same escaping, independent of provider transport whitespace.
 item['fullOriginalTask']=json.dumps(task,ensure_ascii=False)[1:-1] in text;item['fullEnvironment']=json.dumps(env,ensure_ascii=False)[1:-1] in text
 rows.append(item)
for t in totals.values():assert t['cached_tokens']<=t['input_tokens'] and t['reasoning_tokens']<=t['output_tokens']
chain=[]
for tool in native['tools']:
 d=tool['data']
 if d.get('tool')!='harness_investigate':continue
 state=d.get('state',{});args=state.get('input',{});output=state.get('output','');call=d.get('callID');matches=[]
 for i,role,b in bodies:
  if role!='author':continue
  for part in b.get('input',[]):
   if part.get('type')=='function_call_output' and part.get('call_id')==call:
    seen=part.get('output','');seen=seen if isinstance(seen,str) else json.dumps(seen)
    matches.append({'request':i,'bytes':len(seen.encode()),'sha256':sha(seen.encode()),'exactNativeOutput':seen==output,'containsNativeOutput':output in seen,'truncationNotice':'bytes truncated' in seen})
 try:parsed=json.loads(output)
 except (ValueError,TypeError):parsed=None
 if isinstance(parsed,dict) and 'content' in parsed:
  content=parsed.pop('content');parsed['pageContentBytes']=len(content.encode());parsed['pageContentSha256']=sha(content.encode())
 chain.append({'callID':call,'action':args.get('action'),'input':args,'nativeStatus':state.get('status'),'time':state.get('time'),'nativeOutputBytes':len(output.encode()),'nativeOutputSha256':sha(output.encode()),'receipt':parsed,'firstVisibleAuthorReply':matches[0] if matches else None,'visibleInAuthorRequestNumbers':[m['request'] for m in matches],'allVisibleRepliesExact':all(m['exactNativeOutput'] for m in matches),'anyTruncationNotice':any(m['truncationNotice'] for m in matches)})
checks=Counter(t['data']['tool'] for t in native['tools']);forwarded=sum(r['forwarded'] for r in records);aggregate={k:sum(x[k] for x in totals.values()) for k in next(iter(totals.values()),{})}
assert aggregate['requests']==forwarded
save('recording-receipts.json',{'profile':get(OUT/'recording-config.json'),'requests':rows,'verifiedArchiveFiles':sum(len(r['files']) for r in rows)})
save('costs.json',{'requests':forwarded,'roles':dict(totals),'total':aggregate,'toolCalls':dict(checks),'runElapsedMs':run.get('elapsedMs'),'cumulativeStorageMs':max((get(p).get('storageMs',0) for p in OUT.glob('recording-[0-9]*.json')),default=0),'childIncludedInRun':True,'cachedAndReasoningAreSubsets':True,'money':'not available; no bill','preparation':{'scriptedInstalledRequests':0,'syntheticRecorderUpstreamRequests':0,'realProviderRequests':0},'developingAgent':'separate; not included in native model usage'})
save('integration.json',{'actions':chain,'investigatorNativeSessions':[s['id'] for s in native['sessions'] if '/investigation/' in s.get('directory','')],'nativeToolCounts':dict(checks)})
patch=(OUT/'model.patch').read_bytes();(DEV/'M.patch').write_bytes(patch)
T=bool(run.get('nativeCompleted') and all(stop.get(k) for k in ['terminationVerified','captureSaved','forwardingClosed','relayRemoved']) and stop.get('activeProviderHandlers')==0 and get(LOCAL/'batch/outcome.json')['status']=='finished')
save('delivery.json',{'run':run,'stop':stop,'nativeTerminalAndStop':T,'T':False if not T else 'pending independent artifact binding','patch':{'sha256':sha(patch),'bytes':len(patch)},'resolution':get(OUT/'native-result-resolution.json') if (OUT/'native-result-resolution.json').exists() else {'error':get(OUT/'native-result-resolution-error.json') if (OUT/'native-result-resolution-error.json').exists() else 'unavailable'}})
print(json.dumps({'requests':forwarded,'roles':dict(totals),'actions':[c['action'] for c in chain],'nativeTerminalAndStop':T,'patchBytes':len(patch)}))
