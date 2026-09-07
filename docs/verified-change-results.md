# Verified-change: single frozen 60-task evaluation

The installed harness and its single final evaluation are complete. **The intended
quality improvement was not established.** The measured C rate was lower than
both comparators, and the prespecified paired confidence intervals include zero.
The product remains experimental and is not designated evidence-backed.

The fixed results are A=59/60 (98.33%), B=58/60 (96.67%) and C=56/60 (93.33%).
C recovered **0 of 1** unsuccessful D0 solutions. Its three scored losses against
A comprise **two code regressions and one operational failure**. Separate static
inspection found a further semantic regression that the frozen grader missed;
that observation does not change the frozen scores or statistics.

## Run identity and verification

This is the only official run of the existing manifest. It started on
2026-09-07 at 10:18:16.275 UTC after direct authorization for the frozen model,
synthetic payload and quota use. The final task finished at 14:14:07.407 UTC:
**3 hours 55 minutes 51.132 seconds** through the last task journal entry.

- Manifest: [manifest.json](../evals/verified-change/manifest.json), committed in
  `8c620ccf41f4c0e1339fef5818c6f256aae7599b`; SHA-256
  `68c28c91608f71b9f83b305f98fa3e821cff2bbe25f819510f830debed0ececa`.
- Product commit: `173a853c984044fc4543d05e5df2b18ee7135dfa`.
- Runner commit: `ed0f74088ed77a978186ce43eb4f496dbf40e9ca`.
- Installed archive SHA-256:
  `dd8d668cce09a157c3106888923063f3cc6a65fa5bbc8c3fe8ec9fac122fec11`.
- Model/provider: `openai/gpt-5.6-luna`; variant: `low`; installed OpenCode:
  `1.18.26`.
- Immutable Docker image:
  `sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df`.
- Limits: A 300 seconds; B/C 600 additional seconds each; no scored retries.
  Additional order was fixed in advance: 30 BC and 30 CB.

Post-run checks matched all 12 installed product files, 40 frozen runner files,
60 task definitions and the archive hash. The journal contains exactly 60 task
starts/finishes and 180 arm starts/finishes in the prescribed order. All 60
original Git workspaces remain intact; all 60 C imports match their paired A D0;
all 60 A/B session pairs differ. The audit verified 242 recorded snapshot and
patch references, including repeated references to retained snapshots; these
are not 242 independent trials or unique patches. An independent Python
calculation reproduced the family-level intervals and p-values and the exact
McNemar values. No harness container remained in the final read-only inventory.

**The frozen `evidenceAvailable` flag is false**, because C32 could not verify
container teardown. `targetEstablished` and `extraComputeSuperiority` are both
false. All 60 rows remain in the analysis. The runner's `gradingComplete=true`
means every arm has an interpretable protocol outcome: 179 snapshots received
public and hidden checks; C32 is a known operational zero and has no such check
execution. It does not mean that 180 snapshots passed independent verification.
A later empty container inventory does not repair the earlier verification gap.

The frozen package README and runner protocol retain pre-freeze wording because
they are hashed inputs. The committed manifest and this report state the actual
freeze and execution status; no hashed text was updated after observing results.

## Frozen success analysis

| Arm | Successes / N | Rate |
| --- | --- | --- |
| A | 59 / 60 | 98.33% |
| B | 58 / 60 | 96.67% |
| C | 56 / 60 | 93.33% |

| Comparison | Delta | Paired 95% CI | Wins / losses | Cluster paired t p | Nominal exact McNemar p |
| --- | --- | --- | --- | --- | --- |
| C minus A | -5.00 pp | [-10.72 pp, +0.72 pp] | 0 / 3 | 0.082814 | 0.250000 |
| C minus B | -3.33 pp | [-10.31 pp, +3.64 pp] | 1 / 3 | 0.329877 | 0.625000 |

The prespecified interval and primary test use 20 family means (three paired tasks per family), a Student t approximation with 19 degrees of freedom, and the frozen critical value 2.093024054408263. Task-level exact McNemar is retained as a nominal diagnostic; it does not remove dependence within families. No alternate analysis replaces this result.

## Operational accounting

