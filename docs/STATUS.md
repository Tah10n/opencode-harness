# Project status

The primary product is the two-file native instructions/config materializer.
Task delivery (direct/D/check-first), diagnostic review and additional diagnostics
are experimental opt-ins. Technical verification and model effectiveness are
separate claims. **A sustained solution-quality improvement over Plain is not
established.** Use [native usage](USAGE.md) for installation and result handling;
[RESULTS](RESULTS.md) retains the separate historical samples.

## Current source checkpoint

Read back on **2026-10-08**: the source `main` checkpoint is
`a14c2887e57d08f0ccc4837833e6eec0f8ecabd7`.
[Verify run 37761201673](https://github.com/Tah10n/opencode-harness/actions/runs/37761201673)
for that exact push SHA is completed/success. All three jobs actually executed:

| Job | Result | Scope at this SHA |
| --- | --- | --- |
| [Native product and model-free evaluation](https://github.com/Tah10n/opencode-harness/actions/runs/37761201673/job/113257759082) | PASS | `npm run verify`, pinned OpenCode 1.18.26 installed local-provider fixtures, installed large-Git task fixture on Linux x64 |
| [Evaluation container boundary](https://github.com/Tah10n/opencode-harness/actions/runs/37761201673/job/113257758188) | PASS | Actual Linux arm64 container isolation/private capture, large input and scripted feedback-development fixtures |
| [Harness verification](https://github.com/Tah10n/opencode-harness/actions/runs/37761201673/job/113264319947) | PASS | Required gate after both jobs passed |

This is a verified source checkpoint, not a receipt for subsequent changes.
Final Draft PR head/merge-ref CI is reported in that PR after publication;
pending/skipped/unstarted jobs do not count as PASS. No future CI result for
this documentation commit is asserted here.

## Maintained surface

| Capability | Status | Deterministic/technical checks |
| --- | --- | --- |
| Two-file native instructions/config | Supported primary path | `verify-native-template.mjs`, installed config merging/upgrade fixtures |
| Task/patch delivery and result presentation | Experimental opt-in | `verify-native-task.mjs` includes execution/interpretation, correction and bounded-result regressions; installed task fixtures exercise actual patch/index handling, concurrent saves, permissions, cancellation/deadline |
| Read-only native review | Experimental opt-in | `verify-native-review.mjs`, installed snapshot/path/permission fixture |
| Context/check/type/sensitivity/investigation feedback | Experimental; existing defaults unchanged | Retained native regression suites; specialized JS/TS/npm routes, no general quality claim |
| SWE-PolyBench and feedback-development readers/adapter | Maintained external evaluation infrastructure | Model-free admission, selection/export/accounting, scheduler/recorder and actual container checks; separate real-run authorization |
| Legacy profile/quality/assurance/verified-change/v3 runtime | Archived, unsupported | Original source commits and reports in [ARCHIVE](ARCHIVE.md); historical checks do not validate the current product |

`npm run verify` covers retained native behavior/boundaries, imports/exports,
bundle/link checks, large Git inventories, scheduler deadlines/unknown outcomes,
recording failures and model-free evaluator controls. `npm run verify:installed`
uses pinned OpenCode 1.18.26 and local scripted providers with isolated HOME/XDG
settings. Container checks exercise actual network/mount restrictions, descendant
termination, private output capture and input completeness. None of these checks
establish model quality or protection from arbitrary hostile native host code.

Exported legacy review/format/evidence helpers in `native-task-workflow.mjs`
remain for module compatibility; `check-first` still has a strategy entry point
and regressions. Optional diagnostic modules remain reachable through the
materializer, dynamic imports and their explicit flags. Absence from the current
D path or lack of demonstrated effectiveness is not a deletion criterion.
The only cleanup removes the private, uncalled `reviewInput` helper; exported
legacy format conversion and evidence-preservation regressions remain.

## Historical incidents and research checkpoints

### Publication checkpoint: Draft PR #33

The 2026-10-07 readback of
[Verify run 37654162202](https://github.com/Tah10n/opencode-harness/actions/runs/37654162202)
at `e5ac7e5154ee403459fa459d31ea0eb847ecf526` found completed/failure: native and
container jobs passed, but `Harness verification` never started and had no
job/check-run. The Actions summary reported **Internal server error**,
correlation ID `24f64fa1-7938-4014-9e7b-684b5c0492bc`. The underlying server cause
remains unknown; no evidence established a workflow defect, runner unavailability
or account limit, and no workflow/runtime workaround or manual rerun was made.
This historical failure is separate from the current source checkpoint above.
Chat acceptance of a diagnosis does not replace a qualifying GitHub approval.

The separate [seal deadline FAIL](../evaluation/feedback-development/evidence/calibration-run-v1/DEADLINE.md)
remains **UNRESOLVED**. Its original `Termination not verified` and subsequent
missing-`result.json` ENOENT are retained. Later model-free stop controls and green
CI do not explain the historical failure or prove universal deadline reliability;
no evidence links it to the Actions server error.

### Research evidence

- [v3 report](../evaluation/feedback-development/evidence/development-run-v3/REPORT.md):
  direct and D each 8/8 for independent R/delivery/Q; Plain did not participate.
- [Calibration report](../evaluation/feedback-development/evidence/calibration-run-v1/REPORT.md):
  Plain/direct 6/6 and D 5/6 for R/Q; delivery 6/6 per mode. The
  [diagnosis](../evaluation/feedback-development/evidence/calibration-run-v1/DIAGNOSIS.md)
  places the outbox error in D's initial patch with an incorrect author expectation.
  No correct contract check occurred in that trajectory; observer/workflow did
  not lose the signal.
- The [core development candidate](../evaluation/polybench/campaigns/evidence-backed-core-development-v1/REPORT.md)
  was rejected and removed from active instructions. Its diff, official outcomes,
  unknown costs and separate historical campaigns remain in [RESULTS](RESULTS.md),
  including the [TAP identity limitation](../evaluation/polybench/TAP_IDENTITY.md).

Native corrections were zero in v3 and calibration; correction benefit/harm was
not measured. Samples/versions are not pooled and do not establish equivalence,
superiority or general uselessness of D. There is no new candidate.
[CONFIRMATION_DRAFT](../evaluation/feedback-development/calibration/CONFIRMATION_DRAFT.md)
remains **NOT RUN** and authorizes no attempts. Frozen results, hashes, receipts
and historical reports are retained unchanged; current structural verification
is not a new research outcome.
