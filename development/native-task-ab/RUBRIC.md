# Independent complete-patch rubric (frozen before primary outcomes)

The evaluator, controls, other attempts and this file are never model-visible.
The author sees only the complete task and public repository/dependencies.
Each of the 30 scheduled slots stays in the primary denominator. No replacement,
retry, best-of choice, prompt repair, internal status or cost discount changes S.

For each retained delivery, inspect the actual changed/new/deleted files from
the delivery worktree. Apply its source patch to an ordinary independent copy
of the same project snapshot with the same dependencies. Record separately:

1. Requested behavior: execute evaluation-cases.mjs runtime and consumer types.
   These are calibrated against untouched, reference, alternative and explicit
   wrong implementations. Exact exception subtype/internal helper/test names
   are not criteria. An unexpected result requires inspecting the contract and
   implementation; it is not permission to weaken an assertion for an outcome.
2. Preservation: run the project's unchanged broad npm test workflow with the
   delivered tests included; inspect deletions/modified prior assertions and
   changes to queue state, ordering, listener cleanup, task settlement and public
   types. A passing weakened suite does not establish preservation. Distinguish
   an environment failure from a demonstrated behavior failure.
3. Delivered regression coverage: inspect the assertions and their real setup
   immediately before the public transition. For the scenarios explicitly named
   in TASK.md, tests must exercise the changed public API and assert meaningful
   outcomes/invariants. Mere presence of a test file, a source-line hit, an old
   suite pass, or an implementation-shaped expected value is insufficient.
4. Types: consumers must typecheck for new/unchanged signatures. For wrapper
   controls, readonly counts must reject assignment while concurrency remains
   writable. Require meaningful delivered public type-use tests when requested.
   Do not require gratuitous declaration changes for unchanged Emittery types.
5. Documentation: inspect accurate user-facing API semantics for the requested
   change. Content must describe the actual boundary (queue versus active work,
   individual wait cancellation, duplicate identity, or atomic normal-object
   preflight); a filename or generic completion sentence does not suffice.

S=1 only when all applicable delivery requirements are established and no
material preservation regression is known. Failed/incomplete/unproven required
areas give S=0, with the reason and usable partial patch reported separately.
An operational failure is not silently relabeled a semantic rejection.

Native handoff is a separate field: terminal stop plus verified local process
termination. Record internal harness status independently. Neither upgrades S.
Compare author claims to actually observed commands and delivered behavior.

For A/B, trace native tool replies and following actions: relation found (with
provenance and source snapshot), relevant check actually run, substantive error
if any, subsequent edit/check and delivered public path. Record availability,
non-use, redundant output and cost too. A call or pass alone is not useful use.
No artificial repair is required when the initial implementation was correct.

Report per task and aggregate H11-P, H00-P, H10-H00, H01-H00, H11-H01, H11-H10,
and I = mean(S11-S10-S01+S00). Include autonomous handoff, false completion,
regressions, partial patches and requests/tokens/cached tokens/unknown usage,
wall time and preparation/evaluation cost separately. Six related npm-library
tasks support descriptive development observations only, not proven synergy.

Transfer gate: a candidate H must have positive full-delivery balance versus P,
observed useful component use and no unresolved serious regression. If multiple
qualify, select highest S; break ties by fewer false completions, then lower
median complete task wall time, then H10/H01/H11 fixed order. Freeze two new
projects/tasks and two fresh P/H pairs each before their eight runs. Otherwise
skip the reserve, retain the negative/inconclusive result and keep flags off.
