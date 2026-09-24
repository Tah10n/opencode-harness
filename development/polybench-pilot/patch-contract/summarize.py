"""Compact evidence from an application run; no patch rewriting or scoring."""
import argparse
import json
from pathlib import Path
import re
import subprocess
from diagnose import sha, write


def summarize(run, destination):
    summary = json.loads((run / 'summary.json').read_bytes())
    assert len(summary['cases']) == 9 and summary['inputs_unchanged']
    destination.mkdir(parents=True, exist_ok=False)
    table = []
    for case in summary.pop('cases'):
        ident = case['instance_id'] + '-' + case['arm']
        trees = run / ident / 'trees'
        comparison = []
        for b in sorted((trees / 'B').rglob('*')):
            if not b.is_file(): continue
            name = str(b.relative_to(trees / 'B'))
            paths = {k: trees / k / name for k in ['B', 'T', 'M']}
            data = {k: p.read_bytes() for k, p in paths.items()}
            ranges = {}
            for k in ['T', 'M']:
                proc = subprocess.run(['git', 'diff', '--no-index', '--no-ext-diff', '--unified=0',
                                       str(paths['B']), str(paths[k])], capture_output=True)
                assert proc.returncode in [0, 1]
                ranges[k] = re.findall(r'^@@.*?@@', proc.stdout.decode(), re.M)
            comparison.append({'path': name, 'sha256': {k: sha(v) for k, v in data.items()},
                               'T_equals_M': data['T'] == data['M'],
                               'only_terminal_LF_differs': data['T'] != data['M'] and (data['T'] + b'\n' == data['M'] or data['M'] + b'\n' == data['T']),
                               'base_relative_changed_ranges': ranges})
        case['common_baseline_comparison'] = comparison
        e = case['scenarios']['official-B+T+M']
        rejected = []
        for command in e['commands']:
            if isinstance(command['cmd'], str) and command['cmd'].startswith('git apply') and 'patch_code' in command['cmd']:
                rejected = re.findall(r'^error: patch failed: (.*):(\d+)$', command['output'], re.M)
        case['first_git_rejected_hunks'] = [{'path': p, 'base_start': int(n)} for p, n in rejected]
        # Full text logs/trees remain local; published evidence references original patches,
        # exact failed hunk starts, command outcomes and snapshots without copying huge patches.
        for scenario in case['scenarios'].values():
            for command in scenario['commands']:
                raw = command.pop('output')
                command['output_sha256'] = sha(raw.encode())
                if isinstance(command['cmd'], str):
                    command['observations'] = [line for line in raw.splitlines() if re.match(
                        r'^(Checking patch |Applied patch |Applying patch |Hunk #|Rejected hunk |error: patch failed:|patching file |\d+ out of |Reversed |Ignoring |Skipping )', line)]
                elif command['cmd'][:2] in [['git', '--version'], ['patch', '--version'], ['git', 'rev-parse']]:
                    command['output'] = raw
            for snap in scenario['snapshots']:
                for artifact in snap['artifacts'].values():
                    if 'text' in artifact:
                        raw = artifact.pop('text')
                        artifact['hunk_headers'] = re.findall(r'^@@.*?@@', raw, re.M)
        for h in case['first_git_rejected_hunks']:
            path = h['path']
            cmp = next((c for c in comparison if c['path'] == path), None)
            instance = case['instance_id']
            if instance.endswith('-6534'):
                classes = ['structural-overlap', 'changed-context-after-test-split']
            elif instance.endswith('-6842'):
                classes = ['different-assertion-values']
            elif instance.startswith('mui'):
                classes = ['identical-change-repeated'] if h['base_start'] == 417 else ['different-text-for-same-assertion-intent', 'overlapping-comment-or-title-edit']
            elif path == 'test/css/index.js':
                classes = ['context-only']
            elif cmp['T_equals_M']:
                classes = ['identical-change-repeated']
            elif cmp['only_terminal_LF_differs']:
                classes = ['same-fixture-replacement-plus-terminal-LF']
            else:
                classes = ['different-fixture-or-generated-code-values']
            h['classification'] = classes
        case['classification'] = sorted({c for h in case['first_git_rejected_hunks'] for c in h['classification']})
        case['first_rejection_scope'] = 'tests/fixtures only; production hunks applied by git before fallback'
        case['fallback_scope'] = 'production and tests may be rejected or duplicated on the already modified tree; no reverse-switch or reset'
        case['semantic_limit'] = 'Application diagnosis only; implementation correctness and test strength unproven.'
        write(destination / (ident + '.json'), case)
        table.append({'instance_id': case['instance_id'], 'arm': case['arm'],
                      'B+M': case['scenarios']['B+M']['strict_M'],
                      'B+T': case['scenarios']['B+T+strict-M']['strict_T'],
                      'strict_M_after_T': case['scenarios']['B+T+strict-M']['strict_M_after_T'],
                      'official_M_after_T': e['official_M'],
                      'first_rejected_files': len(set(p for p, n in rejected)),
                      'first_rejected_hunks': len(rejected),
                      'same_T_M_overlap_files': sum(c['T_equals_M'] for c in comparison),
                      'different_T_M_overlap_files': sum(not c['T_equals_M'] for c in comparison)})
    write(destination / 'summary.json', {**summary, 'cases': table})
    write(destination / 'input-hashes.json', json.loads((run / 'input-hashes.json').read_bytes()))
    return table


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--run', type=Path, required=True); p.add_argument('--out', type=Path, required=True)
    args = p.parse_args(); print(json.dumps(summarize(args.run, args.out), indent=2))