A is the common D0 stage; B and C are additional stages from identical copies of A. C includes independent acceptance authorship and audit, assessment, repairs and verification. These are measured stage durations, not equal-spend model budgets.

| Measure | A: D0 | B: extra plain | C: harness |
| --- | --- | --- | --- |
| Stage wall total, seconds | 3241.714 | 3181.476 | 7640.195 |
| Stage wall mean, seconds | 54.029 | 53.025 | 127.337 |
| Stage wall median, seconds | 51.309 | 51.468 | 120.370 |
| Arms with observed wall time | 60 | 60 | 60 |
| Completed prompts | 60 | 60 | 132 |
| Arms with complete usage | 60 | 60 | 59 |
| Observed model steps | 431 | 384 | 675 |
| Observed tool calls | 836 | 852 | 1,330 |
| Observed total tokens | 2,876,882 | 2,428,952 | 4,888,497 |
| Observed input tokens | 912,630 | 772,131 | 1,372,627 |
| Observed output tokens | 97,662 | 82,977 | 267,195 |
| Observed reasoning tokens | 19,806 | 35,284 | 50,211 |
| Observed cache-read tokens | 1,846,784 | 1,538,560 | 3,198,464 |
| Observed cache-write tokens | 0 | 0 | 0 |

C's additional-stage wall total is 2.40 times B's (4458.719 additional seconds in this run). Observed token total is 2.01 times B's; incomplete usage prevents treating this as a complete billed-cost ratio.

A completed prompt is one adapter invocation, potentially with multiple model steps and tool calls. Token categories are the provider event fields as recorded; they must not be assumed disjoint or summed again. Missing/interrupted events are unavailable. Provider cost metadata of zero is not evidence of free execution or an account bill. Setup and cleanup are included in elapsed stage time but were not timed separately.

## Families and strata

| family | N | A successes | B successes | C successes |
| --- | --- | --- | --- | --- |
| archive-plan | 3 | 3 | 3 | 3 |
| byte-ranges | 3 | 3 | 3 | 3 |
| calendar-windows | 3 | 3 | 3 | 3 |
| catalog | 3 | 3 | 3 | 2 |
| chunk-upload | 3 | 3 | 3 | 3 |
| csv-table | 3 | 3 | 3 | 3 |
| decimal-ledger | 3 | 3 | 3 | 3 |
| dependency-graph | 3 | 3 | 3 | 3 |
| due-jobs | 3 | 3 | 3 | 3 |
| env-config | 3 | 2 | 2 | 1 |
| json-lines | 3 | 3 | 3 | 2 |
| json-pointer | 3 | 3 | 3 | 3 |
| leases | 3 | 3 | 3 | 3 |
| metric-series | 3 | 3 | 2 | 3 |
| order-state | 3 | 3 | 3 | 3 |
| package-versions | 3 | 3 | 3 | 3 |
| route-table | 3 | 3 | 3 | 3 |
| search-index | 3 | 3 | 3 | 3 |
| text-edits | 3 | 3 | 3 | 3 |
| window-quota | 3 | 3 | 3 | 3 |

| stratum | N | A successes | B successes | C successes |
| --- | --- | --- | --- | --- |
| public-reproducer | 20 | 20 | 20 | 20 |
| uncovered-requirement | 20 | 20 | 19 | 17 |
| multi-file-obligation | 20 | 19 | 19 | 19 |

## All 60 frozen observations

The order column gives the additional-arm order after A. A zero includes the frozen negative operational outcome; no failure is excluded or retried. Details, per-arm observed usage, patch hashes and check classifications are in [the public structured results](verified-change-results/results.json).

