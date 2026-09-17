"""Package safe results; never copy credentials, provider streams or source trees."""
import collections,hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];DEV=ROOT/'development/polybench-pilot';LOCAL=ROOT/'local/polybench-pilot'
def read(p):return json.loads(p.read_text())
def main():
 batch=LOCAL/'batch';account=read(batch/'accounting.json');out=DEV/'results';out.mkdir(exist_ok=False)
 rows=account['slots'];safe=[]
 for r in rows:
  record={k:v for k,v in r.items() if k not in ['strict_application_diagnostic']}
  safe.append(record)
  run=batch/'runs'/(r['instance_id']+'-'+r['arm'])
  if (run/'model.patch').exists():
   folder=out/'patches'/r['arm'];folder.mkdir(parents=True,exist_ok=True)
   shutil.copyfile(run/'model.patch',folder/(r['instance_id']+'.patch'))
  official=LOCAL/'evaluations'/r['arm']/'results'/(r['instance_id']+'_result.json')
  if official.exists():
   folder=out/'official'/r['arm'];folder.mkdir(parents=True,exist_ok=True);shutil.copyfile(official,folder/official.name)
 for arm in ['P','H0','H1']:
  folder=out/'predictions';folder.mkdir(exist_ok=True)
  shutil.copyfile(batch/'export'/arm/'predictions.jsonl',folder/(arm+'.jsonl'))
 summary={**account,'slots':safe}
 (out/'accounting.json').write_text(json.dumps(summary,indent=2)+'\n')
 preparation={}
 for p in sorted(LOCAL.glob('*-accounting.json')):preparation[p.name]=read(p)
 for p in sorted(LOCAL.glob('*-evaluation-process.json')):preparation[p.name]=read(p)
 preparation['money']=None
 preparation['unrecorded_duration']='Unknown; absent preparation/scripted durations are not zero.'
 (out/'resource-accounting.json').write_text(json.dumps(preparation,indent=2)+'\n')
 controls=out/'controls';controls.mkdir()
 for task in read(DEV/'selection.json')['selected']:
  for mode in ['gold','baseline']:
   p=LOCAL/'controls'/(task['instance_id']+'-'+mode)/'results'/(task['instance_id']+'_result.json')
   shutil.copyfile(p,controls/(task['instance_id']+'-'+mode+'.json'))
 def value(v):return 'unknown' if v is None else str(v).lower()
 lines=['# SWE-PolyBench Verified pilot results','',f"Assigned: 30 slots on 10 paired tasks. Actually submitted: {account['started']}. One attempt per slot.",'','Official resolved R is primary. T requires autonomous applicable delivery and verified native/container stop. D_bench = R and T. Unknowns are not failures.','','| Arm | Started | R true | R false | R unknown | T true | D_bench true |','|---|---:|---:|---:|---:|---:|---:|']
 for arm in ['P','H0','H1']:
  rs=[r for r in rows if r['arm']==arm]
  lines.append('| '+' | '.join(map(str,[arm,sum(r['status']=='started' for r in rs),sum(r['R'] is True for r in rs),sum(r['R'] is False for r in rs),sum(r['R'] is None for r in rs),sum(r['T'] is True for r in rs),sum(r['D_bench'] is True for r in rs)]))+' |')
 lines+=['','| Comparison | Metric | Wins | Losses | Ties | Unknown pairs |','|---|---|---:|---:|---:|---:|']
 for pair,metrics in account['comparisons'].items():
  for field,c in metrics.items():lines.append(f"| {pair} | {field} | {c['wins']} | {c['losses']} | {c['ties']} | {c['unknown']} |")
 lines+=['','## All assigned slots','','| Slot | Instance / repository | Language / category | Arm | R | T | D_bench | Evaluation / stop | Input / output tokens |','|---:|---|---|---|---|---|---|---|---|']
 for r in rows:
  usage=r['usage'];tokens='/'.join(str(usage[k]['observed']) if usage[k]['observed'] is not None else 'unknown' for k in ['input_tokens','output_tokens'])
  if usage['requests_without_usage']:tokens+=' (partial)'
  lines.append(f"| {r['slot']} | {r['instance_id']} / {r['repo']} | {r['language']} / {r['task_category']} | {r['arm']} | {value(r['R'])} | {value(r['T'])} | {value(r['D_bench'])} | {r['evaluation_status']} / {r['stop_reason'] or r['status']} | {tokens} |")
 lines+=['','## Distribution','','| Group | Value | Tasks | P R/D | H0 R/D | H1 R/D |','|---|---|---:|---|---|---|']
 for group in ['repo','language','task_category']:
  for v in sorted({r[group] for r in rows}):
   rs=[r for r in rows if r[group]==v];cells=[]
   for arm in ['P','H0','H1']:
    a=[r for r in rs if r['arm']==arm];cells.append(str(sum(r['R'] is True for r in a))+'/'+str(sum(r['D_bench'] is True for r in a)))
   lines.append('| '+' | '.join([group,v,str(len({r['instance_id'] for r in rs})),*cells])+' |')
 lines+=['','## Repository sensitivity','','H1 versus P official resolved, leaving out each repository:','', '```json',json.dumps(account['leave_one_repository_out'],indent=2),'```','','## TYPE_COMPAT and costs','','Actual diagnostic records and compiler timings are retained per H1 slot in [accounting.json](results/accounting.json). Scripted fixture success is preparation evidence only. Receipt and subsequent repair require separate native trace inspection; diagnostic presence alone does not establish either.','','Input/output are disjoint totals; cached input and reasoning are subsets and are not added again. Missing usage stays unknown. Monetary charges are unknown. [Resource accounting](results/resource-accounting.json) separates recorded preparation, control and evaluator durations. Author elapsed time and compiler time appear per slot. Developing-agent usage is reported separately.','','## Interpretation and limits','','This is ten paired public tasks, not 30 independent tasks, not guaranteed unseen, and not a full Verified leaderboard score. Official resolved does not establish universal correctness. Historical PROCESS_CONTAINMENT_UNAVAILABLE of the general verifier remains unaddressed. Local container evidence is not a full CI pass. Defaults and measured runtime are unchanged; no next campaign is authorized.']
 (DEV/'REPORT.md').write_text('\n'.join(lines)+'\n')
 print('Safe artifacts packaged; complete trace-based interpretation before publication.')
if __name__=='__main__':main()
