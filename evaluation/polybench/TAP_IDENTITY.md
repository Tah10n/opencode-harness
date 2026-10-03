# TAP identity diagnostic: ordinal discrepancy reproduced, full mapping ambiguous

The saved Three.js production patches are identical, but the pinned official
parser/scorer gives P `R=true` and C0/H1 `R=false` because an added QUnit test
changes numeric labels. Both mandatory F2P assertions pass in all three complete
logs. **Removing the ordinal alone does not establish resolved:** nine P2P
obligations collide with equal rendered names. `tap_identity_diagnostic_v1`
therefore refuses a positive whole-task conclusion for all three submissions,
and also for gold. No H1 lift, reinstatement or confirmation run follows.

The [separate diagnostic data](campaigns/evidence-backed-core-development-v1/tap_identity_diagnostic_v1.json)
records input hashes, exact F2P lines, every collision, coverage and scorer
refusals. Original [results](campaigns/evidence-backed-core-development-v1/results.json),
full patches, official outputs, costs, freezes, screening rejection and P 4/6,
C0 3/6, H1 3/6 remain unchanged. This diagnostic is neither a new official score
nor a percentage combined with other tasks. Product/runtime code is unchanged.

## Saved Three.js correspondence

Pinned evaluator: `amazon-science/SWE-PolyBench@9c836c5d7f3cb991934132b77d29e6941d912a07`.
The upstream main checked on 2026-10-03 was still that exact commit; the correction
has not been accepted. Dataset: Verified
`b3fca77b637379f0c01ad86d18753a7ac1998b53`; task base:
`9e5512f067e3a0de8d4069217d20903c1725edf7`.

Each full M applied officially, including the complete author test patch. The
common production patch is 848 bytes, SHA-256
`107efece16f581847ae1e5e1477d26dc0f8a63917eed1a8414d3612dca2e41cf`.
The unchanged pure parser/scoring definitions reproduce every field of the
saved gold/P/C0/H1 official output. This uses original AST bodies and dataclasses
without importing unrelated Docker/dataset dependencies; it is a byte-bound
logic replay, not a new full evaluator or project-test execution.

| Case | Official R | Full M applied | Required descriptions present | Unique obligations | Diagnostic | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| P | true | yes | 718/718 | 709/718 | ambiguous | F2P pass; nine P2P obligations lack unique identity |
| C0 | false | yes | 718/718 | 709/718 | ambiguous | Two F2P and 360 P2P numbered labels shift; same identity collisions |
| H1 | false | yes | 718/718 | 709/718 | ambiguous | Same ordinal shift and collisions as C0 |
| Baseline | false, replay | no production patch | 718/718 | 709/718 | ambiguous, two definite F2P failures | Original decimal defect is detected |
| Gold | true | gold applied | 718/718 | 709/718 | ambiguous | Existing rendered-name collisions also affect gold |

The required F2P IDs are `923 Maths > Color > setStyleHSLRedWithDecimals` and
`924 Maths > Color > setStyleHSLARedWithDecimals`. Actual TAP lines:

```text
baseline: not ok 923 Maths > Color > setStyleHSLRedWithDecimals
baseline: not ok 924 Maths > Color > setStyleHSLARedWithDecimals
gold/P:   ok 923 Maths > Color > setStyleHSLRedWithDecimals
gold/P:   ok 924 Maths > Color > setStyleHSLARedWithDecimals
C0/H1:    ok 924 Maths > Color > setStyleHSLRedWithDecimals
C0/H1:    ok 925 Maths > Color > setStyleHSLARedWithDecimals
```

The official parser removes only `ok `/`not ok `, leaving the ordinal inside
the identity. `scoring.py` requires exact F2P strings in passed tests; P2P checks
only intersection with failed labels. The latter does not detect the 360 absent
numbered P2P labels. The diagnostic separately checks actual coverage and never
infers a missing P2P pass. It does not globally rewrite upstream scoring rules.

All streams have the complete trailing plan and four matching outcome totals:
baseline/gold/P 1615 test points, C0/H1 1616. Baseline has 716 pass and two real
failures; gold/P 718 pass; C0/H1 719 pass. Each has 897 TODO and zero SKIP.
TODO is excluded from assertion evidence. The two F2P tests have the same
rendered scope and names, and the saved common test patch defines three color
assertions in each. No claim relies only on the zero-failure summary. No project
tests needed to be rerun; the original complete baseline is the real defect
control. Fixture executions below are evaluator controls, not benchmark runs.

Six rendered identities affect nine P2P obligations: two occurrences each of
`Maths > Quaternion > slerp`, `Maths > Vector2 > multiply/divide`, and
`Maths > Vector3 > multiply/divide`; plus `Maths > Triangle > getNormal`,
`getBarycoord`, and `containsPoint`, each shared by an executed test and a TODO.
Two additional `Materials > LineBasicMaterial` duplicate identities are TODO
only. All occurrences are retained. Equal outcomes or ordinal occurrence order
cannot supply the missing suite/file identity.

## Reproduce without models or private data

