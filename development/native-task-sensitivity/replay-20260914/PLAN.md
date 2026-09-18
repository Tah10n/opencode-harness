# Addressed survivor replay: selected development comparison

Exactly four fresh task-runs maximum, no replacements, retries, real smokes,
intervention or automatic next batch. These are deliberately selected and
previously studied development inputs, not independent benchmark data.

Both use the complete original [removeWhere task](../../native-task-h00-transfer/tasks/denque-remove-where/TASK.md)
with the existing neutral instruction to verify/finish the supplied patch.
No counterexample, input label, reference, evaluator or other attempt result is
sent to the author. Public production changes stay uncommitted against the
original Git base so changed-scope diagnosis sees the supplied implementation.

- Case 1: [patch 27](../../native-task-h00-transfer/continuation-20260914/patches/27-denque-remove-where-r2-P.patch).
  Correct production, missing meaningful empty-deque callback regression and
  incomplete capacity preservation coverage. Full acceptance requires a portable
  normal-suite public API regression that rejects the standard false-to-true
  variant at `_copyArray(false)` for the required initially-present-values
  contract, plus retained/correct capacity and existing behavior coverage.
- Case 2: [patch 28](../../native-task-h00-transfer/continuation-20260914/patches/28-denque-remove-where-r2-H00.patch).
  Correct usable control. Preserve useful tests, order, callback arguments,
  same-error atomicity, wrapped/falsy/duplicate/identity/capacity behavior,
  types and docs. Unspecified error-message differences need no new assertion.

Predeclared order: case 1 S0, case 1 S1, case 2 S1, case 2 S0.
S0 is direct with the existing sensitivity runtime from a9155778; S1 is the
same direct with addressed replay and its usage instruction. Both expose
harness_sense, A/B off. This is not H0 without sensitivity. Both run one native
author session with OpenCode 1.18.26, openai/gpt-5.6-luna, high, 900 seconds total
and the existing shared 180-second diagnostic allowance inside it. A frozen
bundle for each arm is mounted read-only in the same existing container image.
Only the three sensitivity runtime files differ between bundles; the external
launcher is common, retaining the corrected a9155778 transport/stop policy.
The launcher gains only bounded four-slot schedule admission and arm mapping.

Before provider admission: targeted checks, installed scripted provider delivery
on a small module and known denque example, container cancellation, one diff
review and whitespace check. Capture input bytes/modes, full tasks, seed patches,
bundle manifests, execution code and preflight evidence under an immutable
freeze. Existing historical pauses stay untouched. Unknown submission,
authorization/quota refusal or unverified execution closes further admission.

After each author stops, preserve its patch and independently report Q (complete
correct applicable patch), D (normal autonomous terminal handoff), required
regression delivery/sensitivity, control preservation, chronological diagnostic
→ test → replay chain, native elapsed time and provider request usage. Existing
independent public behavior checks run only outside author containers. A test
written before diagnosis earns no diagnostic credit; evaluator-only sensitivity
is not an author action. Capture interrupted patches separately from handoff.

Practical-help evidence requires an additional complete correct autonomous S1
delivery relative to S0, an observed useful chain, and no new control regression.
A tie or loss retains the original criteria and ends this batch. Even a positive
result is a small development signal, not sustained product lift over OpenCode.
Count internal provider requests independently from four task-runs. Missing
usage is unknown, cache/reasoning are subsets, diagnostic time is within task
time; preparation/evaluator/developer costs remain separate. No monetary estimate.
No historical recomputation, manual Actions, full platform matrix, merge,
release, package publication or default change.
