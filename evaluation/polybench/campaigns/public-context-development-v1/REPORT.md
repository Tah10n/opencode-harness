# Public context development v1: completed GPT-6 Luna measurement

On 2026-10-20 all 16 prescribed one-shot attempts completed and all 16 full,
unchanged patches received an independent official result. **R/D: P0 0/4,
P1 1/4, C0 0/4, C1 0/4. T: 4/4 in every arm.** The sole resolved patch is
Svelte-1116/P1. This four-task screening does not establish a core advantage.
Public context has one observed win in Plain and no observed win in core;
core has one observed loss with augmented input.

P0/P1 are Plain with original/augmented TASK; C0/C1 are core with those same
byte-identical input pairs. R is the official evaluator's `resolved`, T is
verified autonomous delivery, and D is R AND T. A tie can mean two failures.
All figures below concern this campaign alone.

The [machine results](results.json) contain every slot, result/provenance hashes,
all four comparisons and per-task cost deltas. The [request ledger](request-ledger.json)
accounts for every real request without publishing bodies or credentials.
[Full patches](patches/) retain authored tests and exact captured bytes.

## Authorization and fixed configuration

The original accepted head was `c57888631a8c75bd31f800957428fc80028ebdd5`.
The owner explicitly authorized changing the model to `openai/gpt-6-luna` and
amending the freeze before the first model request; see [MODEL-AMENDMENT.md](MODEL-AMENDMENT.md).
The original [plan](PLAN.md), [preflight](PREFLIGHT.md) and
[public manifest](history/gpt-5.6-luna-frozen-manifest.json) remain unchanged history.
The original private freeze still hashes to
`ab80a1800f9b4a5622a33e80eb87c8be63c85fc16f1acc3c596a7f732ca8579b`.

The admitted participant head was `8c12965db3da07a474ffa7a749c0be9f9488ec15`,
product `ffbf979b4fdae958b71796e22e6b7a81a0edce50`, adapter
`41dd7ecc7b05be623f8b54186d80b53b4ed8870a`. The amended freeze remained
`e66e10b7725609fae063f444856f91ec6474e2308ad6e360fe24b3e8b4904970`
through execution and evaluation. No executable, task, protocol or scoring
change followed admission. Report commits do not change the participant runtime.

OpenCode 1.18.26; `high`; 1800 seconds per complete attempt; concurrency one;
16 attempts; zero attempt retries. The fixed four tasks, Latin-square order,
comments/cutoffs, source/dependency bytes, core, prompts, isolation, evaluator
and stop policy were preserved. All eight mandatory isolated input checks
passed on the admitted launch. No separate real smoke/auth request was made.

## All assigned slots

All rows completed normally, with T=true, complete recordings, no pending tools,
confirmed process termination and relay removal. All captured patches strictly
apply to their original author base. The official evaluator first applies its
test patch and then the **whole** candidate patch. Five candidate patches were
rejected at that second step; those are official R=false, not unknown. The other
11 reached tests. No tests were removed and no patch was repaired by the operator.

| Slot | Task | Arm | R | T | D | Official disposition |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | svelte-1116 | P0 | false | true | false | Nested store test fails |
| 2 | svelte-1116 | P1 | true | true | true | Official resolved |
| 3 | svelte-1116 | C0 | false | true | false | Full patch rejected: authored fixture already exists |
| 4 | svelte-1116 | C1 | false | true | false | Nested store test fails |
| 5 | material-ui-22696 | P1 | false | true | false | Control/Meta official tests fail |
| 6 | material-ui-22696 | C0 | false | true | false | Control/Meta official tests fail |
| 7 | material-ui-22696 | C1 | false | true | false | Control/Meta official tests fail |
| 8 | material-ui-22696 | P0 | false | true | false | Control/Meta official tests fail |
| 9 | svelte-6525 | C0 | false | true | false | Full patch rejected: expected-output overlap |
| 10 | svelte-6525 | C1 | false | true | false | Full patch rejected: expected-output overlap |
| 11 | svelte-6525 | P0 | false | true | false | Full patch rejected: expected-output overlap |
| 12 | svelte-6525 | P1 | false | true | false | Two official generated-output tests fail |
| 13 | material-ui-12236 | C1 | false | true | false | withTheme innerRef test fails |
| 14 | material-ui-12236 | P0 | false | true | false | withTheme innerRef test fails |
| 15 | material-ui-12236 | P1 | false | true | false | Full patch rejected: withWidth test overlap |
| 16 | material-ui-12236 | C0 | false | true | false | withTheme innerRef test fails |

