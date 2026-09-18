# Full delivery patches and the SWE-PolyBench application contract

**Decision В: the conflicts are real; no official conflict-resolution or export
normalization rule was found in the checked sources.** Preserve the full author
patch and unchanged historical prediction. Do not modify the exporter or rescore
these attempts. For a future product-delivery measurement, propose one separate,
predeclared protocol: apply the complete delivery to B, run its public/author
regressions, and evaluate production behavior with an independently prepared
acceptance suite outside the delivered test tree. That suite and its interface
must be frozen before author runs and must not overwrite author tests. This is a
new product evaluation protocol, not official SWE-PolyBench resolved, and is not
implemented or scheduled here.

Nine saved failures reproduce on all four pinned images. Every full M strictly
applies to its exact B; every T strictly applies to B. All nine strict M-after-T
checks fail. Original upstream T→M also fails in all nine, with Git exit 1 followed
by patch exit 1 and cleanup. No project tests or scoring ran. No provider calls,
author sessions, availability probes, continuations or hidden-test feedback to
an author occurred.

## Scope and provenance

Historical inputs: `9317ccc9e2e3af6cfe7e876acd4541f3e7445f3b`; measured runtime:
`e18db1fe10223db52dcc05b3e769bca140367c2b`, unchanged. Evaluator:
`9c836c5d7f3cb991934132b77d29e6941d912a07` (commit date 2026-06-16).
Dataset: `AmazonScience/SWE-PolyBench_Verified` at
`b3fca77b637379f0c01ad86d18753a7ac1998b53`.

The four retained per-instance CSV hashes match the frozen manifest. Their exact
base_commit/test_patch bytes were used, and T hashes match historical strict
observations. Each M matches its JSON-decoded prediction byte for byte, also
through upstream's pandas loader: no markdown removal, LF normalization or lost
final newline. All nine M end in LF and contain no CR bytes. This rules out an
export-byte mismatch in these cases; author-added EOF changes inside fixtures
remain part of M, not exporter normalization.

| Instance | Exact base commit | Image digest (GHCR instance repository as in evidence) |
|---|---|---|
| serverless-6534 | `d4c8bc1450d31275596b26bb7464a6f1b28392af` | `sha256:8600be77e4c2e4456f8587222423922fd33b4a70162c127bb1c16c8a55a3792f` |
| serverless-6842 | `6e5572350549e1277eebb5952dc01b45a96a8957` | `sha256:2cf0633139250bf901f75ac7755a7cf4a11909cf4fd788888ffdb2806666c514` |
| material-ui-20356 | `67468679f7c5dfa881ea12a32cfe4a5b44cf6680` | `sha256:7acde0dad3050de6a079120cf982095a8c11e3c41c5e8932155ce1f33081e3f7` |
| svelte-1190 | `0c3e44ac05c651c12c94e047bf712cb86278d345` | `sha256:28167366b3d50bb7b6cc3441186980d6022986d9fc60d6e6a193c7aa7cb7b858` |

No images needed restoration. All four expose Git 2.34.1 and GNU patch 2.7.6.
The images' HEADs equal their frozen base commits, but baked build edits exist:
serverless has a modified Dockerfile; MUI/Svelte have modified package.json and
yarn.lock. None intersects M/T paths. Strict scenarios restore these tracked
files to B before any patch; official scenarios retain the original image tree,
exactly as the historical evaluator did. This distinction was discovered by a
failed initial baseline assertion, not silently erased.

## Official contract: separate four kinds of evidence

