# Directed stateful coverage diagnostic

This is a fixed, intentionally seeded development diagnostic of the existing H1
instruction, not a product lift benchmark. `plan.json` selects all three projects
and six slots before model results. No plain arm is measured. No prior model
answer or reconnect patch is an input.

- **queue-lost-retry (A):** the authored compact queue test retains a vacuous retry
  fragment: success consumes its object, then expected retry IDs adapt to emptiness.
- **editor-precompleted (B):** the setup deliberately cancels a staged replacement
  before the consumer cancellation. A final absence check therefore proves nothing.
- **queue-valid-empty:** correct coverage, including a lawful empty queue with no
  send. No artificial nonempty requirement is allowed.

All production implementations initially satisfy their tasks. The tasks request
meaningful existing scenario coverage and permit necessary repairs; they neither
point to an erroneous line nor prescribe an assertion or repair method. Both arms
receive byte-identical full tasks and projects. Reference and alternative projects
are authored offline controls, never model inputs or prior model patches.

## Frozen evaluator contract basis

| Evaluated requirement | Explicit basis in each TASK.md |
|---|---|
| Successful queue send, ID/payload, removal | “successful job is sent once and removed” and preservation of ID/payload |
| Failed job returned to ready, no lease, unrelated work | “returned to ready with no lease left, while unrelated ready work is preserved” |
| Retried job can later succeed | “A later successful attempt can consume the retried job” |
| Empty results and no send | “An empty queue returns empty result arrays and must not call send” |
| Publish moves text; one boolean and action order | “processes publish and cancel actions in order and returns one boolean per action” |
| Cancel removes replacement, retains publication and other drafts | Explicit cancellation sentence |
| Absent/unknown actions preserve state | Explicit legal no-work and unknown-action sentences |
| Delivered regression exercises real entry point and meaningful transition | “meaningfully … through work” / “meaningfully through the real apply entry point” |
| Preservation, complete patch and README | Explicit final obligations in both tasks |

`evaluate.mjs` runs the delivered suite, checks public behavior independently, and
then wraps the public consumer in an external copy to disable only retry/cancel
while returning a success-shaped value. It does not require a helper name, test
layout, added precondition, exception subtype, or a reference implementation.
The disabled suite must fail for a substantive assertion, not syntax/loading.
Manual grading also inspects actual setup, entry-point calls, postconditions,
adaptive mocks, equivalent coverage, preserved independent scenarios, docs and
whether the repair is present in the final patch. Detection evidence is reported
separately from correct repair and regressions. Internal status is separate.

Run `node development/native-task-diagnostic/evaluate.mjs --preflight` to replay:
initial defective suites pass with transition disabled; repaired suites and valid
alternatives pass normally and fail with it disabled; preconditions alone still
pass despite lost transition; the valid control passes normally and its idle-only
case remains legal under disabled retry. The alternative uses a different exported
implementation form and repairs without an actual-state precondition. This is
bounded validation, not exhaustive acceptance of every possible implementation.

The existing materialized H0/H1, provider relay, deadline, permissions, native
launcher, observer and correction behavior are reused. Only the local schedule
cardinality validation is instantiated for six H0/H1 slots instead of nine P/H0/H1
slots; an exact scheduling-only diff is retained. No execution behavior is changed.
The existing scripted container preflight runs on both existing bundles without
real provider requests. Inputs, evaluators, instructions and execution dependencies
are hashed before the first model run and checked before every slot.

Previous nine-run results, frozen 2/3 and separate contract 3/3 are preserved.
This hypothesis ends with these outcomes; no automatic new wording or benchmark.