| # | Task ID | Order | A | B | C | C stop reason | C repairs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | archive-parent-segments | BC | 1 | 1 | 1 | checks_passed | 1 |
| 2 | archive-normalized-collisions | CB | 1 | 1 | 1 | checks_passed | 0 |
| 3 | archive-exclusive-rollback | BC | 1 | 1 | 1 | checks_passed | 0 |
| 4 | ranges-explicit-zero-end | CB | 1 | 1 | 1 | checks_passed | 0 |
| 5 | ranges-normalized-multiple | BC | 1 | 1 | 1 | checks_passed | 0 |
| 6 | ranges-response-consumer | CB | 1 | 1 | 1 | checks_passed | 0 |
| 7 | calendar-monday-week | BC | 1 | 1 | 1 | checks_passed | 0 |
| 8 | calendar-quarter-year | CB | 1 | 1 | 1 | checks_passed | 0 |
| 9 | calendar-ranged-report | BC | 1 | 1 | 1 | checks_passed | 0 |
| 10 | catalog-empty-own-keys | CB | 1 | 1 | 1 | checks_passed | 0 |
| 11 | catalog-language-fallback | BC | 1 | 1 | 0 | checks_passed | 1 |
| 12 | catalog-template-consumer | CB | 1 | 1 | 1 | checks_passed | 0 |
| 13 | upload-offset-order | BC | 1 | 1 | 1 | checks_passed | 0 |
| 14 | upload-idempotent-chunks | CB | 1 | 1 | 1 | checks_passed | 0 |
| 15 | upload-checksum-consumer | BC | 1 | 1 | 1 | checks_passed | 0 |
| 16 | csv-doubled-quote-data | CB | 1 | 1 | 1 | checks_passed | 0 |
| 17 | csv-roundtrip-writer | BC | 1 | 1 | 1 | checks_passed | 0 |
| 18 | csv-table-schema-validation | CB | 1 | 1 | 1 | checks_passed | 0 |
| 19 | amount-decimal-exactness | BC | 1 | 1 | 1 | checks_passed | 0 |
| 20 | amount-format-roundtrip | CB | 1 | 1 | 1 | checks_passed | 0 |
| 21 | ledger-atomic-invoice | BC | 1 | 1 | 1 | checks_passed | 0 |
| 22 | graph-duplicate-edges | CB | 1 | 1 | 1 | checks_passed | 0 |
| 23 | graph-execution-layers | BC | 1 | 1 | 1 | checks_passed | 0 |
| 24 | graph-settled-consumers | CB | 1 | 1 | 1 | checks_passed | 0 |
| 25 | due-fifo-ties | BC | 1 | 1 | 1 | checks_passed | 0 |
| 26 | due-handle-cancellation | CB | 1 | 1 | 1 | checks_passed | 0 |
| 27 | due-failure-preserves-pending | BC | 1 | 1 | 1 | checks_passed | 0 |
| 28 | env-first-equals | CB | 1 | 1 | 1 | checks_passed | 0 |
| 29 | env-recursive-expansion | BC | 1 | 1 | 0 | checks_passed | 1 |
| 30 | env-ordered-includes | CB | 0 | 0 | 0 | verification_unavailable | 0 |
| 31 | jsonl-split-utf8 | BC | 1 | 1 | 1 | checks_passed | 0 |
| 32 | jsonl-record-byte-limit | CB | 1 | 1 | 0 | execution_error | unavailable |
| 33 | jsonl-stream-transform | BC | 1 | 1 | 1 | checks_passed | 0 |
| 34 | pointer-single-pass-escapes | CB | 1 | 1 | 1 | checks_passed | 0 |
| 35 | pointer-array-index-policy | BC | 1 | 1 | 1 | checks_passed | 0 |
| 36 | pointer-immutable-replace | CB | 1 | 1 | 1 | checks_passed | 0 |
| 37 | lease-stale-release | BC | 1 | 1 | 1 | checks_passed | 0 |
| 38 | lease-renewal | CB | 1 | 1 | 1 | checks_passed | 0 |
| 39 | lease-worker-cleanup | BC | 1 | 1 | 1 | checks_passed | 0 |
| 40 | metrics-prototype-names | CB | 1 | 1 | 1 | checks_passed | 0 |
| 41 | metrics-cancellation-precision | BC | 1 | 0 | 1 | checks_passed | 0 |
| 42 | metrics-report-window-fill | CB | 1 | 1 | 1 | checks_passed | 0 |
| 43 | orders-unknown-state-totality | BC | 1 | 1 | 1 | checks_passed | 0 |
| 44 | orders-version-precondition | CB | 1 | 1 | 1 | checks_passed | 0 |
| 45 | orders-command-idempotency | BC | 1 | 1 | 1 | checks_passed | 0 |
| 46 | versions-numeric-components | CB | 1 | 1 | 1 | checks_passed | 0 |
| 47 | versions-prerelease-precedence | BC | 1 | 1 | 1 | checks_passed | 1 |
| 48 | versions-bounded-plan | CB | 1 | 1 | 1 | checks_passed | 0 |
| 49 | route-malformed-parameter | BC | 1 | 1 | 1 | checks_passed | 0 |
| 50 | route-head-fallback | CB | 1 | 1 | 1 | checks_passed | 0 |
| 51 | route-request-context | BC | 1 | 1 | 1 | checks_passed | 0 |
| 52 | search-replacement-postings | CB | 1 | 1 | 1 | checks_passed | 0 |
| 53 | search-contiguous-phrase | BC | 1 | 1 | 1 | checks_passed | 0 |
| 54 | search-atomic-import | CB | 1 | 1 | 1 | checks_passed | 0 |
| 55 | edits-original-offsets | BC | 1 | 1 | 1 | checks_passed | 0 |
| 56 | edits-validation | CB | 1 | 1 | 1 | checks_passed | 0 |
| 57 | edits-atomic-batch | BC | 1 | 1 | 1 | checks_passed | 0 |
| 58 | quota-zero-clock | CB | 1 | 1 | 1 | checks_passed | 0 |
| 59 | quota-weighted-cost | BC | 1 | 1 | 1 | checks_passed | 0 |
| 60 | quota-policy-consumer | CB | 1 | 1 | 1 | checks_passed | 0 |


