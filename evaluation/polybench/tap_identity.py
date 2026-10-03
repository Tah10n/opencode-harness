"""Explicit diagnostic for one flat QUnit 2.19 TAP 13 stream, not a scorer replacement.

Keep every occurrence. A rendered QUnit suite path is the available scope;
the transcript cannot recover a file or disambiguate equal rendered paths.
"""
import re
from collections import defaultdict

VERSION = 'tap_identity_diagnostic_v1'
POINT = re.compile(r'(ok|not ok) ([1-9][0-9]*) (.+)')
LABEL = re.compile(r'([1-9][0-9]*) (.+)')


def identity(description):
    """Preserve meaningful digits, whitespace and the complete rendered scope."""
    parts = description.split(' > ')
    if (len(parts) < 2 or any(not p or p != p.strip() for p in parts)
            or '#' in description or '\t' in description):
        raise ValueError('unsupported QUnit scope: ' + description)
    return description


def normalize_required(label):
    match = LABEL.fullmatch(label)
    if not match:
        raise ValueError('unsupported numbered requirement: ' + label)
    return identity(match[2])


def parse_qunit_tap(content):
    """Require the observed header, sequential points, trailing plan and totals.

    SKIP/TODO are exclusions, never assertion passes. Nested/multiple streams,
    bailouts, incomplete YAML and unrecognized syntax are explicitly unsupported.
    Preamble is allowed for the saved shell/npm log; trailer is limited to the
    observed container exit messages. Completeness does not establish identity.
    """
    result = {'tap_identity': VERSION, 'status': 'complete', 'issues': [],
              'tests': [], 'passed_tests': [], 'failed_tests': [],
              'excluded_tests': [], 'collisions': [], 'plan': None, 'totals': {}, 'exit_codes': []}

    def stop(status, reason):
        result['status'] = status
        result['issues'].append(reason)
        return result

    lines = content.splitlines()
    headers = [i for i, line in enumerate(lines) if line == 'TAP version 13']
    if len(headers) != 1:
        return stop('unsupported', 'expected one TAP version 13 stream')
    start = headers[0]
    if any(re.match(r'(?:ok |not ok |TAP version |\d+\.\.|Bail out!)', line)
           for line in lines[:start]):
        return stop('unsupported', 'test stream before TAP header')
    yaml = False
    for line_number, line in enumerate(lines[start + 1:], start + 2):
        if yaml:
            if line == '  ...':
                yaml = False
            # QUnit 2.19 emits JSON object closing delimiters without YAML indent.
            elif not line.startswith('  ') and line not in ('}', ']'):
                return stop('incomplete', 'unterminated QUnit YAML diagnostic')
            continue
        if line == '  ---':
            if result['plan'] is not None or not result['tests']:
                return stop('unsupported', 'unexpected YAML diagnostic')
            if result['tests'][-1]['outcome'] == 'pass':
                return stop('unsupported', 'QUnit diagnostic after a successful test point')
            yaml = True
            continue
        point = POINT.fullmatch(line)
        if point:
            if result['plan'] is not None:
                return stop('unsupported', 'test point after trailing plan')
            number, body = int(point[2]), point[3]
            if number != len(result['tests']) + 1:
                return stop('incomplete', 'nonsequential or duplicate structural number')
            directive = None
            # QUnit emits directives BEFORE the description, unlike other TAP dialects.
            for token in ('TODO', 'SKIP'):
                if body.startswith('# ' + token + ' '):
                    directive, body = token, body[len(token) + 3:]
                    break
            try:
                name = identity(body)
            except ValueError as error:
                return stop('unsupported', str(error))
            outcome = 'excluded' if directive else ('pass' if point[1] == 'ok' else 'fail')
            result['tests'].append({'number': number, 'identity': name, 'outcome': outcome,
                                    'directive': directive, 'line_number': line_number,
                                    'tap_line': line})
            key = {'pass': 'passed_tests', 'fail': 'failed_tests', 'excluded': 'excluded_tests'}[outcome]
            result[key].append(name)
            continue
        plan = re.fullmatch(r'1\.\.([0-9]+)', line)
        if plan:
            if result['plan'] is not None:
                return stop('unsupported', 'multiple trailing plans')
            result['plan'] = int(plan[1])
            continue
        total = re.fullmatch(r'# (pass|skip|todo|fail) ([0-9]+)', line)
        if total and result['plan'] is not None:
            if total[1] in result['totals']:
                return stop('unsupported', 'duplicate summary total')
            result['totals'][total[1]] = int(total[2])
            continue
        if not line:
            continue
        exited = re.fullmatch(r'Container exited with status code: ([0-9]+)', line)
        if exited:
            if len(result['totals']) != 4:
                return stop('incomplete', 'container exited before QUnit footer')
            result['exit_codes'].append(int(exited[1]))
            continue
        return stop('unsupported', 'unrecognized QUnit TAP line: ' + line)
    if yaml or result['plan'] is None or len(result['totals']) != 4:
        return stop('incomplete', 'missing complete QUnit footer or YAML end')
    if result['plan'] == 0 or result['plan'] != len(result['tests']):
        return stop('incomplete', 'empty or truncated test plan')
    actual = {'pass': len(result['passed_tests']), 'fail': len(result['failed_tests']),
              'skip': sum(t['directive'] == 'SKIP' for t in result['tests']),
              'todo': sum(t['directive'] == 'TODO' for t in result['tests'])}
    if result['totals'] != actual:
        return stop('incomplete', 'summary disagrees with observed test outcomes')
    if result['exit_codes'] and any(code != result['exit_codes'][0] for code in result['exit_codes']):
        return stop('unsupported', 'contradictory container exit codes')
    if any(result['exit_codes']) and actual['fail'] == 0:
        return stop('incomplete', 'execution failed despite successful QUnit footer')
    groups = defaultdict(list)
    for test in result['tests']:
        groups[test['identity']].append(test)
    result['collisions'] = [name for name, tests in groups.items() if len(tests) > 1]
    return result


