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
    for arm in dict.fromkeys(s['arm'] for s in slots):
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


def paired_statistics(rows, first, second, field, formal=False):
    """Prespecified task-level paired bootstrap and primary-only exact McNemar."""
    import math, random
    counts = paired(rows, first, second, field)
    by = {(r['instance_id'], r['arm']): r for r in rows}
    differences = []
    for instance in sorted({r['instance_id'] for r in rows}):
        a = by.get((instance, first), {}).get(field)
        b = by.get((instance, second), {}).get(field)
        if type(a) is bool and type(b) is bool:
            differences.append(int(a) - int(b))
    n = len(differences)
    result = {**counts, 'paired_tasks': n, 'delta_pp': None, 'ci95_pp': None,
              'interval_method': 'paired percentile bootstrap; 100000 resamples; seed 20260929',
              'exact_mcnemar_p': None}
    if not n:
        return result
    result['delta_pp'] = 100 * sum(differences) / n
    rng = random.Random(20260929)
    distribution = sorted(100 * sum(differences[rng.randrange(n)] for _ in range(n)) / n for _ in range(100000))
    def percentile(p):
        x = (len(distribution) - 1) * p; low = math.floor(x); high = math.ceil(x)
        return distribution[low] + (distribution[high] - distribution[low]) * (x - low)
    result['ci95_pp'] = [percentile(.025), percentile(.975)]
    result['interval_degenerate'] = len(set(differences)) == 1
    if formal:
        discordant = counts['wins'] + counts['losses']
        result['exact_mcnemar_p'] = min(1., 2 * sum(math.comb(discordant, k) for k in range(min(counts['wins'], counts['losses']) + 1)) / 2**discordant) if discordant else 1.
    return result


def quality_paired_statistics(rows, first, second, field, formal=False):
    """New quality protocol; historical bootstrap reports remain unchanged.

    Two 97.5% Clopper-Pearson intervals for wins/n and losses/n give a
    conservative 95% interval for their difference by the union bound.
    """
    import math
    counts = paired(rows, first, second, field)
    n = counts['wins'] + counts['losses'] + counts['ties']
    result = {**counts, 'paired_tasks': n, 'delta_pp': None, 'ci95_pp': None,
              'interval_method': 'Bonferroni difference of two 97.5% exact Clopper-Pearson binomial intervals',
              'exact_mcnemar_p': None, 'formal_primary': formal}
    if not n:
        return result
    tail = .0125
    def probability(p, start, end):
        return sum(math.comb(n, k) * p**k * (1-p)**(n-k) for k in range(start, end+1))
    def interval(k):
        lower = 0.
        if k:
            lo, hi = 0., 1.
            for _ in range(80):
                mid = (lo+hi)/2
                if probability(mid, k, n) < tail: lo = mid
                else: hi = mid
            lower = (lo+hi)/2
        upper = 1.
        if k < n:
            lo, hi = 0., 1.
            for _ in range(80):
                mid = (lo+hi)/2
                if probability(mid, 0, k) > tail: lo = mid
                else: hi = mid
            upper = (lo+hi)/2
        return lower, upper
    wins, losses = counts['wins'], counts['losses']
    win_bounds, loss_bounds = interval(wins), interval(losses)
    result['delta_pp'] = 100*(wins-losses)/n
    result['ci95_pp'] = [100*(win_bounds[0]-loss_bounds[1]), 100*(win_bounds[1]-loss_bounds[0])]
    if formal:
        discordant = wins+losses
        result['exact_mcnemar_p'] = min(1., 2*sum(math.comb(discordant, k) for k in range(min(wins, losses)+1))/2**discordant) if discordant else 1.
    return result
