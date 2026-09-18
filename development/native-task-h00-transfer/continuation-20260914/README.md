# P/H00 transfer comparison: launcher amendment and external stop

The authorized continuation reached **42 of the original 48 attempts**: 18 historical
attempts plus 24 new attempts. Slots 43–48 never started. At slot 42, the upstream
provider sent `server_error` without a bound terminal response event or usage;
the transport subsequently aborted before the task deadline. The existing stop
rule paused scheduling. No request was retried and no further continuation was
attempted. This is a concrete external block under the granted authority.

Among the 42 started attempts, P delivered Q=D=7/21 and H00 Q=D=8/21. These are
descriptive rates from an incomplete series with an explicit launcher amendment.
They establish neither a stable quality/autonomous-delivery advantage nor equality.
The planned full-series estimate, project-block interval and sign-flip statistic
remain unavailable.

## What was measured and preserved

H00 remains public source `1cebebb082163250a0f78269acc164edfc3c6268`, direct,
A=0/B=0. Both arms used OpenCode 1.18.26, `openai/gpt-5.6-luna`, high effort and a
900-second common task deadline. The original tasks, order, account, endpoint,
permissions, source/dependency snapshots and retained Linux arm64 image were kept.
Reviewer, selector, finisher and extra author phases were not enabled.

The [pre-call amendment](../amendment-20260914/AMENDMENT.md) was published at
`867e7d1ed40c7ec4f794c469a0c72ed705d36292` before the first new provider request.
It changed only the admitted external launcher and directly related verification.
A parsed, request-bound upstream terminal state and known usage now survive a
later AbortError. Request state, transport/client delivery and native completion
remain separate. Unknown binding, conflicting events, auth/quota denial and
unverified local stop still prevent new slots. Failed/incomplete responses are
known states, not task success. There is no paid retry or recovery phase.

The [original report](../README.md) at publication
`2a3fc3098998f6eef7ad648ded0b09a55b760233` is unchanged. All 1,444 historical artifacts,
7,724 frozen file entries, original pause and all 18 historical run directories
passed [preservation verification](preservation-check.json), with only the three
explicitly admitted launcher file versions excepted. Slots 9 and 18 remain Q=D=0.
This directory contains the continuation report, not a replacement freeze or epoch.

## Results by period

Q requires public behavior, preserved contracts, the original mandatory test
scenarios, applicable types/docs and an applicable ordinary-source patch. D also
requires normal native stop/exit, verified termination and usable issued delivery.
All observed Q and D happen to coincide; they were checked separately.

| Period | P Q / D | H00 Q / D | Normal native completion P / H00 |
| --- | --- | --- | --- |
| Before amendment, slots 1–18 | 3/9 / 3/9 | 4/9 / 4/9 | 8/9 / 8/9 |
| After amendment, slots 19–42 | 4/12 / 4/12 | 4/12 / 4/12 | 11/12 / 9/12 |
| Combined started only | 7/21 / 7/21 | 8/21 / 8/21 | 19/21 / 17/21 |
| Not started, slots 43–48 | 3 without Q/D | 3 without Q/D | Not observed |

The periods contain different tasks and repetitions. Their differences cannot
identify a causal effect of the launcher change. The amendment can affect
operational stopping frequency even though the author/task inputs are unchanged.

[All 48 slots](SLOTS.md), [both repetitions and task means](PAIRS.md), and
[machine-readable results](results.json) preserve every started failure and every
unstarted slot. In repetition 1, H00 has 3 wins / 3 losses / 6 ties against P;
in the nine observed repetition-2 pairs, 2 wins / 1 loss / 6 ties, with 3 pairs
unobserved. These counts apply to both Q and D.

Two-repetition means are available for nine tasks only. The frozen analysis needs
all 12 task means, six whole-project blocks and all 46,656 ordered block draws,
using its fixed floor/ceil percentile endpoints and descriptive project sign flip.
No subset interval, imputation, best-repetition selection or alternative analysis
was substituted. Even a completed six-project interval would have limited precision
and would not remove the disclosed calibration and assessment limitations.

## Operational stop and launcher evidence

The corrected launcher preserved `response.completed` and usage at new slot 22
request 10 despite a late AbortError. That slot still has empty delivery, native
exit 137 and Q=D=0. Scheduling continued only after verified local stop and closure.
This is operational evidence for the amendment, not a rescued Luna success.

