# Full delivery rubric (fixed before scored outcomes)

The full original contract and required regression discriminations are in each
TASK.md and tasks.json. Those texts are the specification; controls are fallible
examples. All twelve tasks and both repetitions are retained regardless of
baseline success. No model has been run for task selection.

Q=1 requires all five dimensions:

1. New public behavior works through the supported public API and real consumers.
2. All explicitly retained contracts and existing independent regression cases
   survive; successful old tests alone cannot establish new behavior.
3. Ordinary deliverable tests cover the required TASK.md scenarios. Inspect the
   actual setup, action, synchronization and assertion. A matching test name,
   unreachable assertion, empty fixture, swallowed rejection or vacuous pass is
   insufficient. Test organization and framework idioms may differ.
4. Applicable public types, meaningful type usage/regressions and API docs are
   delivered. Generated declarations may be recreated by the normal package
   build where they are normally ignored; generated files need not be committed.
   Projects without an existing standalone type-test command may deliver a
   self-contained consumer fixture checked by the independent compiler.
5. The patch applies cleanly to the pinned public source in an ordinary checkout
   and builds/tests without harness administrative paths. No external-state
   recovery or manual author patch completion is needed for Q.

Do not require an internal field/helper, algorithm, test filename, diagnostic
text or exception subtype absent from TASK.md. Throws specified as Error are
checked without a subtype/message requirement. Explicit user requirements for
error identity remain identity checks. Do not penalize the preserved upstream
project history or the experiment's own baseline environment failures.

The included independent runtime suite is one layer. It is supplemented by
ordinary project checks, type consumer checks, patch applicability and manual
review against the frozen scenario list. Test-sensitive wrong variants verify
that the required distinction is exercised; there is no general mutation-score
threshold and no requirement to resemble a reference implementation.

D=1 additionally requires normal native completion (`step_finish: stop`, normal
process exit, no hard-deadline rescue), confirmed termination/forwarding closure,
and a normally issued applicable result. Inspect actual delivery artifacts and
final response separately from the internal status. A complete patch recovered
only by the external observer after timeout may receive Q=1, D=0. Conservative
internal incomplete alone is not enough to set either metric to zero. A report
that says success despite failed checks or misdirects the user is a separate
final-claim/handoff defect and may prevent D when usable delivery was not issued.

Started empty/failed attempts remain operational outcomes. A not_started slot
has neither model failure nor invented Q/D. Refusal/quota/unknown live local
execution/isolation violations stop scheduling; normal implementation failures
do not. An incomplete series has no confirming superiority verdict.

## Review order and categories

Assign neutral patch IDs before quality review. Hide arm names, workflow status,
provider metadata and author final text while evaluating Q. After quality grades
are saved, restore the mapping to compute D and audit author claims. Save evidence
for behavior defect, required-coverage loss, compatibility/type/documentation
loss, timeout, preparation/environment failure and inaccurate final assertions
separately. Preserve original grades and rationale if an evaluator expectation
is corrected; apply any interpretation uniformly and disclose its effect on
confirmatory status.

## Calibration and preparation incidents

All references, alternatives and seeded wrong implementations are checked before
scored execution. Original logs are retained locally; final compact calibration
records link to the controls used. Two evaluator gaps found before scored runs
were fixed: an unresolved async assertion now holds a bounded watchdog instead
of permitting an early process-0 exit; the recency scenario advances the cache
through the next generation so a missing promotion is observable. No acceptance
requirement was added by those fixes.

The initially considered mitt source was excluded before model runs because its
TypeScript 4.9 could not parse unconstrained newly resolved Node types. No package
pin was installed after automatic approval review rejected that adjustment.
Nanoevents was considered but not selected because its fixed 108-byte whole-API
size gate conflicts with the proposed API additions. Denque replaced that project
and passes its unchanged ordinary test/type commands. ms and ufo use their own
pnpm lockfiles after npm resolution proved unsuitable; ms uses its declared
pnpm 10.33.0. Installation caches are excluded from model snapshots. H00 and its
product dependencies remain byte-identical to the original materialization.