**Documented requirement.** The pinned [evaluator README, Evaluation section](https://github.com/amazon-science/SWE-PolyBench/blob/9c836c5d7f3cb991934132b77d29e6941d912a07/README.md#evaluation)
requires JSONL with `instance_id` and string `model_patch`; it does not specify
that it must be the entire Git diff or a production-only subset. The
[Submission README](https://github.com/amazon-science/SWE-PolyBench/blob/e7062f4a848ca7775bc1c1313f7aa419bd6a3ec1/README.md)
requires prediction, evaluation and trajectory artifacts, without a tests,
snapshots or fixture filtering algorithm. Submission revision was independently
resolved to `e7062f4a848ca7775bc1c1313f7aa419bd6a3ec1` on 2026-09-18; it is not
represented as part of the historical evaluator commit. Its linked
[submission landing page](https://www.swebench.com/submit.html), checked on that
date, adds no PolyBench patch-overlap rule; no wider benchmark-protocol survey
was performed.

An official [rules clarification, issue #14](https://github.com/amazon-science/SWE-PolyBench/issues/14#issuecomment-3483425193)
(2025-11-04, retrieved 2026-09-18) permits running existing tests and prohibits
exposing the golden test_patch to authors. It does not settle exporting new
author tests or resolving intersections. A bounded official issues/PR search
for `patch` returned 12 entries; the relevant rules thread was read. No
maintainer was contacted. Source hashes and exact search scope are in
[sources.json](evidence/sources.json).

**В проверенных официальных источниках правило не найдено** — specifically,
no rule requiring/prohibiting all author test changes, or defining their
filtering, normalization, restoration or conflict resolution. Absence is neither
permission for arbitrary filtering nor proof that author regression tests are
forbidden. `patch_type="code"` and separate gold.patch/test_patch do not establish
such a rule.

**Implementation behavior.** [Prediction loading](https://github.com/amazon-science/SWE-PolyBench/blob/9c836c5d7f3cb991934132b77d29e6941d912a07/src/poly_bench_evaluation/run_evaluation.py#L345)
merges the prediction string by ID;
[instance construction](https://github.com/amazon-science/SWE-PolyBench/blob/9c836c5d7f3cb991934132b77d29e6941d912a07/src/poly_bench_evaluation/polybench_data.py#L75)
passes it through. The [application order](https://github.com/amazon-science/SWE-PolyBench/blob/9c836c5d7f3cb991934132b77d29e6941d912a07/src/poly_bench_evaluation/run_evaluation.py#L177)
is test then model. [DockerManager](https://github.com/amazon-science/SWE-PolyBench/blob/9c836c5d7f3cb991934132b77d29e6941d912a07/src/poly_bench_evaluation/docker_utils.py#L219)
applies the supplied patch unfiltered, in image workdir as root:

```text
git apply -v --ignore-whitespace --reject /testbed/patch_<type>.diff
patch --batch --fuzz=5 -p1 -f -i /testbed/patch_<type>.diff
```

The second command runs only after the first fails, on its partially modified
tree. There is no reset, test restoration or three-way merge. Fallback failure
raises and stops/removes the container; tests are not run on this failed tree.

**Example, not a rule.** The official submission branch's
[Prometheus export](https://github.com/amazon-science/SWE-PolyBench/blob/e7062f4a848ca7775bc1c1313f7aa419bd6a3ec1/evaluation/PBVerified/20251130_prometheus_gpt-5/all_preds.jsonl)
contains 372 JSONL rows and four rows with obvious test paths, including
serverless-6534's `mergeIamTemplates.test.js`. These are ordinary Git diffs with
test edits. That demonstrates an existing submission shape, not guaranteed
acceptance, an exhaustive path taxonomy or an authorized transformation.

**Our proposed policy.** Keep full delivery, benchmark prediction and diagnostic
derivatives distinct. In this pilot the first two have identical patch bytes.
No production-only derivative was created. The proposed separate acceptance
protocol above preserves full deliveries and avoids test-tree patch overlays;
it requires a new freeze and acceptance definition before any future use.

## Adapter comparison

The historical [evaluate.py](../evaluate.py) invokes the original evaluator and
superclass application method. Its added strict `git apply --check --binary`
uses a temporary file, then removes it; it does not mutate tracked files.
The wrapper retains upstream order, cwd, patch bytes, flags and partial tree
between Git and fallback. Its intentional boundary changes pin image identity,
skip unused base builds, forbid implicit pulls/builds and restrict resources and
network. Historical provenance has no prepared-dependency overlay for these
four instances. [collect.py](../collect.py) decodes captured UTF-8 bytes;
[results.py](../results.py) JSON-encodes those strings without file filtering.
No evidence of an adapter-caused application mismatch was found here.

## All nine failures

`0` = command success; `1` = rejection. Every row has strict B+M = 0 and B+T = 0;
strict M after T = 1, official Git(M) = 1 and fallback(M) = 1. “Files/hunks” below
counts first Git(M) rejects, before fallback creates additional production
rejects. Exact source patch line headers, base-relative changed ranges, hashes,
partial applications and artifact inventories are in each linked case.

| Instance / arm | First rejected files / hunks | Classification | Evidence |
|---|---:|---|---|
| serverless-6534 P | 1 / 2 | Structural split and changed context; deletion targets no longer belong to the same setup | [P](evidence/serverless__serverless-6534-P.json) |
| serverless-6534 H0 | 1 / 2 | Same structural overlap; additional setup assertion and new mixed-name test partially apply | [H0](evidence/serverless__serverless-6534-H0.json) |
| serverless-6534 H1 | 1 / 2 | Same structural overlap; custom-name assertion is moved into canonical setup | [H1](evidence/serverless__serverless-6534-H1.json) |
| serverless-6842 H0 | 1 / 3 | Different assertion strings: `or` versus `/` | [H0](evidence/serverless__serverless-6842-H0.json) |
| material-ui-20356 P | 1 / 1 | Different text for the same absence assertion, overlapping comment deletion | [P](evidence/mui__material-ui-20356-P.json) |
| material-ui-20356 H1 | 1 / 2 | Same first overlap plus exact repeated self-label change | [H1](evidence/mui__material-ui-20356-H1.json) |
| svelte-1190 P | 84 / 84 | 62 byte-identical overlapping files; 22 differing fixtures/generated expectations | [P](evidence/sveltejs__svelte-1190-P.json) |
| svelte-1190 H0 | 81 / 87 | 64 files differ only in added final LF; 17 have other differences, including context-only CSS runner conflict | [H0](evidence/sveltejs__svelte-1190-H0.json) |
| svelte-1190 H1 | 84 / 86 | 64 byte-identical overlapping files; 20 differing fixtures/generated expectations | [H1](evidence/sveltejs__svelte-1190-H1.json) |

### serverless-6534: Resource deletions are not equivalent after test splitting

In B, lines 127–231 describe one custom-name setup but expect both canonical
wildcards and custom resources. All M variants remove canonical Resource entries
in hunks starting at B:178 and B:194. T expands B:138 and B:183 into separate
custom-only, canonical-only and mixed-name scenarios. It retains canonical
expectations in the canonical setup and changes ordering in the mixed setup.
Thus matching deleted Resource text does not identify an equivalent test.

Git moves M's first test hunk by +85 lines into the canonical-only scenario:
P deletes its `canonicalFunctionsPrefix`; H0 also adds a custom-name list
assertion; H1 adds a custom-name equality assertion. Those are recorded partial
applications, not a valid merge. The Resource hunks reject because the old
adjacent canonical/custom expectations no longer exist there. H0's added mixed
scenario applies separately. Fallback then finds similar blocks in the mixed
scenario with fuzz 3, and applies the first hunk again there; it also repeats
H0's new test. The production hunk was already applied by Git and rejects on
fallback. All three official attempts fail. The original problem concerns overly
wide custom-name permissions; it does not justify interpreting deletion from a
canonical-only test as semantically equivalent. No test-strength verdict is made.

### serverless-6842: incompatible assertion text

At B:513, 526 and 547, T changes the messages/regex to `Action / NotAction` and
`Resource / NotResource`; M changes them to `Action or NotAction` and
`Resource or NotResource`. Both change the same old assertions, so these are
value conflicts, not merely filename collisions. The problem requests NotAction
and NotResource support without prescribing these exact message strings; this
application diagnosis does not label M's tests weaker. Git applies production,
docs and M's appended test, rejects the three assertions. Fallback rejects the
already-applied production hunks and conflicting assertions, but repeats doc
insertions and the appended test. Overall exit remains 1.

### Material UI: Select.test.js, B:405–423

T changes the unnamed Select assertion from an attribute equal to one space to
attribute absence (`.to.not.have.attribute`), while M uses `.not.to.have.attribute`
and removes the TODO; H1 also renames the test. The common render/setup and
assertion intent match, but the replacement text and edited span differ, so
neither is an exact duplicate patch. H1's second hunk B:417 exactly repeats T's
removal of the leading space from the self-label ID expectation. P does not
include that second change. Both M production patches apply in the first Git
step; H1's separate TablePagination regression also applies. Fallback rejects
Select test changes and the already-applied production replacement; P's
production declaration insertion and H1's TablePagination insertion are repeated
with fuzz. No partially applied tree is executed.

### Svelte: fixture groups from the same B

All three arms overlap 46 `*expected.css` and 30 `*expected.html` paths (including
SSR expectations), plus generated JS; P/H1 also overlap sourcemap output pairs.
The complete per-path B/T/M hashes and zero-context Git hunk ranges are retained.

For example, `test/css/samples/basic/expected.css` changes
`div[svelte-xyz],[svelte-xyz] div` to `div.svelte-xyz,.svelte-xyz div` identically
in T/P/H1; H0 adds a final LF. In
`omit-scoping-attribute-class-static/expected.html`, T uses `foo svelte-xyz`,
where all M use `svelte-xyz foo` (H0 also adds LF). P's refs/refs-qualified keep
single quotes where T/H1 use double quotes. These textual differences do not
alone prove an HTML behavior difference. SSR `styles/_expected.css` uses
`svelte-bzh57p` in T versus `svelte-724714405` in M; generated JS/sourcemap files
also differ in scoping IDs and helper/context structure. This is not a uniform
“identical fixtures” case.

H0's `test/css/index.js` B:92 hunk changes how expected CSS is read, but includes
an unchanged context assertion that T changed to a broader scoping-ID regex.
Its own edited line and T's edited line differ: this hunk is a context-only
conflict. Its terminal-LF hunk applies; fallback applies the read-trimming hunk
with fuzz. No normalization is applied to the original patches or fixture bytes.

All production hunks initially apply. Rejections begin in tests/fixtures.
Fallback then fails on already-applied production changes, sometimes repeats
insertion hunks, and still rejects conflicting fixture replacements. No automatic
reverse application is observed: `-f` is present, there is no `-R`, and retained
outputs contain no reverse-detection success. The final failure is reproduced,
not repaired. None of this establishes production correctness.

## Controls, integrity and limits

[Five controls](evidence/controls.json) observe: separate production/test files
succeed; distant hunks in one test file succeed; identical assertion replacement
rejects; different values for one assertion reject; mixed production plus
conflicting test applies production before fallback, then rejects. They assert
expected outcomes and inspect partial/fallback artifacts.

[Development attempts](evidence/development-attempts.json) retain the initial
baseline stop and control-script defects. Early fixture generation hit Git stat
caching for equal-sized tar writes, producing empty controls; these are invalid
controls, not observed successful conflict resolution. Explicit blob indexing
fixed construction. A subsequent assertion mishandled `./prod.js.rej`; the final
five-control execution passes. No benchmark case was rerun to select an outcome.

The completed application run used 27 fresh containers / 27 scenarios in 331.624
seconds. Final five controls used one container in 10.934 seconds. Including the
initial stopped baseline container, one read-only image inspection and all four
control-development executions: 33 containers total, all removed. These local
timings are separate from historical Luna usage; no monetary cost is inferred.
No order-reversal diagnostic was needed.

[Input hashes](evidence/input-hashes.json) cover the relevant historical scripts,
manifest/report, nine patches, three prediction streams, provenance/strict logs,
nine results, accounting and local freeze/pause records. They remain unchanged.
The other nine started outcomes were not investigated as new tasks; 12 assigned
slots remain not_started. R/T/D, official outputs, runtime, TYPE_COMPAT, exporter,
evaluator/parser/scoring and permissions are unchanged. No manual repair, filter,
production-only scoring or corrected-resolved table exists.

Syntax, exact bytes (including upstream pandas decoding), bounded input integrity,
application-command invariants, controls and whitespace are checked locally. One
final review checks nine-case completeness, common-baseline provenance, original
fallback state, no repair and semantic limits. These checks are not a full CI or
platform pass. Automatic repository checks remain enabled; draft PR #25 and its
base are preserved. No merge, release, leaderboard submission or next campaign
is authorized by this report.
