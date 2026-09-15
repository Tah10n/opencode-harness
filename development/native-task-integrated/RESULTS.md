# Integrated comparison: keep the simple direct candidate

**Decision:** retain **Hbase** as the product-development candidate; do not promote the sensitivity/investigator bundle. It delivered every started task, while Htools added no complete delivery in the comparable completed slots. This is a development decision under incomplete evidence, not proof of repeatability on UFO or a general quality advantage. No runtime/default change or next campaign is part of this decision.

The frozen stop policy ended execution during slot 10. **10/12 assigned attempts started; 9 ended normally; 8 delivered complete correct patches.** Slots 11–12 were never submitted. Their quality and terminal outcome are unknown, not failures. The second UFO repetition therefore cannot establish a three-way comparison.

## What was measured

Runtime `797ce6f1b75af217e00224d1b38790346dee1d19`; preparation published before execution at `47888839aa2215aa382fc9b8a5a3268d387b9adf`. OpenCode 1.18.26, `openai/gpt-5.6-luna`, high, 1800 seconds per whole attempt. Same isolated environment and existing OpenAI authorization route; no probes, retries, resumed historical slots or treatment changes. P is plain OpenCode, Hbase is stock direct without optional components, Htools adds only the existing sensitivity/investigator package with its shared 180-second allowance and one optional child. [Frozen tasks, rubric and configuration](PLAN.md).

A changes persistence and synchronization through a real portfolio's controls, storage, reload, canvas and document theme. B adds URLSearchParams across UFO's stringifyQuery, withQuery and existing $URL consumers, including compatibility, public types and delivered regressions. Both whole public source snapshots and dependency manifests were fixed before model calls. [Machine-readable inputs](frozen-inputs.json).

Every started attempt received the full task. Saved actual request schemas show no harness tools in P, only harness_task in Hbase, and harness_task/sense/investigate in Htools; all requests used the intended model/effort. [Configuration and accounting audit](accounting-audit.json).

## Every assigned attempt

Q = complete correct portable patch with required tests/types/docs. T = normal autonomous delivery and verified termination. D = Q and T. A checkmark means true; a cross means false; — means not observed. Internal `incomplete` is not a quality failure: all six normally delivered harness patches had that internal status, and all six earned Q/T/D.

| Slot | Task | Arm | Repeat | State | Q | T | D | Seconds | Requests | Known total tokens | Patch |
|---|---|---|---:|---|---|---|---|---:|---:|---:|---|
| 1 | A | P | 1 | completed | ✓ | ✓ | ✓ | 380.237 | 26 | 790,910 | [n07](patches/n07.patch) |
| 2 | A | Hbase | 1 | completed | ✓ | ✓ | ✓ | 487.273 | 40 | 1,347,600 | [n02](patches/n02.patch) |
| 3 | A | Htools | 1 | completed | ✓ | ✓ | ✓ | 439.731 | 40 | 1,437,604 | [n11](patches/n11.patch) |
| 4 | A | Htools | 2 | completed | ✓ | ✓ | ✓ | 491.850 | 45 | 1,645,365 | [n04](patches/n04.patch) |
| 5 | A | Hbase | 2 | completed | ✓ | ✓ | ✓ | 590.900 | 42 | 1,822,589 | [n09](patches/n09.patch) |
| 6 | A | P | 2 | completed | ✓ | ✓ | ✓ | 513.774 | 40 | 1,579,409 | [n01](patches/n01.patch) |
| 7 | B | Hbase | 1 | completed | ✓ | ✓ | ✓ | 567.227 | 55 | 2,386,065 | [n12](patches/n12.patch) |
| 8 | B | P | 1 | completed | ✗ | ✓ | ✗ | 671.759 | 53 | 2,602,917 | [n05](patches/n05.patch) |
| 9 | B | Htools | 1 | completed | ✓ | ✓ | ✓ | 761.662 | 47 | 2,562,684 | [n10](patches/n10.patch) |
| 10 | B | Htools | 2 | stopped; unknown submission | ✗ | ✗ | ✗ | 470.541 | 21 | ≥582,782* | [n03 retained worktree](patches/n03.patch) |
| 11 | B | P | 2 | not_started | — | — | — | — | 0 | 0 | — |
| 12 | B | Hbase | 2 | not_started | — | — | — | — | 0 | 0 | — |

*Slot 10 has 20 requests with usage and one forwarded request with unknown usage. The known total is a lower bound, not a complete cost. Its patch was extracted from the retained working tree; it was not a native terminal delivery. [All rows and exact patch hashes](results.json), [individual acceptance reviews](reviews).