def diagnose_tap(result, f2p, p2p):
    """Map both sides without sets/overwrites; never infer a missing P2P pass."""
    report = {'version': VERSION, 'result': 'unproven', 'stream_status': result['status'],
              'issues': list(result['issues']), 'mapping': [], 'collisions': result['collisions'],
              'all_f2p_passed': False, 'all_p2p_passed': False}
    observed = defaultdict(list)
    for test in result['tests']:
        observed[test['identity']].append(test)
    required = defaultdict(list)
    try:
        for kind, labels in [('F2P', f2p), ('P2P', p2p)]:
            for label in labels:
                name = normalize_required(label)
                required[name].append(label)
                report['mapping'].append({'kind': kind, 'required': label, 'identity': name,
                                          'candidates': observed[name]})
    except ValueError as error:
        report['issues'].append(str(error))
        report['result'] = 'unsupported'
        return report
    for item in report['mapping']:
        matches = item['candidates']
        item['status'] = ('ambiguous' if len(required[item['identity']]) > 1 or len(matches) > 1
                          else 'missing' if not matches else matches[0]['outcome'])
    statuses = [item['status'] for item in report['mapping']]
    report['coverage'] = {'required': len(statuses), 'observed_points': len(result['tests']),
                          **{s: statuses.count(s) for s in ['pass', 'fail', 'excluded', 'missing', 'ambiguous']}}
    for kind, key in [('F2P', 'all_f2p_passed'), ('P2P', 'all_p2p_passed')]:
        subset = [item for item in report['mapping'] if item['kind'] == kind]
        report[key] = all(item['status'] == 'pass' for item in subset)
    if result['tap_identity'] != VERSION or not statuses:
        report['issues'].append('no supported nonempty obligations')
    elif result['status'] != 'complete':
        report['result'] = 'unsupported' if result['status'] == 'unsupported' else 'unproven'
    elif result['collisions'] or 'ambiguous' in statuses:
        report['result'] = 'ambiguous'
        report['issues'].append('rendered scope collisions require stable producer identities')
    elif 'missing' in statuses or 'excluded' in statuses:
        report['issues'].append('required assertion missing or excluded')
    else:
        report['result'] = 'fail' if 'fail' in statuses else 'pass'
    return report
