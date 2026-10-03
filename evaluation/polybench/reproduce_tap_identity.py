"""Replay pinned pure parser/scoring definitions; no models, containers or providers.

Public minimal inputs are the default. --archive explicitly selects private
saved Three.js evidence. No historical output is modified or rescored in place.
"""
import argparse
import ast
import csv
import dataclasses
import hashlib
import importlib.util
import io
import json
import re
import subprocess
import tarfile
import typing
from pathlib import Path

from evaluator_integrity import SHA, verify
from tap_identity import VERSION, diagnose_tap
from verify_tap_identity import IdentityControls, log, producer_control

ROOT = Path(__file__).resolve().parents[2]
CAMPAIGN = ROOT / 'evaluation/polybench/campaigns/evidence-backed-core-development-v1'
INSTANCE = 'mrdoob__three.js-24461'
ARCHIVE_SHA = '86d7321ae9ba2e26fa02e603638d749c24944242fb9beacecfdbfeee7abab9d0'
BASE = 'local/polybench-evidence-backed-core-development/'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load_pure(evaluator, diagnostic=False):
    """Execute original AST bodies and dataclasses, omitting unrelated heavy imports.

    This is exact logic replay, not a claim to have run the entire evaluator.
    All selected definitions come from the supplied verified source bytes.
    """
    namespace = {k: getattr(typing, k) for k in ['Any', 'Dict', 'List', 'Optional', 'Tuple', 'Union']}
    namespace.update({'__name__': 'pure_evaluator_replay', 'json': json, 're': re,
                      'asdict': dataclasses.asdict, 'dataclass': dataclasses.dataclass,
                      'field': dataclasses.field})
    if diagnostic:
        module_path = evaluator / 'src/poly_bench_evaluation/tap_identity.py'
        if module_path.read_bytes() != Path(__file__).with_name('tap_identity.py').read_bytes():
            raise RuntimeError('Diagnostic copy differs from the reviewed helper')
        spec = importlib.util.spec_from_file_location('diagnostic_tap_identity', module_path)
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        namespace.update({'parse_qunit_tap': helper.parse_qunit_tap,
                          'diagnose_tap': helper.diagnose_tap, 'TAP_IDENTITY_VERSION': helper.VERSION})
    for filename, names in [
        ('parsers/parser_results.py', ['ParserResults']),
        ('parsers/javascript_parsers.py', ['JavascriptGenericParser']),
        ('polybench_data.py', ['PolyBenchOutput', 'PolyBenchRetrievalMetrics']),
        ('scoring.py', ['instance_level_scoring']),
    ]:
        source = evaluator / 'src/poly_bench_evaluation' / filename
        nodes = [n for n in ast.parse(source.read_text()).body
                 if isinstance(n, (ast.ClassDef, ast.FunctionDef)) and n.name in names]
        if len(nodes) != len(names):
            raise RuntimeError('Missing upstream definition: ' + filename)
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), 'exec'), namespace)
    return namespace


def replay(official, corrected, content, f2p, p2p, patch_applied):
    raw = official['JavascriptGenericParser'](content).parse()
    score = official['instance_level_scoring'](INSTANCE, raw, f2p, p2p, patch_applied, True)
    default_raw = corrected['JavascriptGenericParser'](content).parse()
    default_score = corrected['instance_level_scoring'](INSTANCE, default_raw, f2p, p2p, patch_applied, True)
    if default_raw != raw or dataclasses.asdict(default_score) != dataclasses.asdict(score):
        raise RuntimeError('Default evaluator behavior changed in diagnostic copy')
    parsed = corrected['JavascriptGenericParser'](content).parse(tap_identity=True)
    diagnostic = diagnose_tap(parsed, f2p, p2p)
    refusal = None
    try:
        outcome = corrected['instance_level_scoring'](INSTANCE, parsed, f2p, p2p,
                                                     patch_applied, True, tap_identity=True)
        if outcome.resolved != (patch_applied and diagnostic['result'] == 'pass'):
            raise RuntimeError('Corrected scoring differs from diagnostic')
    except ValueError as error:
        if diagnostic['result'] in ['pass', 'fail']:
            raise
        refusal = str(error)
    return raw, dataclasses.asdict(score), parsed, diagnostic, refusal


