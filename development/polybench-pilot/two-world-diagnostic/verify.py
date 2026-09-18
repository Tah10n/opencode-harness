"""Bounded published evidence, input immutability and arithmetic checks."""
import json
from pathlib import Path
from driver import ARMS, DEV, HERE, IDS, ROOT, guard, inputs, packed, sha
from controls import boundary_controls


def main():
    inputs()
    evidence = HERE / 'evidence'
    c = json.loads((evidence / 'calibration.json').read_bytes())
    e = json.loads((evidence / 'evaluation.json').read_bytes())
    assert c['calibration_passed']
    assert len(c['cases']) == 8
    assert {(x['instance_id'], x['arm']) for x in e['cases']} == {(i, a) for i in IDS for a in ARMS}
    assert len(e['cases']) == 6
    assert c['manifest_hashes'] == e['manifest_hashes'] == {i: sha((HERE / (i + '.json')).read_bytes()) for i in IDS}
    assert c['driver_sha256'] == e['driver_sha256'] == sha((HERE / 'driver.py').read_bytes())
    assert c['controls_sha256'] == e['controls_sha256'] == sha((HERE / 'controls.py').read_bytes())
    assert c['input_hashes'] == e['input_hashes'] == guard()
    for summary in [c, e]:
        assert summary['provider_calls'] == 0 and summary['not_started'] == 12
        assert set(summary['created_containers']) == set(summary['removed_containers'])
        assert len(summary['created_containers']) == len(summary['removed_containers'])
        assert summary['historical_inputs_unchanged']
        for case in summary['cases']:
            assert case['delivery_apply']
            for world in ['F', 'E']:
                if world not in case:
                    continue
                r = case[world]
                assert r['assessment_integrity'] == 'verified', r.get('error')
                assert r['integrity']['outside_surface_equal'] and r['expectations_unchanged']
                assert not r['timeout']
                test_path = evidence / r['test_set']
                tests = json.loads(test_path.read_bytes())
                assert test_path.stem == sha(packed(tests))
                assert len(tests['passed_tests']) == r['passed']
                assert len(tests['failed_tests']) == r['failed']
                assert sum(r['failure_kinds'].values()) == r['failed']
                assert r['runner_stats']['passes'] == r['passed'] and r['runner_stats']['failures'] == r['failed']
                if world == 'E':
                    assert not r['missing_required_tests']
                    task = inputs()[case['instance_id']]
                    import ast
                    f2p, p2p = set(ast.literal_eval(task['row']['F2P'])), set(ast.literal_eval(task['row']['P2P']))
                    expected = f2p <= set(tests['passed_tests']) and not p2p & set(tests['failed_tests'])
                    assert r['acceptance_diag']['resolved'] == expected
            if summary is c:
                assert case['E']['acceptance_diag']['resolved'] == case['arm'].startswith('gold')
            else:
                patch = DEV / 'results/patches' / case['arm'] / (case['instance_id'] + '.patch')
                assert sha(patch.read_bytes()) == case['model_sha256']
                assert case['F']['full_inventory_sha256'] == case['E']['full_inventory_sha256']
    for i in IDS:
        variants = {x['arm']: x for x in c['cases'] if x['instance_id'] == i}
        for seed in ['baseline', 'gold']:
            assert variants[seed]['E']['source_inventory_sha256'] == variants[seed + '-overlap']['E']['source_inventory_sha256']
    historical = {(r['instance_id'], r['arm']): r for r in json.loads((DEV / 'results/accounting.json').read_bytes())['slots']}
    for row in e['cases']:
        expected = historical[(row['instance_id'], row['arm'])]
        assert row['historical'] == {k: expected[k] for k in ['R', 'T', 'D_bench', 'status']}
    assert boundary_controls() == c['boundary_controls']
    print('PASS: 8 calibration cases, 6 deliveries x F/E, hashes, history, parser counts, original acceptance arithmetic and boundary controls')


if __name__ == '__main__':
    main()
