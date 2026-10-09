# Compatibility replay development v1

This is a six-task development comparison of existing D against the same D
with one experimental differential observation. It tests the incremental probe,
not the harness against Plain. The tasks were created for this mechanism and
are known development tasks, not independent confirmation.

Start: `4817ec065b899775ace86708f84819209b518870` (current origin/main,
2026-10-08). PR #35 is complete; its historical results are not revised.

## Fixed assignments and execution

Each of the six committed tasks gets exactly one control and one candidate:

| Task | Kind | Order |
| --- | --- | --- |
| 01 consecutive runs | Refactor | control, candidate |
| 02 grid mirror | Refactor | candidate, control |
| 03 required column | Refactor | control, candidate |
| 04 label suffix | Compatible extension | candidate, control |
| 05 packet separator | Compatible extension | control, candidate |
| 06 point offset | Compatible extension | candidate, control |

Both use `openai/gpt-5.6-luna`, variant `high`, OpenCode **1.18.26**,
Node **24.19.0**, the same pinned toolchain and installed bundle. The native
strategy is D in both arms. Existing author/correction prompts, three-correction
maximum and ordinary diagnostic defaults are unchanged. The only arm-specific
setting is `COMPAT_REPLAY_PROBE=0/1`, understood by an evaluation-only wrapper.
The primary two-file installation does not include it.

The outer deadline is **600 seconds per attempt**, including startup, native
calls, public checks, probe and corrections. Probe workers use at most three
seconds each, always capped by the remaining shared deadline. Input preparation,
independent scoring and cleanup are timed separately. No retries, substitutions,
extra author help, fallback provider, new tasks or confirmation campaign.

The shared scheduler handles request admission, relay, capture, usage, workload
stop and cleanup. A separate experiment-kind validates exactly these twelve
slots; historical schedules and manifests retain their existing gates. The
canonical batch is `local/compat-replay-20261008/batch`. Before the first real
request, source/protocol are committed, then `evidence/execution-freeze.json`
is committed byte-for-byte from the preparation. It binds task, corpus, judge,
reference controls, runtime, source commit, actual bundle/dependencies, binary,
container image and gate receipts. Admission rechecks the hashes and committed
seal before reading authorization or sending a request. Existing admission/slot
markers forbid replay. A technical admission failure ends the campaign; runner
changes cannot resume it under that seal.

Only the already configured OpenCode OAuth connection is used. Readiness uses
the existing no-inference auth path. Every slot has a new offline container,
fresh public Git history and native session. It cannot see another slot or the
private judge. Both arms receive identical source, task, preservation declaration
and corpus. Both may read their read-only baseline or make their own checks.
Gold/wrong patches, independent acceptance tests and evaluator outputs are never
mounted for participants or the probe. Independent grading occurs only after
the participant has stopped.

## Gate before inference

All six baseline/self checks must match; all six gold patches must match the
preserved corpus and independently pass; all six wrong patches must pass the
ordinary public suite, have no existing actionable failure on that state, fail
independent grading and produce a specific new differential observation.
New behavior is outside the preservation corpus and is separately accepted.
Unsupported values, unstable execution, launch/module failure, timeout and
baseline/corpus tampering must not produce semantic correction signals.

Actual installed scripted sessions must demonstrate control with no correction,
candidate with concrete mismatch delivery, one successful correction and a
fresh matched snapshot. Both stop controls must terminate and remove their
containers with zero live provider handlers. Container network/mount boundaries
must pass. Scripted receipts are technical evidence, never model outcomes.
If this gate fails, no model calls are allowed and the candidate is rejected.

## Independent measures and interpretation

Apply the complete delivered patch to a fresh baseline and use the existing
independent evaluator, native node:test event reporter and proof admission.
Grade D0 and final patches only after the author stops; do not return judge
results to it. Keep `R` (requirements plus preservation), `delivery` (normal
native/provider completion, applicable full patch, termination and cleanup),
and `Q = R AND delivery` separate. Incomplete grading/completion remains unknown.
A completed FAIL remains measurable; missing evidence is not a win or loss.

Report initial/final R, corrective passes, concrete mismatches actually delivered,
regressions fixed, false signals and new failures after corrections. Preserve
request counts, input/output/cached/reasoning tokens and unknown usage, elapsed
and probe time, timeout/cancellation/unknown/not-started slots. Cached/reasoning
tokens are subsets; money is unknown without reliable billing data.

For the six pairs, count candidate Q wins/losses/ties only if both outcomes have
proven evaluation and Boolean R/Q; otherwise unknown. Assertions are not separate
tasks. Do not pool old campaigns or infer equivalence from ties.

- No additional fixes, or no delivered probe: benefit not shown; remain experimental.
- False signals, degradation or isolation violations: not ready for promotion.
- Reproducible additional fixes without observed degradation: promising development
  signal only; no proven advantage over Plain or justification for default enablement.

After one run and report, stop. No Ready, merge, release, tag, deploy or automatic
follow-on candidate is authorized.