## Repair and retention outcomes

Among completed C arms, 55 selected D0 without repair and four selected D1 after
one repair. All four had an A solution that already passed the frozen grader:
`archive-parent-segments`, `catalog-language-fallback`, `env-recursive-expansion`
and `versions-prerelease-precedence`. No D2 was selected. C32's incomplete report
has no final snapshot selection, but its private journal and files preserve one
repair attempt, D0 and D1. That attempt is included in observed usage; it is not
silently counted as zero model work or an accepted patch.

Completed reports list 29 unverified generated checks across 21 tasks. These are
check records, not an exhaustive count of distinct unverified user requirements.
The refusal mechanism sometimes worked, but admitted false assertions also
caused wrong production changes, as the cases below show.

## What the installed product demonstrated

The CLI uses the existing installed OpenCode executable and its provider selection. Independent acceptance authorship sees the original source, then host verification can return requirement-grounded commands and assertion diagnostics to a fresh repair session. D0 is preserved; at most D1 and D2 are permitted. An accepted patch is applied only after rechecking the user's original Git state. Authentication remains with OpenCode; the product has no provider client or lab imports.

The fresh installed mechanism checks passed 51/51 for the product and 23/23 for the runner, with no skips. They cover unchanged correct D0, missed requirements, consumers, disputed assertions, broken test runtime, rejected regressions, concurrent edits, cancellation and cleanup. The scripted localhost provider makes these reproducible controller checks; it does not establish external-model accuracy. The earlier development record includes one real correction of the explicit integer `delayMs` requirement, with a separate unresolved spurious assertion in that run. It does not establish several independently validated real-model recovery cycles or a broad learned ability.

In the final run, `edits-validation` is a concrete successful dispute: a generated assertion treated a UTF-16 code-unit interval as though it removed a whole supplementary Unicode character. The task explicitly requires UTF-16 indexing. The primary disputed this expectation, quarantined the test and retained D0 without repair; A=B=C=1. Inspection of the original task and generated test confirms that rationale. This demonstrates a working guard in one real case, not recovery of an unsuccessful D0 or reliable protection against every erroneous assertion.

## Stored failure evidence

These explanations inspect the existing task text, generated tests, patches and frozen grades. They do not introduce new scored tests, change outcomes or remove tasks.

### Generated fallback assertion caused a regression