| Task | P confirmed D / assigned | Hbase confirmed D / assigned | Htools confirmed D / assigned |
|---|---|---|---|
| A | 2/2 | 2/2 | 2/2 |
| B | 0/2: one Q failure, one not_started | 1/2: one D, one not_started | 1/2: one D, one interrupted |

The B denominators above are **assigned slots**, not empirical success-rate denominators. Among started B attempts the counts are P 0/1, Hbase 1/1, Htools 1/2. Missing P/Hbase repeats remain missing. Two repetitions of one task are not two independent tasks; no pooled twelve-observation lift or confidence interval is reported.

## Independent acceptance and calibration limits

All ten captured patches applied unchanged in ordinary Git copies. Q evaluation used neutral IDs and no arm-specific configuration. One integrator performed the manual review and also knew the assignment mapping; this was not a fully blinded independent human review. Frozen automatic contracts and full patch/test/type/doc inspection are separate evidence.

- **A:** all six patches pass project lint, formatting, delivered Node tests, TypeScript/build and the real Chromium scenario. It exercises legacy migration, record precedence, malformed-record retention, controls and actual backdrop/document theme, save/reload, two tabs, event filtering/no echo, latest sibling field and blocked storage. Screenshots were inspected. Delivered tests also fail when their real legacy-migration persistence is disabled in a separate evaluation copy. The historical input's CRLF/Prettier failure was recorded before execution; these six authors repaired that mismatch without removing the checks.
- **B:** Hbase/r1 and Htools/r1 pass npm test (including lint, formatting, runtime and type tests), build, frozen public behavioral/type checks and the append compatibility follow-up. P/r1 and retained Htools/r2 pass runtime/type tests, build and the frozen behavioral suite, but fail the required npm test chain on newly introduced ESLint errors and fail the append behavior below. These are separate code-quality and semantic failures, not deductions from internal status or from missing runner interpretation.
- All four B delivered query test suites detect loss of URLSearchParams serialization. These offline checks belong to the evaluator, not to sensitivity or investigator. No exact mutant or assertion spelling was required of authors.

**Calibration gap discovered during review:** the frozen UFO reference and alternative both miss an already-declared append overlay case. If the incoming query owns `drop: undefined`, the original object-backed append removes `drop` from serialized output. P/r1 and Htools/r2 first stringify the incoming object, losing the key before deciding which receiving entries to replace. A params-backed receiver therefore retains `drop=old`.

The unchanged follow-up input is `/base?drop=old&keep=ok#old` plus `child#new` with query `{drop: undefined}`. The expected URL is `/base/child?keep=ok#new`; both failing candidates and both calibration solutions produce `/base/child?drop=old&keep=ok#new`. Hbase/r1 and Htools/r1 pass. [Executable compatibility check](evaluation/append-compatibility.test.ts), [reference/alternative outcomes](calibration/append-followup.json).

This check was written **after inspecting patches** to verify the task's existing overlay/undefined compatibility obligation; it was not one of the pre-model frozen checks. The rubric and calibration sources were not changed. Their original finite calibration passed but was incomplete; they are not an infallible specification. The two Q failures also independently fail the original required lint gate, so neither Q classification depends solely on this follow-up case.

## Why delivery was lost

**P / UFO r1:** the author received the entire task and read the relevant consumers. It implemented all three paths but formed append replacement keys from a serialized object, dropping undefined-valued keys. This is a concrete merge-order error, not evidence of context loss.

The shell did not expose bare `pnpm` globally. However, the author successfully ran `npx --yes pnpm@10.33.2 --version` (10.33.2), then chose `CI=true node_modules/.bin/pnpm install --offline`. That command recreated its existing node_modules and failed. Later offline downloads/checks failed. Hbase used the existing tools via npm exec/npm run; Htools/r1 eventually used npm test successfully. Thus the plain final answer correctly disclosed blocked verification, but attributing the whole gap to an unavailable environment omits its own destructive dependency-recreation choice. The ordinary fresh-copy evaluator exposes four new `unicorn/prefer-spread` errors. No missing files or dependencies were repaired in the submitted patch.

**Htools / UFO r2:** its captured patch has the same append defect and one new prefer-spread error (plus an unused-import warning). It was interrupted before delivery, so those are findings about the retained state, not a claim that its author would have finished incorrectly. It had tried bare pnpm, a registry-backed npm exec and corepack; offline resolution failed. No investigator or sensitivity call occurred in this attempt. There is no basis to blame missing delegation for the transport interruption.

