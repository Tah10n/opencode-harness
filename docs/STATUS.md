# Project status

The maintained product is the native materializer and native runtime. Technical
implementation and model effectiveness are separate claims. Historical results
are bound to their original commits in [RESULTS](RESULTS.md); they are not a
current-head test receipt. The primary path is the two-file native
instructions/config bundle; task (direct/D) and review are experimental opt-ins.
**A sustained solution-quality improvement over Plain is not established.**

| Capability | Implementation/status | Technical evidence |
| --- | --- | --- |
| Two-file native instructions/config | Supported | `verify-native-template.mjs`: collision, symlink, settings, exact bundle |
| Read-only native review | Experimental opt-in | `verify-native-review.mjs`; installed `verify-native-review-fixture.mjs` |
| Isolated task and patch delivery (direct/D) | Experimental opt-in; effectiveness unconfirmed | `verify-native-task.mjs`; installed fixture checks actual patch application, staged index, concurrent saves, permissions, cancellation/deadline |
| Check/context/type/sensitivity/investigation feedback | Experimental, default-off where originally default-off | Retained native regression suites; no general quality claim |
| SWE-PolyBench adapter | Maintained external evaluation path | Model-free selection/export/accounting, scheduler/recorder, container boundary checks |
| Legacy core/quality/assurance/verified-change/v3 runtime | Archived, unsupported | Original commits and reports in [ARCHIVE](ARCHIVE.md); old checks no longer validate the current product |

## Publication checkpoint: Draft PR #33

The 2026-10-07 readback of [Verify run 37654162202](https://github.com/Tah10n/opencode-harness/actions/runs/37654162202)
at `e5ac7e5154ee403459fa459d31ea0eb847ecf526` found completed/failure:
Native product and model-free evaluation and Evaluation container boundary both
passed, but **Harness verification did not run** and has no job/check-run.
The actual workflow includes `required-status`, `if: always()` and dependencies
on both checks; its graph shows the unstarted gate.

The Actions summary reports **Internal server error**, correlation ID
`24f64fa1-7938-4014-9e7b-684b5c0492bc`. This confirms a GitHub Actions
infrastructure error; the underlying server cause is unknown. Available job
annotations are deprecation/migration notices and do not explain the failure.
There is no diagnostic establishing a workflow defect, runner unavailability
or account limit, so no workflow/runtime fix or manual rerun was made.

Two passed jobs do not constitute a required-gate PASS or establish project
stability. The final documentation push uses ordinary automatic CI; consult
[Draft PR #33](https://github.com/Tah10n/opencode-harness/pull/33) for its current
head, executed gate and reviews. Chat acceptance of the diagnosis is not a
qualifying approval of the PR.

The separate historical [seal deadline FAIL](../evaluation/feedback-development/evidence/calibration-run-v1/DEADLINE.md)
remains **UNRESOLVED**; no evidence links it to this server error.

## Latest quality evidence

- [v3 report](../evaluation/feedback-development/evidence/development-run-v3/REPORT.md)
  and [results.json](../evaluation/feedback-development/evidence/development-run-v3/results.json):
  direct 8/8 and D 8/8 for R/delivery/Q, zero native corrections; Plain did not participate.
- [Calibration report](../evaluation/feedback-development/evidence/calibration-run-v1/REPORT.md)
  and [results.json](../evaluation/feedback-development/evidence/calibration-run-v1/results.json):
  Plain 6/6, direct 6/6, D 5/6 for R/Q, delivery 6/6 per mode and zero native corrections.

The [diagnosis](../evaluation/feedback-development/evidence/calibration-run-v1/DIAGNOSIS.md)
places the D outbox error in its initial patch. The author test had an incorrect
expectation; no correct contract check occurred in the trajectory, and
observer/workflow did not lose the signal. Samples and versions are not pooled;
these findings establish neither equivalence nor general uselessness of D.
There is no new candidate. [CONFIRMATION_DRAFT](../evaluation/feedback-development/calibration/CONFIRMATION_DRAFT.md)
remains **NOT RUN** and does not authorize or commit to 180 attempts.

## What is usable now

The [quick start](../README.md) installs native instructions. Explicit `--task`
and `--review` add experimental commands. The chosen model remains an OpenCode
setting. The adapter exposes preparation, explicit model admission, official
evaluation and summaries; this consolidation performs no new model evaluation.

The subsequent evidence-backed-core assignment completed 18 fresh development
attempts and their official evaluation. H1 did not pass screening and was removed
from active instructions; the ordinary materializer again emits C0 core bytes.
Task/review remain experimental opt-ins. This bounded rejection and its separate
costs are in [RESULTS](RESULTS.md); no independent quality confirmation ran.

## Verification of this consolidation

The latest development closure has a [local verification receipt](../evaluation/polybench/campaigns/evidence-backed-core-development-v1/verification.json):
all 20 model-free groups passed after H1 withdrawal; installed OpenCode 1.18.26
passed 35 task scenarios with 268 scripted requests and zero real provider calls.
The source tree and preserved byte-exact candidate diff received a bounded
independent read-only semantic review. This is separate from the qualifying
GitHub approval and required CI at the actual publication head.
The [cleanup receipt](../evaluation/polybench/campaigns/evidence-backed-core-development-v1/cleanup.json)
binds verified raw evidence recovery and removal of owned disposable resources.

The following receipt describes the earlier consolidation, not this new head.

The PR and its required **Harness verification** check are the version-bound
technical receipt: [PR #25](https://github.com/Tah10n/opencode-harness/pull/25).
A check is evidence only when its job actually executes and passes at the
reviewed head. Until that happens, current-head CI is pending, not a historical
PASS. Local model-free verification on 2026-09-29 passed all 18 groups;
the installed OpenCode 1.18.26 task fixture passed 35 scenarios with 268
loopback requests and zero real provider calls. Container isolation, detached
workload termination and private capture also passed. These preliminary local
results are followed by a clean-clone run and actual CI at the PR head; consult
the linked PR for their final disposition. Full official dataset preparation
and model-backed evaluation were not run during consolidation.

The maintained `npm run verify` includes native behavior/security tests,
bundle/import/export/link checks, scheduler deadlines and unknown outcomes,
loopback recorder failures, and model-free PolyBench selection/export/accounting.
`npm run verify:installed` uses pinned OpenCode with a local scripted provider.
The container check exercises network/mount boundaries, descendant termination
and private output capture, not just a process exit code.

## Known limits and remaining effectiveness work

No sustained benchmark lift is established. Official PolyBench evidence includes
separate historical stopped and completed campaigns and the latest six-task
development rejection. Their versions and samples are not pooled. The original
pilot's 12 assigned slots remain not started; its historical model, runtime and
sample do not validate the current runtime or another model.
Native permission tests are not proof of protection from arbitrary hostile host
processes. The retired quality runtime's Linux cgroup/Windows Job Object/macOS
containment claims do not transfer to native execution.

Future effectiveness work requires a separately authorized frozen comparison,
explicit model/variant, equal public inputs, official evaluator and complete
usage/unknown-outcome reporting. Do not resume stopped campaigns or tune on old
results and describe them as independent confirmation.