For `catalog-language-fallback`, A and B passed, while C failed the hidden fallback-parent test after one repair. Its generated `ownership-and-case` assertion treated an inherited locale entry as a reason to return the key immediately. The assessment admitted it without a dispute. D1 added an early return equivalent to `if (!Object.hasOwn(this.messages, locale) && locale in this.messages) return key;`. This skipped a valid fallback chain. The frozen grader expected `base` and received `x`. C's public and admitted generated checks passed: the passing gate did not preserve the task's semantics.

### Generated expansion assertion caused a regression

For `env-recursive-expansion`, A and B passed and C failed after one repair. The task requires recursive resolution of referenced values, with no second scan after a referenced value has been resolved. The generated test instead expected `${REF}` to retain the unresolved text `${VALUE}` in a mixed dollar-escaping example. D1 computed the referenced resolution but appended the raw referenced string. The hidden forward-reference chain `A='${B}/end', B='${C}', C='x=y'` then produced `${C}/end` instead of `x=y/end`. Again, C passed its admitted checks and the primary assessment recorded no dispute.

### C32 could not verify container cleanup

For `jsonl-record-byte-limit`, A and B passed. C returned `infrastructure_error` with `SANDBOX_CLEANUP_UNVERIFIED`, `isolationVerified=false`, and incomplete usage accounting. Its journal records test authorship, imported D0, assessment, one repair and several completed D1 checks before the execution error. No patch was applied. The frozen cleanup error does not retain enough Docker command detail to distinguish failed inspection from a still-listed container. The error report preserved the D0 patch and the private directory also retains D1.

The later read-only Docker inventory found no session-labelled containers. One name-filter observation saw a transient `Created` harness container; a subsequent exact inspect found it absent while the next task was running. A persistent orphan was not established and no cleanup mutation was performed. This later observation cannot verify teardown at the time of the failed arm. The frozen zero and isolation flag are retained. This is an operational loss, distinct from the two demonstrated semantic regressions above, and is not evidence that a container escaped its restrictions.

### A shared zero has a contract-interpretation limitation

`env-ordered-includes` scored A=B=C=0. Each patch passed public tests but the hidden test supplied initial entry `./main.env` to an injected reader keyed by `main.env`. Passing the unnormalized initial entry produced `undefined.split` in candidate source. The frozen grader classified this as `candidate_source_runtime_failure`, so the row is a scored failure, not a broken Docker/Node invocation. The visible normalization wording discusses include paths and does not separately spell out normalization of the initial entry. The hidden test applies it to that entry too. This interpretation should be visible to readers; it is neither silently relabelled a grader bug nor presented as an unambiguous omitted requirement.

C retained D0 with `verification_unavailable`: its generated include test also used an absolute path and a parent segment despite the task's explicit parent-segment rejection. No repair was attempted. The shared zero contributes no paired difference, and stays in all denominators.

### Passing independent grades have finite coverage

`archive-parent-segments` scored 1/1/1, but C made one additional repair involving the injected `io.exists` contract, beyond the requested path-segment fix. Its install diff also changes exclusive-write failure cleanup. This was not a recovered D0: A already passed. The frozen grader does not measure every potentially altered behavior, and this report makes no post-hoc score adjustment or proof of complete semantic correctness.

### An additional plain attempt also regressed a successful D0

`metrics-cancellation-precision` scored A=1, B=0, C=1. C selected D0 with zero repairs; this is a C-versus-B win, not recovery of an unsuccessful D0. The task explicitly preserves count/min/max while improving cancellation accuracy. B replaced `Math.min`/`Math.max` with ordinary less-than/greater-than comparisons initialized from the first sample. Equal positive and negative zeros did not update these variables, breaking the prior signed-zero behavior. The hidden compatibility test failed `Object.is(out.min, -0)` for `[0, -0]`. C's generated tests did not explicitly cover signed zero; retaining D0 preserved it. Neither arm received the other's result, and no scored retry was performed.

### A further semantic regression passed the frozen grader

`versions-prerelease-precedence` scored A=B=C=1, with one C repair. The visible task says that prerelease identifiers may contain hyphens and are separated by dots, and that nonnumeric identifiers compare using case-sensitive ASCII. Generated `parse-prerelease` instead demanded `['alpha', '1', 'x9']` for `1.2.3-alpha.1-x9`, while D0 correctly returned `['alpha', '1-x9']`. D1 added hyphen splitting for numeric-prefix identifiers to satisfy that erroneous test.