The [upstream patch](tap-identity-upstream.patch) adds a narrow pure helper,
explicit `tap_identity=True` parser/scoring arguments, and standard-library
regression tests. Default behavior stays byte-for-byte equivalent in replay.
The corrected copy returns `ValueError` with `ambiguous`, `unsupported`, or
`unproven` when correspondence cannot safely be scored. Official pinned source
integrity is checked before and after replay.

From the harness repository root:

```sh
tap_work=$(mktemp -d /tmp/polybench-tap.XXXXXX)
git clone https://github.com/amazon-science/SWE-PolyBench.git "$tap_work/evaluator"
git -C "$tap_work/evaluator" checkout --detach 9c836c5d7f3cb991934132b77d29e6941d912a07
cp -R "$tap_work/evaluator" "$tap_work/corrected"
git -C "$tap_work/corrected" apply "$PWD/evaluation/polybench/tap-identity-upstream.patch"
PYTHONDONTWRITEBYTECODE=1 python3 "$tap_work/corrected/test/test_tap_identity.py"
mkdir "$tap_work/producer"
cp evaluation/polybench/fixtures/qunit-tap/package*.json "$tap_work/producer/"
npm ci --ignore-scripts --prefix "$tap_work/producer" --cache "$tap_work/npm-cache"
PYTHONDONTWRITEBYTECODE=1 python3 evaluation/polybench/reproduce_tap_identity.py \
  --evaluator "$tap_work/evaluator" --diagnostic-evaluator "$tap_work/corrected" \
  --qunit "$tap_work/producer/node_modules/qunit/bin/qunit.js"
rm -rf -- "$tap_work"
```

Small synthetic controls cover reorder/renumber, inserted passing tests,
failure followed by many passes, missing/different scope, meaningful digits,
duplicate results and requirements, TODO/SKIP, zero obligations, truncated
plans/YAML, contradictory totals, nested streams and unsupported descriptions.
`npm run verify:evaluation` includes them and checks that the delivered patch's
helper matches the tested source. It does not download dependencies or evidence.

The actual pinned QUnit 2.19.1 fixture emits required numbers 1/2, then 2/3 after
one harmless insertion. Diagnoses are pass/pass. Returning the fixture defect
produces `not ok 2`, exit 1 and diagnostic fail. Its complete footer totals are
checked. This shows sensitivity to failure and invariance to ordinal insertion,
without claiming support for other TAP dialects or assertion-level coverage.

For the private saved case, add
`--archive local/polybench-evidence-backed-core-evidence-20261002T044558Z.tar.gz`.
The replay checks the published archive/manifest hashes and reads only this
task's logs, receipts and metadata. `--check-result` can compare with the saved
diagnostic JSON when the same producer control is included. `--out` creates a
new file exclusively; it never overwrites a historical output. Full raw model
streams and the private archive are not part of this PR.

## Upstream issue/PR draft

**Title:** QUnit TAP ordinals make unchanged required tests appear missing.

At `9c836c5d7f3cb991934132b77d29e6941d912a07`,
`JavascriptGenericParser._get_json_report_tap` retains the structural ordinal;
`instance_level_scoring` compares that string with F2P/P2P metadata. A minimal
original input is:

```text
TAP version 13
ok 1 Maths > Color > decimal 50.0%
ok 2 Maths > Color > preserved 360
1..2
# pass 2
# skip 0
# todo 0
# fail 0
```

Use F2P `['1 Maths > Color > decimal 50.0%']` and P2P
`['2 Maths > Color > preserved 360']`. Inserting
`ok 1 Other > harmless` before these tests, numbering the original tests 2/3,
and updating the plan/pass total to 3 changes official resolved from true to
false, although both original assertions still execute and pass. The supplied
minimal replay and real producer fixture demonstrate this without an archive.

Expected property: structural ordinals are not persistent scenario identities.
Preserve the description, meaningful digits and rendered QUnit suite path;
normalize both required labels and observations. Match every obligation to one
executed, nonexcluded test. Keep duplicates as occurrences and refuse ambiguous
scope, unsupported input or incomplete logs rather than collapsing into a set.

The proposed patch provides that explicitly selected, limited diagnostic and
regressions while retaining the default scorer. Its strict coverage/plan checks
are bounded to this path, reported separately from historical official R.
It supports the observed flat QUnit 2.19 TAP 13 format only, including prefix
TODO/SKIP and observed diagnostic blocks; it does not recover missing file IDs
or distinguish equal rendered module/test paths.

Before adopting this as **official** measurement, upstream must accept and
validate consistent stable identity on both parser and F2P/P2P sides, settle the
explicit coverage/exclusion/incompleteness policy, and supply collision-free
suite/file/test identities for the affected QUnit producer and annotations.
Revalidate baseline/gold against that accepted schema/version before measuring
new candidates. This patch alone cannot make the saved full Three.js mapping
unique. Until those collisions are resolved, this scoring path is unsupported
for selecting the next candidate. Historical tasks/scores remain in place;
future suitability rules must be fixed before any new run. No permanent fork
or external upstream publication is proposed here.
