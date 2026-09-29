"""Accounting/export only. R is copied from official per-instance output."""
import csv, json
from pathlib import Path

def validate_predictions(rows, expected):
    if len(expected)!=len(set(expected)):
        raise ValueError('Duplicate expected IDs')
    if len(rows)!=len(expected) or {r.get('instance_id') for r in rows}!=set(expected):
        raise ValueError('Predictions must exactly match evaluated subset')
    if not all(isinstance(r.get('model_patch'),str) for r in rows):
        raise ValueError('model_patch must be a string')

def export_started(slots, records, original_rows, out):
    """Never convert a not_started slot to an empty prediction."""
    out=Path(out);out.mkdir(parents=True,exist_ok=False)
    by_id={r['instance_id']:r for r in original_rows}
    exported={}
    for arm in ['P','H0','H1']:
        assigned=[s for s in slots if s['arm']==arm]
        started=[s for s in assigned if records.get(s['slot'],{}).get('started') is True]
        # Missing capture is an infrastructure error, not a manufactured empty patch.
        available=[s for s in started if isinstance(records[s['slot']].get('patch'),str)]
        predictions=[{'instance_id':s['instance_id'],'model_patch':records[s['slot']]['patch']} for s in available]
        ids=[s['instance_id'] for s in available];validate_predictions(predictions,ids)
        folder=out/arm;folder.mkdir()
        (folder/'predictions.jsonl').write_text(''.join(json.dumps(p)+'\n' for p in predictions))
        if ids:
            with (folder/'subset.csv').open('w',newline='') as f:
                writer=csv.DictWriter(f,fieldnames=list(original_rows[0]));writer.writeheader();writer.writerows(by_id[id] for id in ids)
        exported[arm]={'assigned':len(assigned),'started':len(started),'evaluable':len(ids),'not_started':[s['slot'] for s in assigned if s not in started], 'missing_capture':[s['slot'] for s in started if s not in available]}
    (out/'export-status.json').write_text(json.dumps(exported,indent=2))
    return exported

def usage(requests):
    forwarded=[r for r in requests if r.get('forwarded')]
    result={'requests':len(forwarded),'requests_without_usage':sum(r.get('usage') is None for r in forwarded)}
    for key in ['input_tokens','output_tokens','cached_tokens','reasoning_tokens']:
        known=[r['usage'][key] for r in forwarded if r.get('usage') and key in r['usage']]
        result[key]={'observed':sum(known) if known else None,'unknown_requests':len(forwarded)-len(known)}
    # Cached input and reasoning are subsets, never added to totals again.
    result['money']=None
    return result

def paired(rows, first, second, field):
    by={(r['instance_id'],r['arm']):r for r in rows}
    result={'wins':0,'losses':0,'ties':0,'unknown':0}
    for id in sorted({r['instance_id'] for r in rows}):
        a=by.get((id,first),{}).get(field);b=by.get((id,second),{}).get(field)
        if type(a) is not bool or type(b) is not bool: result['unknown']+=1
        else: result['ties' if a==b else 'wins' if a else 'losses']+=1
    return result
