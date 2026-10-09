# Compatibility replay development v2

All twelve scheduled positions finished. **На этом development-наборе добавочная польза не показана.** Keep the probe experimental.

This compares existing D with the same D plus compatibility replay, on the same six known development tasks. It is a new rerun after a technical admission repair, not independent confirmation or a Plain comparison. V1 is separate and immutable.

[Protocol](../../PROTOCOL-v2.md), [readiness](readiness.json), [execution seal](execution-freeze.json), [technical evidence](technical.json), [full results](results.json), [historical preservation](history-preservation.json).

## Technical readiness

FAIL-before on e8f0547dd8c78c0b5d3a020f58c2498be59fa30c: the actual real prepare() accepted special receipts while full verify was missing, running, failed or interrupted (regression exit 1). PASS-after: all 17 negative cases reject with auth=0, upstream=0, participant attempts=0. Command failure, signal and timeout are separate controls. A real preparation was also rejected after executable inputs changed during verification; it produced no readiness.

The sequential launcher completed locked dependency installation, full verify, pinned verify:installed, actual container boundaries, six-task controls, native corrective delivery, both deadline controls, the full twelve-position scripted schedule and current successful CI. It atomically published readiness only after unchanged source, bundle, dependencies, toolchain and image manifests. Both real prepare() and direct runPrepared() enforce it before credentials/markers/requests. V1 and previously started campaigns cannot resume; fixture auth is always synthetic.

Repository and installed wrapper imports resolve; installed scripted candidate sessions deliver concrete mismatches and repair all six wrong patches to fresh matched snapshots. The public checks pass before those mismatches. Scripted results test wiring, not model quality. The initial new CI attempt failed because a fixture inherited CI Node 24.21.0 instead of modelling pinned 24.19.0; that fixture was corrected before any real request. A later preparation completed all checks but rejected readiness because its CI step receipt overwrote CI metadata; separate filenames and an integrated collector/step regression fixed this before the final full preparation.

Source commit: `979395caeaa947e735972b04f13289bf1378f174`. Seal commit: `9573cddad4a8ab55b52aee15f242bc0008ba509e`. Pre-run [CI 37850901417](https://github.com/Tah10n/opencode-harness/actions/runs/37850901417) completed all three required jobs and substantive steps at **2026-10-08T22:20:56Z**; first real request: **2026-10-08T22:24:28.215Z** (212.215 seconds later). Actual CI checkout commits and their source manifests are retained. The evidence-only seal commit does not change executable inputs.

## V2 measurement

| Slot / task | Arm | Initial R | Final R | Delivery | Q | Corrections | Delivered differences | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 / 01-consecutive-runs | control | true | true | true | true | 0 | 0 | completed |
| 2 / 01-consecutive-runs | candidate | true | true | true | true | 0 | 0 | completed |
| 3 / 02-grid-mirror | candidate | true | true | true | true | 0 | 0 | completed |
| 4 / 02-grid-mirror | control | true | true | true | true | 0 | 0 | completed |
| 5 / 03-required-column | control | true | true | true | true | 0 | 0 | completed |
| 6 / 03-required-column | candidate | true | true | true | true | 0 | 0 | completed |
| 7 / 04-label-suffix | candidate | true | true | true | true | 2 | 0 | completed |
| 8 / 04-label-suffix | control | true | true | true | true | 0 | 0 | completed |
| 9 / 05-packet-separator | control | true | true | true | true | 0 | 0 | completed |
| 10 / 05-packet-separator | candidate | true | true | true | true | 0 | 0 | completed |
| 11 / 06-point-offset | candidate | true | true | true | true | 0 | 0 | completed |
| 12 / 06-point-offset | control | true | true | true | true | 0 | 0 | completed |

Six pairs: **0 wins / 0 losses / 6 ties / 0 unknown**. Each complete captured patch and available D0/intermediate snapshot was independently graded after the participant stopped; grading never entered participant context. R, delivery and Q retain the precommitted definitions; unknowns are not measured pairs.

Probe activations: **8**. Concrete differences delivered: **0**. Initially failing candidate patches independently passing after delivered probe feedback: **0**. Full per-stage R, probe statuses, hashes, differences, limits and failure reasons are retained in results.json.

The candidate on `04-label-suffix` made two ordinary D corrective passes because an additional `node --test test/public.test.mjs` failure remained unresolved in its observations. Probe status was `matched` at D0, D1 and D2, and each snapshot independently passed R. These are not probe-delivered repairs. No differential signal was emitted, so no false differential signal was observed; no new independent failure followed a correction. This is limited evidence on the fixed declared corpus, not universal preservation or equivalence.

## Usage and time

| Slot | Forwarded requests | Unknown usage records | Known input tokens | Known output tokens | Task seconds |
| --- | --- | --- | --- | --- | --- |
| 1 | 15 | 0 | 130408 | 3959 | 40.735 |
| 2 | 27 | 0 | 312650 | 6724 | 77.612 |
| 3 | 17 | 0 | 167074 | 5133 | 48.498 |
| 4 | 15 | 0 | 130358 | 4051 | 41.044 |
| 5 | 19 | 0 | 198241 | 5160 | 51.628 |
| 6 | 22 | 0 | 237386 | 7012 | 72.693 |
| 7 | 28 | 0 | 473440 | 9191 | 98.546 |
| 8 | 17 | 0 | 159092 | 4266 | 48.698 |
| 9 | 21 | 0 | 219248 | 5895 | 59.875 |
| 10 | 19 | 0 | 187075 | 4383 | 52.779 |
| 11 | 14 | 0 | 115436 | 3468 | 37.899 |
| 12 | 22 | 0 | 227394 | 5575 | 67.589 |

V2: 236 forwarded requests, 236 known usage records, 0 unknown. Known tokens: input 2557802, output 64817, included cached 1055744, included reasoning 26249. Cached/reasoning are subsets. Recorded task time totals 697.596 seconds; 0 positions lack task time. Per-position preparation, grading, cleanup and probe time are in JSON. Monetary cost and final billing settlement are **unknown**.

V1 is not pooled: 2 started attempts (1 completed, 1 interrupted), 10 not_started, 57 forwarded requests, 56 known usage records, at least 835,844 input and 15,121 output tokens; one terminal/usage outcome remains unknown. Its protocol, seal, published evidence and retained private admission markers are unchanged.

## Delivery boundaries

Core, prompts, defaults, six tasks, corpus, acceptance, budgets, correction limits, pinned dependencies and stop/permission boundaries are unchanged. No inference probe, retries, substitutions, fallback or third campaign occurred. Raw requests, complete patches and evaluator artifacts remain private; 236 participant requests were checked for private judge identities, with zero matches. No Ready, merge, release, deploy or default enablement is part of this result.

Private raw evidence is retained in `local/compat-replay-v2-evidence.tar.gz` (SHA-256 `8a9f4d1d380b56f331d55688b8520ff2e09b105243b76c62e446b66c1cd77cb2`). All 4870 archived files were read back and checked against their hashes, including all twelve complete participant patches. The archive index maps the original local log/capture paths in the receipts; reproducible runtime binaries, dependency caches and images are excluded.

Final remote head and final CI are reported with the PR delivery after this evidence commit; they are not asserted completed by this file.