Generated `compare-prerelease` also put `alpha.a` before `Alpha`, contrary to ASCII ordering. The primary assessment recorded no dispute. D1 added a branch that always returns `-1` when only one differing character is uppercase. Static tracing therefore returns `-1` for both `Alpha` versus `alpha` and the reverse order, violating both the explicit ordering and antisymmetry. The frozen grader did not exercise these counterexamples and still passed C.

This is an additional semantic regression diagnosed from the stored source, task and generated tests. It is distinct from the two semantic losses captured by the frozen grades and the operational C32 loss. It is **not** added to the scored loss count, and no replacement test, replay, denominator change or positive recovery claim is made. A frozen passing bit must not be read as complete semantic correctness.

## Limits of the requested design

- The frozen manifest permits 300 seconds for A and 600 extra seconds each for B/C, but has no equivalent hard token, model-step or currency cap. C includes authorship in its internal deadline. B starts its clock before preparation; C starts after preflight. Actual time includes setup and teardown. This does not fully satisfy an equal-model-budget comparison, even if observed costs happened to match.
- A and B use fresh OpenCode sessions through the same isolated repository-tool adapter as C, rather than all unrestricted default OpenCode tools and context discovery. Results apply to that bounded comparison.
- The corpus has 60 synthetic tasks in 20 declared families, with three tasks in each family and 20 tasks in each nominal stratum. Nine of the 20 `multi-file-obligation` tasks have both reference and alternative solutions editing only one source file: `archive-exclusive-rollback`, `ranges-response-consumer`, `calendar-ranged-report`, `csv-table-schema-validation`, `env-ordered-includes`, `pointer-immutable-replace`, `metrics-report-window-fill`, `orders-command-idempotency`, and `versions-bounded-plan`. Compatibility obligations do not by themselves prove a necessarily multi-file edit. Labels, tasks and denominators remain frozen.
- Family-level paired t inference is approximate. The prespecified family grouping addresses dependence within families, but shared synthetic authoring conventions can introduce dependence beyond it. Exact task-level McNemar remains nominal.
- Generated tests and the primary agent's interpretation assessment can both be wrong. Hidden graders also have finite coverage and the documented initial-entry interpretation. None is a general semantic oracle.
- Interrupted model usage may be absent; observed token totals are not complete billing data. Product support currently centers on Node's built-in test runner, clean Git worktrees and already-installed dependencies.

Candidate, corpus, evaluator, order, thresholds and retry policy were not changed after observing results. All three allowed development revisions were already used. No fourth revision, scored retry, exclusion or replacement evaluation is used to remedy these limitations. The product remains experimental; this measurement does not justify making it a default or releasing it.

## Reproduce the numerical analysis without model calls

The public JSON preserves all paired bits, family labels and verification flags.
From the repository root, the unchanged frozen analysis can be recomputed with:

```sh
node --input-type=module - <<'JS'
import fs from 'node:fs';
import {analyze} from './evals/verified-change/statistics.mjs';
const {rows} = JSON.parse(fs.readFileSync('docs/verified-change-results/results.json', 'utf8'));
console.log(analyze(rows, {
  isolationVerified: rows.every(r => r.isolationVerified),
  gradingComplete: rows.every(r => r.gradingComplete),
  userWorktreeIntact: rows.every(r => r.sourceUnchanged),
}));
JS
```

The original structured results have SHA-256
`e0df9903dc0064189a54f3c393770ede797f45a300ff4ad40b6d357eab347832`.
The public export omits raw model messages, tool output, absolute private paths
and assertion stacks. Complete patches, generated tests, check diagnostics,
structured outcomes, original fixture repositories and the installed archive
are preserved locally in an ignored private archive under
`local/verified-change-official-68c28c91608f/`, with a SHA-256 receipt. The archive
and raw runtime state are not committed. Authentication storage is not included.

Installation and exact mechanism-test commands are in
[the delivery status](verified-change-status.md). The single draft PR is
[PR #23](https://github.com/Tah10n/opencode-harness/pull/23).
