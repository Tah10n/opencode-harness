# Fixed-product six-task transfer pilot

Frozen product: db99470ab3517b741e0452613a9ff04f68a49bc1, materialized native
/harness-task; OpenCode 1.18.26, openai/gpt-5.6-luna low. Twelve full runs,
900 seconds each across all native stages, standard maximum two repairs,
one evidence-correction per workflow and existing format limit. No imported
D0, saved review, scripted provider, task-specific runtime rules or observer hints.

| Task | Purpose | Category | Fixed order |
|---|---|---|---|
| partial-checkout | Whole-line stock fulfillment and billing across modules | Integration | A, B |
| http-error-consumer | HTTP decode/error contract and user lookup consumer | Integration | B, A |
| transactional-settings | Isolated synchronous transactions with revision conflict | State | A, B |
| document-backup | Read-only recovery and exact previous backup preservation | State | B, A |
| dual-lookup | Callback/Promise compatibility and ordered consumer | Compatibility | A, B |
| quoted-contact-import | CSV grammar and header-based contact consumer | Compatibility | B, A |

All tasks were selected before model outcomes. None is a rerun of the original
six-task pilot. These are small synthetic repository development tasks, not
production projects or a statistical sample. No target baseline-failure count.

Each task contains identical A/B initial files, old project tests, the full visible
TASK, independent acceptance, a reference, allowed implementation alternatives,
negative preflight cases, and a frozen grading rubric. Only initial files go into
model sessions. Acceptance is injected after verified model termination. References
and preflight cases never enter author/reviewer sessions. Existing isolated native
runner, container image and transport are reused; OAuth storage is never model input.

Score behavior, original-test preservation, ordinary project tests, explicit new
tests/docs delivery, and whole-task completion separately. Tests are inspected for
actual asserted coverage; independent acceptance does not deliver requested tests.
Two state tasks also require source verification of their explicitly requested
sibling temporary file + rename: final-state tests cannot prove atomic replacement.
No reference implementation identity or exact test-name matching is a criterion.
Workflow verdicts never determine independent completion. B/D0 and B/final receive
the same frozen behavior/preservation checks; inspect test/docs differences too.
Pair win/loss/tie uses complete delivery as the primary fixed metric; report partial
behavior and delivery differences separately without selecting a new favorable metric.
Assertions within a task are not independent observations.

Preflight in the same pinned offline Node image passed original project tests for
all six tasks, reference and alternative acceptance/preservation/project suites
for all six, and rejected twelve buggy variants by executed assertion failures.
Two additional direct-write variants pass final-state tests but fail the mandatory
atomicity source criterion. Initial versions lack new requirements; these results
were recorded, not used to select tasks. The first preflight exposed an order-test
palindrome; it was replaced by a non-palindromic sequence with duplicates before
freeze or model calls. Reference source escaping was also corrected before freeze.
The original preflight output is retained locally. No post-result grader edits.

Independent read-only preflight review checked task/contract/grader alignment and
runner isolation. A minimal local runner adjustment records unavailable B delivery
as an incomplete protocol slot, never substitutes baseline code, and permits the
remaining scheduled pairs after verified termination. Provider/environment failures
still stop safely without retries or access changes. Each existing output directory
prevents a task-run repeat. Runtime bundle and earlier pilot artifacts remain frozen.

Runtime is not being revised here. A successful pre-existing exact-head CI run is
34327926899; that is model-free evidence, distinct from this pilot. No merge,
release, default change or automatic follow-up campaign is authorized.