## Prespecified comparisons

Each tuple is **wins / losses / ties / unknown**, candidate minus control.
No C1-versus-P0 contrast is used to attribute a harness effect.

| Comparison | R | T | D |
| --- | --- | --- | --- |
| P1 − P0: context in Plain | 1 / 0 / 3 / 0 | 0 / 0 / 4 / 0 | 1 / 0 / 3 / 0 |
| C1 − C0: context in core | 0 / 0 / 4 / 0 | 0 / 0 / 4 / 0 | 0 / 0 / 4 / 0 |
| C0 − P0: core, original input | 0 / 0 / 4 / 0 | 0 / 0 / 4 / 0 | 0 / 0 / 4 / 0 |
| C1 − P1: core, augmented input | 0 / 1 / 3 / 0 | 0 / 0 / 4 / 0 | 0 / 1 / 3 / 0 |

| Comparison | Δ requests | Δ input tokens | Δ output tokens | Δ native seconds |
| --- | ---: | ---: | ---: | ---: |
| P1 − P0 | +2 | −41,646 | −6,231 | +190.669 |
| C1 − C0 | +17 | +2,652,826 | +7,743 | +713.982 |
| C0 − P0 | +13 | +594,453 | +475 | +242.153 |
| C1 − P1 | +28 | +3,288,925 | +14,449 | +765.466 |

Money is unknown in all four comparisons. Cached/reasoning deltas, capture,
cleanup, tool counts and individual task deltas are in the machine results.
These are descriptive paired observations, not estimates of a general effect.

## What the patches and recorded tools show

**Svelte-1116 — one Plain context win; one core loss on augmented input.**
The discussion clarifies that a vanilla store reproduces the problem without
svelte-redux. P1 moves store initialization from public `render` into nested
`_render`, using the existing store or the component's own factory, and adds
a vanilla-store nested SSR fixture. Its recorded targeted test finishes with
five passes; the official nested-store criterion passes. Nine other suite
failures match the historical baseline/gold failures and do not fail the
prespecified P2P criterion. This is a concrete nested-render repair, not merely
a renamed generated interface, but it is not evidence of all possible store
precedence/lifecycle behavior.

P0 and C1 instead make parent-store forwarding unconditional. Neither
initializes a nested component's own store. C1 adds a test for an externally
supplied root store and extends the SSR test runner for that case. That test
addresses a different store source; the official nested-factory case still
fails. The vanilla-store clarification therefore accompanies success in P1 but
does not rescue C1. The trajectory does not establish an internal reason for
the different choices. C0 adds initialization and records passing targeted
tests, but its `store-nested` fixture collides with files introduced by the
official test patch. Its frozen full-patch result is FAIL; no source-only
counterfactual was evaluated.

**Material UI-22696 — useful comment detail, no official improvement.**
The discussion supplies the `ctrlKey`/`metaKey` close condition without a
`multiple` guard. All four final patches restrict the new behavior to multiple
selection. P1/C1 include Meta in addition to Ctrl/Shift; P0/C0 omit Meta.
The two official tests use default single selection and check that `onClose`
is not called for Control/Meta, so all four fail them. The original body
emphasizes `multiple`; this scope mismatch is visible and does not change R.
Author tests cover multiple selection and can pass while the official behavior
remains absent. Several author test processes printed passing tests but stayed
alive until their shell timeout; the complete native attempts nevertheless
terminated normally within their budgets. Those local test timeouts are not
extra model attempts or a scheduler stop.

**Svelte-6525 — no resolved result; patch overlap and narrower verification.**
The comments suggest simple helpers when hydration is disabled and clarify
that reported bundle sizes were production minified/gzipped sizes. P1 separates
`append_hydration` but leaves ordinary `insert` referring to it; the official
generated output still expects `insert_hydration` and both target tests fail.
Thus its new append fixture is insufficient to establish the requested bundle
fix. The other three patches also separate insertion behavior, but change the
same expected-output fixtures that the evaluator installs first. All three full
patches are rejected. Their R cannot certify the underlying source changes.
C0's recorded one-off bundle check reports 6,773 bytes without the hydration
helpers, and C1 runs additional raw-HTML/hydration tests; these are participant
observations, not independent official successes. The official acceptance tests
here assert generated helper interfaces; even passing those alone would not
prove production minified/gzipped size reduction and complete hydration safety.
Existing browser-launch failures remain visible in the logs and historical
controls; they are not newly attributed model regressions.

