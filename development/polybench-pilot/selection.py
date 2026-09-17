"""Metadata-only deterministic selection. Full original rows stay local."""
import collections, csv, hashlib, json
from pathlib import Path

SEED = 'opencode-harness-polybench-pilot-v1\n'
LANGUAGES = ('JavaScript', 'TypeScript')
QUOTAS = {(lang, cat): count for lang in LANGUAGES
          for cat, count in [('Bug Fix', 3), ('Feature', 1), ('Refactoring', 1)]}

def key(row):
    return (hashlib.sha256((SEED + row['instance_id']).encode()).hexdigest(), row['instance_id'])

def select(rows):
    pool = sorted((r for r in rows if r['language'] in LANGUAGES), key=key)
    def search(start, chosen, counts, repos):
        if len(chosen) == 10:
            return chosen if len(repos) >= 4 else None
        for group, quota in QUOTAS.items():
            available = sum((r['language'], r['task_category']) == group and repos[r['repo']] < 3 for r in pool[start:])
            if counts[group] + available < quota:
                return None
        for i in range(start, len(pool)):
            row = pool[i]; group = (row['language'], row['task_category'])
            if counts[group] >= QUOTAS[group] or repos[row['repo']] >= 3:
                continue
            result = search(i+1, chosen+[row], counts+collections.Counter({group:1}), repos+collections.Counter({row['repo']:1}))
            if result is not None:
                return result
        return None
    selected = search(0, [], collections.Counter(), collections.Counter())
    if selected is None:
        raise ValueError('Ten-instance stratification infeasible')
    return pool, selected

if __name__ == '__main__':
    csv.field_size_limit(10000000)
    source = Path('local/polybench-pilot/verified.csv')
    with source.open(newline='') as f:
        reader = csv.DictReader(f); rows = list(reader); fields = reader.fieldnames
    assert len({r['instance_id'] for r in rows}) == len(rows)
    pool, chosen = select(rows)
    safe = lambda r: {k:r[k] for k in ('instance_id','repo','language','task_category','base_commit')}
    result = {'stage':'selected_before_technical_controls', 'dataset_revision':'b3fca77b637379f0c01ad86d18753a7ac1998b53',
              'dataset_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
              'row_count':len(rows), 'languages':dict(collections.Counter(r['language'] for r in rows)),
              'categories':dict(collections.Counter(r['task_category'] for r in rows)),
              'pool_categories': {lang:dict(collections.Counter(r['task_category'] for r in pool if r['language']==lang)) for lang in LANGUAGES},
              'selected':[safe(r) for r in chosen], 'reserve_order':[safe(r) for r in pool], 'exclusions':[],
              'slots':[dict(slot=i*3+j+1,instance_id=r['instance_id'],arm=arm,status='not_started',R=None,T=None,D_bench=None)
                       for i,r in enumerate(chosen) for j,arm in enumerate((('P','H0','H1'),('H0','H1','P'),('H1','P','H0'))[i%3])]}
    Path('development/polybench-pilot/selection.json').write_text(json.dumps(result,indent=2)+'\n')
    with Path('local/polybench-pilot/selected.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields); writer.writeheader(); writer.writerows(chosen)
    print(json.dumps(result['selected'],indent=2))
