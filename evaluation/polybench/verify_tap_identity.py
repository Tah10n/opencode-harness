"""Small model-free identity controls; optional actual pinned QUnit producer."""
import argparse
import json
import os
import subprocess
import unittest
from pathlib import Path

from tap_identity import diagnose_tap, normalize_required, parse_qunit_tap


def log(points):
    totals = {'pass': 0, 'skip': 0, 'todo': 0, 'fail': 0}
    lines = ['TAP version 13']
    for number, (status, description) in enumerate(points, 1):
        lines.append(f'{status} {number} {description}')
        kind = ('skip' if description.startswith('# SKIP ') else
                'todo' if description.startswith('# TODO ') else
                'pass' if status == 'ok' else 'fail')
        totals[kind] += 1
    lines.append(f'1..{len(points)}')
    lines.extend(f'# {k} {v}' for k, v in totals.items())
    return '\n'.join(lines) + '\n'


class IdentityControls(unittest.TestCase):
    f2p = ['1 Maths > Color > decimal 50.0%']
    p2p = ['2 Maths > Color > preserved 360']
    points = [('ok', 'Maths > Color > decimal 50.0%'), ('ok', 'Maths > Color > preserved 360')]

    def score(self, points):
        return diagnose_tap(parse_qunit_tap(log(points)), self.f2p, self.p2p)

    def test_reorder_and_insert_preserve_obligations(self):
        for points in [self.points, self.points[::-1], [('ok', 'Other > harmless')] + self.points]:
            report = self.score(points)
            self.assertEqual(report['result'], 'pass')
            self.assertEqual(report['coverage']['pass'], 2)

    def test_real_failure_survives_many_passes(self):
        points = [('not ok', self.points[0][1]), self.points[1]]
        points += [('ok', f'Other > added {i}') for i in range(20)]
        self.assertEqual(self.score(points)['result'], 'fail')
        self.assertEqual(self.score(points)['coverage']['fail'], 1)

    def test_missing_or_different_scope_is_not_a_pass(self):
        for description in ['Other > Color > decimal 50.0%', 'Maths > Color > decimal 50.1%']:
            report = self.score([('ok', description), self.points[1]])
            self.assertEqual(report['result'], 'unproven')
            self.assertEqual(report['coverage']['missing'], 1)

    def test_only_structural_digits_are_removed(self):
        self.assertEqual(normalize_required(self.f2p[0]), 'Maths > Color > decimal 50.0%')
        self.assertNotEqual(normalize_required('99 Maths > Color > decimal 50.1%'),
                            normalize_required(self.f2p[0]))
        self.assertEqual(normalize_required('12 Maths > Interpolant > evaluate -> intervalChanged_'),
                         'Maths > Interpolant > evaluate -> intervalChanged_')

    def test_collisions_are_retained_and_ambiguous(self):
        report = self.score(self.points + [self.points[0]])
        self.assertEqual(report['result'], 'ambiguous')
        self.assertEqual(len(report['mapping'][0]['candidates']), 2)
        # Requirement-side duplicates also must not disappear into a set.
        report = diagnose_tap(parse_qunit_tap(log(self.points)),
                              self.f2p + ['9 Maths > Color > decimal 50.0%'], self.p2p)
        self.assertEqual(report['result'], 'ambiguous')
        self.assertEqual(len(report['mapping']), 3)

    def test_skip_todo_cannot_prove_an_assertion(self):
        for status, directive in [('ok', 'SKIP'), ('ok', 'TODO'), ('not ok', 'TODO')]:
            report = self.score([(status, '# ' + directive + ' ' + self.points[0][1]), self.points[1]])
            self.assertEqual(report['result'], 'unproven')
            self.assertEqual(report['coverage']['excluded'], 1)
        self.assertEqual(self.score(self.points + [('not ok', '# TODO ' + self.points[0][1])])['result'], 'ambiguous')

    def test_observed_qunit_object_diagnostic(self):
        content = log([('not ok', self.points[0][1]), self.points[1]])
        content = content.replace('ok 2 ', '  ---\n  actual: {\n  "a": 0\n}\n  ...\nok 2 ')
        self.assertEqual(diagnose_tap(parse_qunit_tap(content), self.f2p, self.p2p)['result'], 'fail')

    def test_incomplete_empty_and_unsupported_streams(self):
        complete = log(self.points)
        examples = [complete.rsplit('1..', 1)[0], complete.replace('1..2', '1..3'),
                    complete.replace('ok 2 ', 'ok 3 '), complete.replace('# pass 2', '# pass 1'),
                    complete + '# pass 2\n', complete + 'TAP version 13\n',
                    complete + 'ok 3 Other > late\n', complete.replace('ok 1 ', '    ok 1 '),
                    complete.replace('ok 2 ', '  ---\n  severity: fail\n  ...\nok 2 '),
                    complete + 'Container exited with status code: 1\n',
                    complete + 'Container exited with status code: 0\nContainer exited with status code: 1\n',
                    complete.replace('ok 1 ', 'Bail out! '), log([]),
                    'TAP version 13\nnot ok 1 Maths > Color > decimal 50.0%\n  ---\n  message: failure\n',
                    complete.replace('Maths > Color > decimal 50.0%', 'unscoped')]
        for content in examples:
            with self.subTest(content=content):
                self.assertNotEqual(diagnose_tap(parse_qunit_tap(content), self.f2p, self.p2p)['result'], 'pass')
        self.assertEqual(diagnose_tap(parse_qunit_tap(complete), [], [])['result'], 'unproven')


