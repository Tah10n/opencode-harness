"""Export safe diagnostic evidence only; never changes official pilot outputs."""
import argparse
import copy
import json
from pathlib import Path
from driver import ARMS, DEV, HERE, HIST, IDS, ROOT, packed, save, sha


def failure_kind(f):
    err = f.get('err', {})
    if err.get('name') == 'AssertionError' or err.get('stack', '').lstrip().startswith('AssertionError'):
        return 'assertion'
    if 'Timeout of ' in err.get('message', ''):
        return 'test_timeout'
    return 'other'


def compact(run, dest, local):
    result = copy.deepcopy(run)
    directory = local / run['label']
    if (directory / 'parsed.json').exists():
        parsed = json.loads((directory / 'parsed.json').read_bytes())
        key = sha(packed(parsed))
        save(dest / 'test-sets' / (key + '.json'), parsed)
        result['test_set'] = 'test-sets/' + key + '.json'
    if result.get('acceptance_diag'):
        result['acceptance_diag'] = {k: v for k, v in result['acceptance_diag'].items() if k not in ['passed_tests', 'failed_tests']}
    result.pop('failed_tests', None)
    details = result.pop('failure_details', [])
    result['failures'] = [{'test': f['fullTitle'], 'name': f.get('err', {}).get('name'), 'kind': failure_kind(f),
                           'message': f.get('err', {}).get('message', '')[:500],
                           'detail_sha256': sha(packed(f))} for f in details]
    result['failure_kinds'] = {kind: sum(failure_kind(f) == kind for f in details) for kind in ['assertion', 'test_timeout', 'other']}
    if result.get('failed'):
        result['delivered_checks'] = 'failed'
    # No complete source inventories or raw logs are published.
    return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--calibration', type=Path, required=True)
    p.add_argument('--evaluation', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    args = p.parse_args(); args.out.mkdir(parents=True, exist_ok=False)
    accounting = json.loads((DEV / 'results/accounting.json').read_bytes())
    historical = {(r['instance_id'], r['arm']): {k: r[k] for k in ['R', 'T', 'D_bench', 'status']} for r in accounting['slots']}
    for label, local in [('calibration', args.calibration), ('evaluation', args.evaluation)]:
        summary = json.loads((local / 'summary.json').read_bytes())
        summary['local_summary_sha256'] = sha((local / 'summary.json').read_bytes())
        for case in summary['cases']:
            if label == 'calibration' and case['arm'].endswith('-overlap'):
                case['seed_git_tree'] = case.pop('full_git_tree')
                case['control'] = {'change': 'replace control_test with comment removing author assertions', 'content_sha256': sha(b'// local boundary control: author removed assertions\n'), 'full_snapshot_binding': case['E']['full_inventory_sha256']}
            for world in ['E', 'F']:
                if world in case:
                    case[world] = compact(case[world], args.out, local)
            if label == 'evaluation':
                case['historical'] = historical[(case['instance_id'], case['arm'])]
        summary['historical_commit'] = HIST
        summary['not_started'] = sum(r['status'] == 'not_started' for r in accounting['slots'])
        save(args.out / (label + '.json'), summary)


if __name__ == '__main__':
    main()