def minimal(official, corrected):
    outputs = {}
    cases = {'original': IdentityControls.points,
             'inserted': [('ok', 'Other > harmless')] + IdentityControls.points,
             'defective': [('not ok', IdentityControls.points[0][1]), IdentityControls.points[1]],
             'collision': IdentityControls.points + [IdentityControls.points[0]]}
    for name, points in cases.items():
        _, score, _, diagnostic, refusal = replay(official, corrected, log(points),
                                                  IdentityControls.f2p, IdentityControls.p2p, True)
        outputs[name] = {'official_resolved': score['resolved'],
                         'diagnostic_result': diagnostic['result'], 'refusal': refusal}
    expected = {'original': (True, 'pass'), 'inserted': (False, 'pass'),
                'defective': (False, 'fail'), 'collision': (True, 'ambiguous')}
    for name, pair in expected.items():
        if (outputs[name]['official_resolved'], outputs[name]['diagnostic_result']) != pair:
            raise RuntimeError('Minimal control did not reproduce: ' + name)
    return outputs


def threejs(archive_path, official, corrected):
    if digest(archive_path.read_bytes()) != ARCHIVE_SHA:
        raise RuntimeError('Private archive hash differs from published custody receipt')
    csv.field_size_limit(10000000)
    with tarfile.open(archive_path) as archive:
        manifest_bytes = archive.extractfile('local/evidence-backed-core/checks/raw-evidence-archive-manifest.json').read()
        cleanup = json.loads((CAMPAIGN / 'cleanup.json').read_text())
        if digest(manifest_bytes) != cleanup['private_evidence_archive']['manifest_sha256']:
            raise RuntimeError('Archive manifest hash mismatch')
        manifest = json.loads(manifest_bytes)['files']

        def read(name):
            member = archive.getmember(name)
            if not member.isfile():
                raise RuntimeError('Non-regular evidence member: ' + name)
            raw = archive.extractfile(member).read()
            if digest(raw) != manifest[name]['sha256'] or len(raw) != manifest[name]['bytes']:
                raise RuntimeError('Evidence member hash mismatch: ' + name)
            return raw

        metadata = read(BASE + INSTANCE + '.csv')
        task = next(csv.DictReader(io.StringIO(metadata.decode())))
        if task['instance_id'] != INSTANCE:
            raise RuntimeError('Wrong task metadata')
        f2p, p2p = ast.literal_eval(task['F2P']), ast.literal_eval(task['P2P'])
        saved = json.loads((CAMPAIGN / 'results.json').read_text())
        slots = {r['arm']: r for r in saved['slots'] if r['instance_id'] == INSTANCE}
        products, rows, ambiguous = [], [], {}
        for kind in ['baseline', 'gold', 'P', 'C0', 'H1']:
            folder = BASE + ('controls/' + INSTANCE + '-' + kind if kind in ['baseline', 'gold']
                             else 'evaluations/' + kind)
            log_path = folder + ('/' + INSTANCE + '.log' if kind == 'baseline'
                                 else '/run_logs_javascript/' + INSTANCE + '_run.log')
            content = read(log_path)
            provenance = json.loads(read(folder + '/provenance.json'))
            if provenance['evaluator'] != SHA or INSTANCE not in provenance['instances']:
                raise RuntimeError('Wrong official provenance')
            if kind in ['baseline', 'gold'] and digest(metadata) != provenance['subset_sha256']:
                raise RuntimeError('Control metadata not bound to receipt')
            applied = kind != 'baseline'
            raw, score, parsed, diagnostic, refusal = replay(official, corrected, content.decode(),
                                                            f2p, p2p, applied)
            if kind != 'baseline':
                output_bytes = read(folder + '/results/' + INSTANCE + '_result.json')
                output = json.loads(output_bytes)
                if output != score:
                    raise RuntimeError('Unchanged replay differs from saved official output')
                if kind in slots:
                    if digest(output_bytes) != slots[kind]['official_result_summary']['source_sha256']:
                        raise RuntimeError('Output differs from published official hash')
                    applied = output['patch_applied']
                    predictions = (CAMPAIGN / ('predictions-' + kind + '.jsonl')).read_bytes()
                    if digest(predictions) != provenance['predictions_sha256']:
                        raise RuntimeError('Full predictions differ from official input')
                    prediction = next(json.loads(line) for line in predictions.decode().splitlines()
                                      if json.loads(line)['instance_id'] == INSTANCE)
                    full = prediction['model_patch'].encode()
                    if digest(full) != slots[kind]['patch_sha256']:
                        raise RuntimeError('Full M changed')
                    sections = re.split(r'(?=^diff --git )', prediction['model_patch'], flags=re.MULTILINE)
                    production = [s for s in sections if s.startswith('diff --git a/src/')]
                    if len(production) != 1 or not production[0].startswith('diff --git a/src/math/Color.js b/src/math/Color.js\n'):
                        raise RuntimeError('Unexpected production patch surface')
                    products.append(production[0].encode())
            else:
                execution = json.loads(read(folder + '/' + INSTANCE + '-execution.json'))
                if execution['exit_code'] != 1 or execution['production_patch_applied']:
                    raise RuntimeError('Baseline is not the original defect control')
            mapping = diagnostic['mapping']
            for name in diagnostic['collisions']:
                group = ambiguous.setdefault(name, {'identity': name,
                    'required': [item['required'] for item in mapping if item['identity'] == name],
                    'observed': {}})
                group['observed'][kind] = [{k: t[k] for k in ['number', 'outcome', 'directive']}
                                           for t in parsed['tests'] if t['identity'] == name]
            f2p_mapping = [item for item in mapping if item['kind'] == 'F2P']
            rows.append({'case': kind, 'official_R': score['resolved'], 'full_M_applied': applied,
                         'log_sha256': digest(content), 'stream_status': parsed['status'],
                         'plan': parsed['plan'], 'totals': parsed['totals'],
                         'coverage': diagnostic['coverage'], 'matching_unique': diagnostic['result'] in ['pass', 'fail'],
                         'diagnostic_result': diagnostic['result'], 'corrected_scorer_refusal': refusal,
                         'official_F2P_not_passed': [label for label in f2p if label not in raw['passed_tests']],
                         'official_P2P_absent': sum(label not in raw['passed_tests'] + raw['failed_tests'] for label in p2p),
                         'mapping_sha256': digest(json.dumps(mapping, sort_keys=True).encode()),
                         'F2P': f2p_mapping})
        if len(products) != 3 or any(p != products[0] for p in products):
            raise RuntimeError('Production patch bytes differ across arms')
        protected = ['REPORT.md', 'results.json', 'predictions-P.jsonl', 'predictions-C0.jsonl',
                     'predictions-H1.jsonl', 'costs.json', 'screening.json', 'frozen-manifest.json']
        historical = {}
        for filename in protected:
            path = CAMPAIGN / filename
            original = subprocess.check_output(['git', 'show', 'fadecb1d6c6800f4a09c8efabc0d2e3c73e73f08:' + str(path.relative_to(ROOT))], cwd=ROOT)
            if original != path.read_bytes():
                raise RuntimeError('Historical campaign file changed: ' + filename)
            historical[filename] = digest(original)
        return {'instance_id': INSTANCE, 'base_commit': task['base_commit'],
                'archive_sha256': ARCHIVE_SHA, 'metadata_sha256': digest(metadata),
                'production_patch': {'bytes': len(products[0]), 'sha256': digest(products[0]),
                                     'equal_across': ['P', 'C0', 'H1']},
                'required': {'F2P': len(f2p), 'P2P': len(p2p)}, 'cases': rows,
                'rendered_scope_collisions': list(ambiguous.values()),
                'historical_files_unchanged': historical,
                'conclusion': 'Numeric discrepancy reproduced; complete obligation mapping is ambiguous. '
                              'No corrected resolved claim or H1 lift; this scoring path cannot select the next candidate.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evaluator', type=Path, required=True)
    parser.add_argument('--diagnostic-evaluator', type=Path, required=True)
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--qunit', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--check-result', type=Path)
    args = parser.parse_args()
    verify(args.evaluator)
    official, corrected = load_pure(args.evaluator), load_pure(args.diagnostic_evaluator, True)
    data = {'version': VERSION, 'official_evaluator': SHA,
            'upstream_patch_sha256': digest(Path(__file__).with_name('tap-identity-upstream.patch').read_bytes()),
            'execution': 'Unchanged pure AST parser/scoring replay and explicit patched-copy diagnostic',
            'new_model_provider_reviewer_benchmark_task_runs': 0,
            'minimal_controls': minimal(official, corrected)}
    if args.archive:
        data['threejs'] = threejs(args.archive, official, corrected)
    if args.qunit:
        data['producer_controls'] = producer_control(args.qunit)
    verify(args.evaluator)
    if args.check_result and json.loads(args.check_result.read_text()) != data:
        raise RuntimeError('Saved diagnostic result differs from reproduction')
    if args.out:
        with args.out.open('x') as output:
            output.write(json.dumps(data, indent=2) + '\n')
    else:
        print(json.dumps(data, indent=2))


if __name__ == '__main__':
    main()