## Stop and accounting

Slot 10 ended at 470.541 seconds, not its 1800-second deadline, with native exit 137 and no normal final stop. Request 21 had HTTP 200 and response `in_progress`, then `AbortError`; terminal provider completion and usage are unknown. There is no confirmed quota/refusal result and no sufficient evidence to label exit 137 an OOM. Local workload termination, capture, closed forwarding, removed relay and zero active provider handlers were verified. Unknown remote work was not replayed. Slots 11–12 remain not_started.

**409 forwarded requests:** 10 title requests and 399 work requests; 408 have usage, one does not. Known inclusive totals are **16,757,925 tokens** = 16,558,849 input + 199,076 output. Of these, cached input is 7,456,256 and reasoning output is 112,806; both are subsets and are not added again. Complete work-request totals for slots 1–9 exactly match native session accounting. Slot 10's native retained accounting is incomplete and is not added to provider totals. Monetary cost is unknown without a reliable bill.

| Task / arm | Started | Requests | Known inclusive tokens | Aggregate seconds |
|---|---:|---:|---:|---:|
| A / P | 2 | 66 | 2,370,319 | 894.011 |
| A / Hbase | 2 | 82 | 3,170,189 | 1,078.173 |
| A / Htools | 2 | 85 | 3,082,969 | 931.581 |
| B / P | 1 | 53 | 2,602,917 | 671.759 |
| B / Hbase | 1 | 55 | 2,386,065 | 567.227 |
| B / Htools | 2 | 68 | ≥3,145,466 | 1,232.203 |

B totals have unequal exposure and must not be treated as equal-repeat cost comparisons. A's first plain patch was briefly evaluated concurrently with Hbase/r1; subsequent heavyweight evaluation was deferred until the series stopped. Unrelated development containers also existed on the host. Container limits were equal, but wall time is not a clean isolated speed benchmark. Do not compare these 1800-second attempts as equal-budget observations with earlier 900-second campaigns.

Preparation and post-run evaluation used **zero real model requests**. Scripted preflight, calibration, project commands, browser tests and evaluator mutations consume local compute, not Luna task requests. The three retained successful preflight legs contain 22 scripted requests; that count excludes earlier preparation debugging/corrections and is not presented as their total. Developing/evaluating Codex-agent usage is separate and not measured by this task provider ledger. No monetary estimate is invented for it.

## Three comparisons and product choice

- **P vs Hbase:** A is 2/2 vs 2/2; in B/r1 Hbase delivers while P has the merge/lint gap. Hbase's B repeat is missing, so UFO repeatability is not established. A costs more tokens under Hbase.
- **P vs Htools:** A remains tied; B/r1 favors Htools, but its second attempt stops and P's second is not_started. This does not establish a stable expanded-product advantage.
- **Hbase vs Htools:** same full deliveries in the shared completed slots. Htools adds no completeness. Its A token total is slightly below Hbase's but above P's; its B/r1 is costlier and slower than Hbase/r1. The interrupted repeat cannot identify a causal tool-package reliability effect.

All **six harness_sense calls returned not-run with engineExecuted=false**: A exceeded the 4-file/120-line scope bound, including explicit helper requests; B/r1 returned the supported small npm-project scope limitation. They ran no diagnostic commands or mutants. **Investigator calls: 0**, so there is no question/child patch/acceptance chain to credit. Authors' preexisting tests and evaluator mutations are not tool benefits. This evaluates availability of the existing tool package, not the isolated causal effect of either component.

Retain **Hbase**, with additions experimental/off. The available completed deliveries justify keeping the simpler candidate; they do not establish transfer or full repeated advantage. No runtime fix, forced investigator use, third repeat, follow-on campaign, merge or default promotion is authorized by this result.

## Reproduction and publication boundary

See [local reproduction instructions](README.md), [all patches](patches), [per-patch acceptance](reviews), and the original [preparation record](preparation.json). Published artifacts contain compact outcomes, public-source patches and evaluator contracts; full project trees, dependency trees, credentials and private sessions stay uncommitted.

The general verifier's historical `PROCESS_CONTAINMENT_UNAVAILABLE` remains a separate unresolved limit. These actual container stop checks and targeted installed/model results are not a full platform CI pass. PR #25 remains Draft on its existing base; no manual Actions, full matrix, merge, release or package publication was run.