def producer_control(qunit):
    fixture = Path(__file__).parent / 'fixtures/qunit-tap/fixture.cjs'
    if json.loads((qunit.resolve().parents[1] / 'package.json').read_text())['version'] != '2.19.1':
        raise RuntimeError('Producer control requires pinned QUnit 2.19.1')
    outputs = {}
    for mode in ['original', 'inserted', 'defective']:
        process = subprocess.run(['node', str(qunit), '--reporter', 'tap', str(fixture)],
                                 env={**os.environ, 'TAP_FIXTURE_MODE': mode},
                                 capture_output=True, text=True, timeout=30)
        expected_exit = 1 if mode == 'defective' else 0
        if process.returncode != expected_exit:
            raise RuntimeError('Unexpected producer exit: ' + process.stderr + process.stdout)
        result = parse_qunit_tap(process.stdout)
        report = diagnose_tap(result, IdentityControls.f2p, IdentityControls.p2p)
        expected = 'fail' if mode == 'defective' else 'pass'
        if report['result'] != expected:
            raise RuntimeError('Unexpected producer diagnosis: ' + json.dumps(report))
        outputs[mode] = {'exit_code': process.returncode, 'result': report['result'],
                         'required_lines': [t['tap_line'] for t in result['tests']
                                            if t['identity'] in [p[1] for p in IdentityControls.points]],
                         'plan': result['plan'], 'totals': result['totals']}
    if outputs['original']['required_lines'] == outputs['inserted']['required_lines']:
        raise RuntimeError('Actual QUnit producer did not change structural numbers')
    print(json.dumps({'producer': 'qunit@2.19.1', 'controls': outputs}, indent=2))
    return outputs


if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--qunit', type=Path)
    parsed = args.parse_args()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(IdentityControls)
    run = unittest.TextTestRunner(verbosity=2).run(suite)
    if not run.wasSuccessful():
        raise SystemExit(1)
    patch = Path(__file__).with_name('tap-identity-upstream.patch').read_text()
    section = patch.split('diff --git a/src/poly_bench_evaluation/tap_identity.py ')[1].split('diff --git ')[0]
    added = ''.join(line[1:] for line in section.splitlines(keepends=True)
                    if line.startswith('+') and not line.startswith('+++'))
    if added != Path(__file__).with_name('tap_identity.py').read_text():
        raise RuntimeError('Upstream patch contains a stale diagnostic helper')
    if parsed.qunit:
        producer_control(parsed.qunit)
