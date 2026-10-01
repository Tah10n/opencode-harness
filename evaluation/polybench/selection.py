"""Metadata-only deterministic selection. Full original rows stay local."""
import argparse, collections, csv, functools, hashlib, json
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

def select_campaign(rows, config):
    """Select only metadata; never inspect a solution, task text or test list."""
    excluded = set(config['excluded_instance_ids'])
    seed = config['seed']
    order = lambda r: (hashlib.sha256((seed + r['instance_id']).encode()).hexdigest(), r['instance_id'])
    pool = sorted((r for r in rows if r['language'] in config['languages'] and r['instance_id'] not in excluded), key=order)
    quotas = {}
    counts_by_language = {}
    for lang in config['languages']:
        counts = collections.Counter(r['task_category'] for r in pool if r['language'] == lang)
        total = sum(counts.values())
        if total < config['per_language']:
            raise ValueError('Insufficient eligible tasks: ' + lang)
        counts_by_language[lang] = dict(sorted(counts.items()))
        allocated = {cat: config['per_language'] * n // total for cat, n in counts.items()}
        remainder = config['per_language'] - sum(allocated.values())
        for cat in sorted(counts, key=lambda c: (-(config['per_language'] * counts[c] % total), c))[:remainder]:
            allocated[cat] += 1
        quotas.update({(lang, cat): n for cat, n in allocated.items()})
    groups = sorted(quotas)
    repos = sorted({r['repo'] for r in pool})
    indices = [(groups.index((r['language'], r['task_category'])), repos.index(r['repo'])) for r in pool]
    @functools.lru_cache(None)
    def search(start, remaining, usage):
        if not any(remaining):
            return ()
        for g, needed in enumerate(remaining):
            available = collections.Counter(repo for group, repo in indices[start:] if group == g)
            if sum(min(n, config['max_per_repository'] - usage[repo]) for repo, n in available.items()) < needed:
                return None
        for i in range(start, len(pool)):
            g, repo = indices[i]
            if not remaining[g] or usage[repo] >= config['max_per_repository']:
                continue
            next_remaining, next_usage = list(remaining), list(usage)
            next_remaining[g] -= 1
            next_usage[repo] += 1
            result = search(i + 1, tuple(next_remaining), tuple(next_usage))
            if result is not None:
                return (i,) + result
        return None
    selected = search(0, tuple(quotas[g] for g in groups), (0,) * len(repos))
    if selected is None:
        raise ValueError('Campaign quotas and repository cap are infeasible; no replacement')
    return pool, [pool[i] for i in selected], {lang: {cat: quotas[lang, cat] for l, cat in groups if l == lang} for lang in config['languages']}, counts_by_language


def remaining_assignment(config):
    """Project the exact unrequested historical slots; never select replacements."""
    if config['arms'] != ['P', 'C', 'T'] or config['task_count'] != 8 or config['slot_count'] != 24:
        raise ValueError('Invalid remaining campaign composition')
    origin = config['origin']
    if origin['original_slots'] != list(range(31, 52)) + list(range(58, 61)):
        raise ValueError('Invalid original slots')
    sources = {}
    for kind in ['selection', 'results']:
        path = Path(origin[kind + '_path'])
        if hashlib.sha256(path.read_bytes()).hexdigest() != origin[kind + '_sha256']:
            raise ValueError('Historical source changed: ' + kind)
        sources[kind] = json.loads(path.read_text())
    slots = []
    for number in origin['original_slots']:
        assigned = next(x for x in sources['selection']['slots'] if x['slot'] == number)
        outcome = next(x for x in sources['results']['slots'] if x['slot'] == number)
        if any(assigned[k] != outcome[k] for k in ['instance_id', 'arm']):
            raise ValueError('Historical assignment mismatch')
        if outcome['status'] != 'not_started' or outcome['usage']['requests'] != 0 or outcome['provider_outcome'] != 'not_started' or outcome['prediction_exported']:
            raise ValueError('Historical attempt already executed')
        slots.append({**assigned, 'slot': len(slots) + 1, 'original_slot': number})
    ids = list(dict.fromkeys(s['instance_id'] for s in slots))
    selected = [next(x for x in sources['selection']['selected'] if x['instance_id'] == id) for id in ids]
    if len(selected) != 8 or len({(s['instance_id'], s['arm']) for s in slots}) != 24:
        raise ValueError('Invalid remaining assignment uniqueness')
    return selected, slots


def campaign_main(config_path):
    config_path = Path(config_path)
    config = json.loads(config_path.read_text())
    source = Path(config['local_directory']) / 'verified.csv'
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != config['dataset_sha256']:
        raise ValueError('Pinned dataset hash mismatch')
    with source.open(newline='') as f:
        reader = csv.DictReader(f); rows = list(reader); fields = reader.fieldnames
    if len({r['instance_id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate dataset IDs')
    if config['name'] == 'consolidated-remaining-v1':
        selected, slots = remaining_assignment(config)
        by_id = {r['instance_id']: r for r in rows}
        chosen = [by_id[r['instance_id']] for r in selected]
        if any(any(r[k] != saved[k] for k in saved) for r, saved in zip(chosen, selected)):
            raise ValueError('Pinned dataset differs from original task metadata')
        result = {'stage': 'selected_before_technical_controls', 'campaign': config['name'],
                  'configuration_sha256': hashlib.sha256(config_path.read_bytes()).hexdigest(),
                  'dataset_revision': config['dataset_revision'], 'dataset_sha256': digest,
                  'origin': config['origin'], 'selected': selected, 'slots': slots}
    else:
        pool, chosen, quotas, counts = select_campaign(rows, config)
        safe = lambda r: {k: r[k] for k in ('instance_id', 'repo', 'language', 'task_category', 'base_commit')}
        result = {'stage': 'selected_before_technical_controls', 'campaign': config['name'],
              'configuration_sha256': hashlib.sha256(config_path.read_bytes()).hexdigest(),
              'dataset_revision': config['dataset_revision'], 'dataset_sha256': digest,
              'row_count': len(rows), 'eligible_count': len(pool), 'pool_categories': counts, 'quotas': quotas,
              'selected': [safe(r) for r in chosen], 'exclusions': config['excluded_instance_ids'],
              'slots': [dict(slot=i*3+j+1, instance_id=r['instance_id'], arm=arm, status='not_started', R=None, T=None, D=None)
                        for i, r in enumerate(chosen) for j, arm in enumerate(config['arms'][i%3:] + config['arms'][:i%3])]}
    target = config_path.parent / 'selection.json'
    # Never overwrite the pilot, an existing selection, or a partial preparation.
    with target.open('x') as f:
        f.write(json.dumps(result, indent=2) + '\n')
    with (source.parent / 'selected.csv').open('x', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields); writer.writeheader(); writer.writerows(chosen)
    print(json.dumps({'selected': result['selected'], 'slots': len(result['slots'])}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--campaign', type=Path)
    args = parser.parse_args()
    csv.field_size_limit(10000000)
    if args.campaign:
        campaign_main(args.campaign)
        raise SystemExit(0)
    source = Path('local/polybench/verified.csv')
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
    Path('evaluation/polybench/selection.json').write_text(json.dumps(result,indent=2)+'\n')
    with Path('local/polybench/selected.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields); writer.writeheader(); writer.writerows(chosen)
    print(json.dumps(result['selected'],indent=2))