**Material UI-12236 — comments identify wider scope, all patches remain narrow.**
The discussion explicitly asks for consistency across `withWidth`, `withTheme`
and `withStyles`, and distinguishes component refs from RootRef's DOM ref.
All four patches forward `innerRef` through `withWidth` and update its type and
tests; none updates `withTheme`. The three patches that reach official tests
pass the withWidth case and fail the withTheme case. P1 is rejected earlier
because its authored withWidth test overlaps the official patch. Recorded
withWidth-only author runs report 16 passes. Added context therefore neither
expands the implemented scope nor yields an official win on this task.

No new P2P failure is reported among the 11 test-executed slots
(`no_p2p_failed=true` for each). This does not prove absence of regressions in
the five rejected patches or behavior outside the pinned tests. Comments
accompany both the sole win and several missed requirements; no beneficial
causal mechanism or general superiority is inferred from these trajectories.

## Requests, usage and time

Every forwarded request has a completed server outcome, recorded usage and
actual response model `gpt-6-luna`. There are **397 requests: 16 title and 381
work**, in 16 fresh native author sessions. There is no separate parent/child
solver phase. All request/response file sizes and SHA-256 values were reread
and verified; all SSE terminal responses were parsed. Unknown provider outcomes,
missing usage and incomplete recordings: **0**.

| Arm | Requests | Input | Output | Cached ⊆ input | Reasoning ⊆ output | Native seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P0 | 88 | 2,444,573 | 21,451 | 1,013,376 | 8,489 | 887.413 |
| P1 | 90 | 2,402,927 | 15,220 | 954,880 | 5,535 | 1,078.082 |
| C0 | 101 | 3,039,026 | 21,926 | 1,196,672 | 9,270 | 1,129.566 |
| C1 | 118 | 5,691,852 | 29,669 | 2,252,032 | 14,023 | 1,843.548 |
| Total | 397 | 13,578,378 | 88,266 | 5,416,960 | 37,317 | 4,938.608 |

Cached/reasoning are included subsets, never additional tokens. Monetary cost
is **unknown**: the existing OAuth connection does not provide trustworthy
billed-price evidence. An API list price is not substituted.

Participant native time totals **82.310 minutes**, including workload stop;
632 tool calls. Post-stop capture totals **15.771 seconds** and container
cleanup **4.844 seconds**, measured separately. The first task started at
12:57:06.113 UTC; the final container cleanup ended at 14:32:02.028 UTC
(94m55.915s span, including inter-slot setup). Earlier admission/input checks
are outside that span. Uninstrumented operator/preparation time is not inferred.

The four independent evaluator processes total **710.363 seconds**: P0 170.888,
P1 299.368, C0 77.116, C1 162.992; all exit 0. Evaluator exit 0 means evaluation
completed, not that candidate patches resolved the tasks. Historical baseline/
gold preparation, the original scripted preflight, the amendment's 20 local
scripted requests, local verification and GitHub CI are separate from the
397 real requests and participant time.

## Validation and evidence retention

The amended head passed all three required
[admission CI jobs](https://github.com/Tah10n/opencode-harness/actions/runs/39423164473).
Local amendment verification completed all 26 ordinary checks in three segments:
10 passed before missing sensitivity dependencies, two more before missing root
TypeScript, then the remaining 14 after the pinned installs. The initial two
nonzero invocations are retained, not described as full green runs. The complete
CI verification passed. The final report commit receives its own CI; current
checks are available on [Draft PR #43](https://github.com/Tah10n/opencode-harness/pull/43).

The pinned evaluator is `9c836c5d7f3cb991934132b77d29e6941d912a07`; image
identities, network-none boundary, immutable prediction hashes, strict-application
diagnostics and official-result hashes are recorded in `results.json`. Raw
requests, native evidence, administrative snapshots, official logs/results,
original/amended freezes and exact TASK inputs remain private. The verified
archive and cleanup receipt are described in [CLEANUP.md](CLEANUP.md).

The first old-model invocation was stopped before admission after the owner's
model change; it made zero model requests. The amended series has no technical
pause, missing slot, retry, model mismatch or incomplete provider outcome.
Official patch rejections and solution failures remain explicit above.

This is a selected development set of four tasks from two repositories with
eligible public comments, one sample per cell. Order effects, stochastic
variation, narrow official interfaces and possible prior model exposure are
uncontrolled limits. Core remains optional; no default change, additional
campaign, Ready, merge, release, deployment or external review was performed.
