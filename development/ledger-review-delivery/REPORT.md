# Ledger review delivery: corrected scripted preflight stopped

**The real A → R → F pilot has not started.** The authorized development budget
amendment is implemented. The authorized corrected scripted preflight completed
its deliberately defective A draft normally, then stopped because the pilot's
patch comparison incorrectly required identical diff block ordering. R and F
remain not_started. No real provider request or real execution deadline began.

## Confirmed cause and correction

The native terminal patch emits tracked file changes followed by untracked additions;
the external collector's Git-index diff sorts all file changes together. Both saved
patches are 1347 bytes but have different SHA-256 hashes. Applying each unchanged
patch to its own ordinary Git copy produces exactly the same file bytes and modes,
including draft.txt and executable helper.sh. The intended draft test fails with
16 instead of 12 in both copies. These are equivalent draft patches, not two
different implementations.

The previous strict string comparison raised `Terminal/external full diff mismatch`.
The shared lifecycle closed admission with `execution_or_capture_error`; no next
stage ran. Native completion had exit 0, no timeout, no stop reason or parse errors,
and verified termination. The workflow's separate internal status was incomplete,
as expected for the draft's real failing test; it was not the cause of closure.

The underlying collector saved patch/task/output evidence successfully. The later
comparison assertion failed, so scheduler captureSaved is false while the underlying
collector receipt is evidence_complete. Both original patches, seven complete
request/upstream/response records, native events and tool receipts were retained
before container removal. A separate Docker inspection confirms the container is
absent. The live delivery tree manifest was not independently saved in this attempt;
post-hoc comparison establishes equality of the two captured patches, not a new
observation of the removed worktree.

The pilot-local comparison now preserves the exact native terminal bytes and
compares file/mode trees after ordinary Git application. In subsequent authorized
use it must also compare both applications with a manifest read from the actual
delivery worktree before cleanup. Reviewer snapshot comparison uses the same complete
file/mode rule rather than diff ordering. Changed content and changed executable
mode controls both fail as required. No production patch, collector, prompt or
reviewer behavior was changed. The corrected installed path is NOT RUN: the saved
closed attempt was not resumed and no replacement was sent.

## Authorization, runtime and retained history

The user approved raising only two development ceiling guards from 1800000 to
3600000 ms. Host-method bounds and stage/global arithmetic pass model-free checks;
A remains capped at 1800 s, R at 600 s, and F uses only the remaining common hour.
Actual installed F with more than 30 minutes remaining is still NOT RUN.
The initial [budget blocker](budget-blocker-REPORT.md) and receipt are preserved.

The first scripted attempt failed before harness_task because the fixture wrongly
required original-task text in parent context. The role check was fixed and verified
against its exact recorded requests. Its [failed receipt](preflight.json), closed
pause and private evidence are unchanged. The user explicitly authorized one
corrected scripted attempt and one additional final push. That corrected attempt
is the one reported here; the authorization does not admit another attempt after
its new stop.

The baseline/task/environment and author/reviewer bundles remain those already
prepared. The R configuration explicitly denies skill and all tools except
read/glob/grep, but **actual R inventory has not yet been observed**. All optional
augmentations remain excluded by the prepared author launch configuration. The
shared scheduler is unchanged. The scoped operation adapter uses its byte-identical
request lifecycle, checked against the pinned source. The only shared mutations
are the two explicitly authorized ceiling changes. Product lib/, defaults,
collector, recorder, upstream evaluator and historical model results are unchanged.

## Results and accounting

| Attempt | Native sessions | Scripted requests | Known synthetic input / output | Outcome |
| --- | ---: | ---: | ---: | --- |
| Original fixture | 1 parent; 0 author | 2 | 1 / 1; one request unknown | Parent fixture assertion; R/F not_started |
| Authorized corrected fixture | 1 parent; 1 author | 7 | 7 / 7; zero unknown | A native completion, patch-order assertion; R/F not_started |
| Total | 2 parent; 1 author | 9 | 8 / 8; one request unknown | No real pilot admission |

These are predetermined local responses, not Luna usage. Cached/reasoning usage
is not provided by the synthetic responses; no monetary amount is inferred.
The corrected attempt executed four native tool calls: harness_task, read,
apply_patch and bash. The actual bash test exited 1 for the deliberate arithmetic
defect. Its native execution took 3540 ms; the scripted deadline-to-saved-stop
interval was 4174 ms, excluding preceding container setup. This developing agent,
model-free replay and the earlier no-provider budget check are separate accounting.
Both scripted source containers and the earlier budget-check container were removed.

Real A/R/F: all not_started. Real D0, R response, delta and M: unavailable.
Real delivery_apply, assessment_integrity, contract_results and Q/T/D: unknown / NOT RUN.
Full installed three-stage preflight, false-review control, R inventory, unchanged
R→F handoff, final portable delivery and independent 23-probe assessment: NOT RUN.
No real-execution acceptance freeze or dispatch commit exists.

[Corrected-attempt receipt](preflight-corrected.json) and
[saved-patch verification](patch-integrity-verification.json) record the exact limits.
Local checks cover source identity, authorized bounds, deadline/stop arithmetic,
request replay, full saved-patch application, new files, mode preservation and
negative content/mode controls. Syntax and scoped whitespace checks pass. These do
not establish installed whole-chain success, model quality or CI. Full platform,
controller and retention matrices were not rerun.

There is no evidence of review-assisted complete delivery because the real pilot
has not started. Historical AR0/AR1, reviewer findings, missed defects, control
flaws, costs and scores remain unchanged. No further retry, review or campaign is
scheduled. Further installed preflight execution requires explicit authorization;
real admission still requires a successful full preflight and committed freeze.