At slot 42 request 6, actual upstream SSE contains created, in_progress, nine
keepalives and one top-level `error` with type/code `server_error`. There is no
`response.completed`, `response.failed` or `response.incomplete`, and no usage.
All retained events parse; the error is not a bound terminal lifecycle response.
Request 5's completion does not prove request 6 completed. The later AbortError
was not caused by the common task deadline; its precise initiating component is
not separately established. [Compact evidence](external-block.json) includes raw
stream hash, timestamps and stop facts, without publishing private session traces.

Local termination, capture, forwarding closure and relay removal are verified;
active provider handlers are zero. The remote request's terminal state remains
unknown. The single authorized amendment does not authorize another protocol
change or bypass of this new pause. Slots 43–48 were not called.

## What prevented full deliveries

The 24 new attempts contain eight complete Q=1 patches, four empty deliveries and
twelve nonempty Q=0 patches. Failures overlap: ten missing mandatory test
discriminations, two wrong README examples, two missing type-consumer fixtures,
one public type defect and one reentrant callback behavior defect. The
[per-patch assessments](evaluations/) distinguish these categories and preserve
scenario-by-scenario review and exact source hashes.

All 24 ordinary project checks pass, including the four unchanged baselines.
The original independent runtime layer passes 17/24. Applying only the disclosed
callback-order and empty-value interpretations gives 20/24; that still does not
establish full Q. Nine actual new H00 terminal patches apply cleanly in ordinary
Git copies and deliver the same source bytes/modes as the assessed captures.

All nine normally completed new H00 workflows retain internal `incomplete` and
contradict their listed successful project commands with a claim that no relevant
project check was observed. These are separate report defects. They do not erase
usable issued patches or automatically force D=0. Eventemitter's delivered
standalone consumer fixture can satisfy the rubric through the independent
compiler even when the author could not run that compiler.

## Interpretation, calibration and reproducibility limits

The existing prune callback-order interpretation is applied uniformly. A new
appendQuery interpretation accepts either `x` or `x=` for an appended empty value;
the task does not choose between these equivalent encodings. Raw evaluator exits
remain recorded and the patch's Q=0 is based on a separate mandatory test gap.
The suspected parseCompound trailing-newline defect was refuted on both authors
and both controls by the compiled public API.

The original denque identity-calibration gap remains. New supplemental checks
also show that both reference/alternative controls miss typed removal of the
normalized emitter context and a subscription created inside reentrant `drain`.
Those checks were applied to all affected observed patches, including historical
ones in new disposable copies. Historical grades and artifacts were not revised;
new findings are disclosed separately. Controls are fallible examples, not a full
acceptance oracle. See [evaluation procedure and outcomes](EVALUATION.md).

Q was checkpointed before reading the new arm mapping and author final narratives.
The same assessor also monitored the schedule, so neutral IDs provide best-effort
separation, not independent double blinding. Order and content clues could reveal
arms. Post-start diagnoses and interpretations weaken confirmatory claims.

The common image is the verified retained local image, not an asserted
byte-identical rebuild from unpinned image layers or a verified public image pull.
H00 public source/locked npm installation is a separate reproduction path. Local
Linux/host checks are not CI, production, or evidence of a model quality advantage.

## Costs and artifacts

| Provider period | Requests | Known usage requests | Known total tokens | Unknown usage requests |
| --- | ---: | ---: | ---: | ---: |
| Historical | 405 | 404 | 13,156,512 | 1 |
| Continuation | 533 | 532 | 18,322,731 | 1 |
| Combined | 938 | 936 | 31,479,243 | 2 |

Known usage is 30,984,489 input and 494,754 output tokens. Cached tokens are already
inside input; reasoning tokens are inside output. P has 447 requests and two
unknown-usage requests; H00 has 491 requests with known usage. Unknown is never
zero. OAuth metadata supplies no reliable monetary charge.

[Costs](costs.json) separate the unchanged historical costs, amendment fixtures,
89 post-execution model-free project checks (398,414 ms summed check duration),
host type/application checks and the current Codex goal tracker checkpoint.
[Per-request accounting](provider-accounting.json) accounts for all 938 forwarded
requests without response IDs, credentials or content. Results record per-slot
time, tools and sessions. Total native tool calls are P 986 / H00 923; session
counts P 22 / H00 42. Early stops and setup differences preclude a speed conclusion.
Summed durations and tracker values are not a monetary invoice or a complete
wall-clock resource meter.

The source patches, nine issued terminal patches, compact checks, assessment
checkpoint and exact supplemental diagnostic source are public here. Private raw
provider traces, credentials, complete project trees and local runtime state are
not publication artifacts. No new campaign, sample enlargement, paid replay,
manual Actions, merge, release, package publication or default change is performed.
