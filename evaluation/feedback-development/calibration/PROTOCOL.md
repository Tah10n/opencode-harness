# Plain / direct / D calibration

This is a new six-task calibration, authorized by the user's 2026-10-07 goal.
The eight tasks in `../tasks` remain regression controls. v1/v2/v3 public and
private evidence is historical; it is excluded from these estimates.

The purpose is to measure available headroom relative to ordinary OpenCode,
the direct/Plain contrast, and whether D activates and changes the initial
patch's independently evaluated result. This is not product development or
independent confirmation. No outcome authorizes changes to runtime, core,
model, prompts, D, criteria, thresholds or tasks.

## Frozen assignments and parity

| Task | Family | Order |
| --- | --- | --- |
| c01-catalog-batch | Coordinated files: atomic catalog command and filtered exports | P, H0, H1 |
| c02-durable-outbox | Async durable state: dispatch, overlap, retry and close | H0, H1, P |
| c03-generation-cache | Async state: generations, subscriber cancellation and invalidation | H1, P, H0 |
| c04-stream-import | Compatibility: incremental UTF-8 import, old API and real CLI | P, H1, H0 |
| c05-plugin-sdk | Compatibility: CJS/ESM, alias transactions and mixed settlement | H1, H0, P |
| c06-dag-refactor | Refactoring: shared resource packing and async wave execution | H0, P, H1 |

Exactly one attempt per task/mode, 18 slots, sequential. All six permutations
occur once. Each mode occupies each within-task position twice and precedes
each other mode in three tasks. No retry, replacement, automatic resume,
availability probe, additional reviewer or model substitution is permitted.

All modes use OpenCode 1.18.26, openai/gpt-5.6-luna, high, Node 24.19.0,
the same immutable offline image, native permissions, public source bytes and
600,000 ms external work budget. Input copying is accounted separately and
excluded equally. Auth, native startup, title requests, all author/child work
and D corrections use that shared work budget. There is no additional D time.
Tokens and request count are observed costs, not extra mode-specific limits.
The original task text is unchanged across modes, supplied as ordinary user
input for P and as the same TASK.md for H0/H1.

P uses ordinary build with all its native tools, including native task/todo/
skill capabilities. Its dependency mount contains only the identical pinned
dependency files and rg, with no core, plugin, commands or harness context.
H0/H1 share the unchanged materialized core/task bundle; their only product
difference is HARNESS_TASK_STRATEGY=direct versus D. All existing optional
harness interventions are disabled. No private evaluator, gold, wrong patch,
other task, harness Git history or prior run is mounted in the author container.

## Contracts and grading

Each task contains a complete public TASK.md, functioning npm test command,
several connected source files, independent acceptance with stable fd09..fd14
obligation IDs, gold.patch and a substantive wrong.patch. Obligations use fixed
expected values, never production output as an oracle. The existing evaluator
and native node:test reporter are reused unchanged for acceptance scoring.
Before inference, baseline must fail feature acceptance while preserving old
contracts, gold must pass acceptance and public checks, and the negative
control must fail acceptance. No author results inform these controls.

Apply the entire delivered patch, including author tests, to a clean baseline
in an independent offline container. Never edit/reduce a patch before grading.
R is proven independent correctness; delivery is autonomous complete delivery;
Q = R AND delivery. Unknown evaluator completion or unverified containment,
termination, provenance or cleanup is unproven, not a measured loss or win.

All modes require known provider terminal responses and forwarding, normal
native completion, a matching terminal assistant message, applicable full patch
with roundtrip snapshot proof, no pending native tools, verified workload stop
and complete container removal. P proves those facts from its ordinary native
session and `/work/repo` capture. It does not need .git/harness-task, a child
author, workflow stages or harness-specific result artifacts. H0/H1 retain
their existing isolated-author completion requirements.

## Predeclared analysis

Report every slot, including not_started, failures and unknowns. For each mode,
show R, delivery, Q, elapsed time, provider requests, observed input/output,
cached/reasoning subsets and unknown usage. Monetary charge remains unknown.

1. Headroom: count proven P failures out of six and the unmet public obligations.
   Six P successes indicate an observed ceiling on this set; failures show
   measured room, not automatic evidence that a harness can exploit it.
2. Direct versus Plain: task-matched H0/P wins, losses, ties, unknown pairs and
   Q delta. Also show R separately. Admit a pair only if both rows have proven
   evaluation and boolean R/Q. Six one-shot tasks support descriptive findings
   only; no significance, superiority or equivalence claim is planned.
3. D: retain real correction count/reasons, D0.patch and final patch. Grade D0
   independently under the same frozen acceptance when its bytes differ. If
   identical, reuse the proven grading of those exact bytes. Report activation,
   changed patches, initial/final R, improvements, regressions and unknowns,
   alongside H1/H0 and H1/P matched contrasts. An inactive D means correction
   benefit/harm was not measured; create no artificial correction reasons.

## Admission and stop

Commit tasks, this protocol, confirmation draft, adapter and content manifest
first. Then prepare contained baseline/gold/wrong receipts, exact-model scripted
P/H0/H1 frames (including a real D correction) and all three deadline controls.
Commit the public execution seal with exact source, evaluator, bundle/input,
toolchain/image and receipt hashes before reading auth for model admission.
The existing recorder, scheduler, process watchdog, capture and replay refusal
remain in force. A provider refusal, unknown submission, evidence failure or
unverified termination closes future slot admission. Never relax stop checks.

Investigate the prior seal CI deadline failure separately with bounded
model-free evidence. A reproduced blocking completion problem forbids inference.
A subsequent green check alone does not establish randomness or explain the
historical root cause; retain any unresolved attribution explicitly.

After one calibration pass, publish compact results and retain private patches/
recordings without credentials. Verify evidence before removing only owned
containers, assets, dependency/build caches and temporary files. Stop. The
180-slot confirmation is a draft and is not authorized by this calibration.
