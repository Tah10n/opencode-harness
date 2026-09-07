# Verified-change 0.2.0: bounded repair follows trusted expectations

This is the next product version after reviewed head
`11b1095337667ac4b247c8e57617be0ad56b9a12`, in the same draft PR #23. It fixes
known harmful repair decisions. It is not a new harness, candidate family,
benchmark, evaluation campaign, release, or default profile.

The historical 60-task study and its negative result are unchanged. Its frozen
manifest, grader, results, saved patches and journals remain historical evidence.
No historical task is rescored. See the [original report](verified-change-results.md)
and [original delivery record](verified-change-status.md).

## Repair authority

The controller now explicitly records three sources:

| Source | How it is established | Automatic repair |
| --- | --- | --- |
| `existing_project_check` | Existing committed project configuration | Reproduced assertion failures, at most two repairs |
| `independently_validated_acceptance` | Explicit project-owner expected-result confirmation in configuration, bound to SHA-256 of each protected test file | Reproduced assertion failures, at most two repairs |
| `generated_hypothesis` | Any acceptance-author output | Never on its own |

An exact quote, `confidence="unambiguous"`, a claimed source, another model's
paraphrase or an empty `disputed` response cannot promote a generated hypothesis.
The implemented confirmation path is owner review of the actual expected result
and exact test bytes, using the existing project configuration and protected
files. Explicit task input/output examples or a trusted operation's reference API
may inform that review; the product does not automatically infer confirmation
from prose or introduce signing/reviewer infrastructure.

Generated tests still execute and their failing examples, assertions and
explanations are preserved. Their ordinary assertion/runtime failures cannot
block an otherwise passing D0 alone. They do not enter repair prompts or the
primary session's pre-repair context. The existing diagnostic assessment runs
after the repair decision is complete, so a correct dispute remains useful but
cannot grant new authority. An invalid dispute stays diagnostic.

The report separates `passedProjectChecks`, owner-confirmed acceptance, and
`unresolvedHypotheses`. Even a passing generated test has an unconfirmed expected
result. `checks_passed` reports trusted checks only; `semanticCorrectness` remains
`unproven`. D0 preservation is not a semantic-correctness claim.

## Ordinary product regressions

Development copies of the saved source patches and generated tests live under
`product/verified-change/test/fixtures/known-repairs/`. They contain public source,
public checks, literal cited clauses, exact D0/D1 patch bytes and saved assessment
decisions. They do not include hidden graders, scores, private runtime paths,
provider traces, credentials or statistical gates. Tests execute those copied
assertions and replay saved session decisions without a provider request.

| Case | False generated expectation / real requirement | Controller decision and selected patch |
| --- | --- | --- |
| Language fallback | An inherited locale incorrectly required returning the original key instead of continuing valid fallback | Diagnostic failure; no repair; exact saved D0 retained; fallback reaches `en` and returns `base` |
| Recursive expansion | `${REF}` incorrectly required raw `${VALUE}` after reference resolution | Diagnostic failure; no repair; exact D0 retained; resolved chain returns `x=y/end`, not `${C}/end` |
| Prerelease parsing | `alpha.1-x9` incorrectly split into `alpha`, `1`, `x9` | Diagnostic failure; no repair; exact D0 retained; `1-x9` stays one identifier |
| Prerelease comparison | Incorrect lowercase-before-uppercase order induced an asymmetric comparator | Diagnostic failure; no repair; same D0 retained; ASCII order and antisymmetry verified |
| UTF-16 offsets | Incorrect `XABc` expected after an edit starting at code-unit offset 1 | Saved correct dispute retained; no repair; exact D0 returns `\ud83dXABc` |
| Trusted project failure | Existing assertion requires exported value `2`, while draft exports `0` | Failure reproduced; one repair; D1 patch exports `2` and passes the real check |

For the first three scenarios, tests also apply the saved harmful D1 separately
and verify it breaks the concrete behavior. This validates the counterexample
without changing its historical score. The prerelease scenario has separate
parsing, ordering and antisymmetry assertions. The installed-package test reruns
these controller/patch/behavior regressions through the installed modules.

## Cleanup

Each sandbox invocation has an idempotent cleanup transaction, independent of the
cancelled task signal. It retains exact container name and observed full ID,
rm and inspect/list command results, exit/signal/timeout information, bounded
stderr and observations before/after cleanup. Precise already-missing responses
with immediate verified absence handle normal auto-remove races.

Daemon errors, interrupted commands, timeouts, truncated observations or residual
containers remain `SANDBOX_CLEANUP_UNVERIFIED`, even when a subsequent inventory
is empty. The transaction retains its original refusal for repeat/concurrent
callers. Errors are serialized in the run's `error.json`; a plugin error also
leaves a private session receipt so OpenCode cannot hide it as a recoverable tool
error before an empty host census. No model task is rerun for cleanup.

Installed CLI fault-injection tests cover both host verification and plugin
cleanup refusal. They assert no application to the original worktree; the host
verification case also retains the saved D0 patch. Normal installed tests still
exercise real timeout/cancellation cleanup of detached descendants.

## Validation and limits

Run from `product/verified-change`:

```sh
VERIFIED_CHANGE_DOCKER_TEST=1 VERIFIED_CHANGE_OPENCODE_TEST=1 npm test
```

Final local validation on 2026-09-07 passed **83/83 tests, zero skips**, in
209.86 seconds: 60 deterministic product tests, 22 installed OpenCode CLI
scenarios and one installed Docker/package test (which also reruns the five
recorded/project-repair regressions against installed modules). The first
sandboxed attempt hit an existing filesystem-watch `EMFILE` restriction; the
final native run passed that test without changing its expectations.

All provider-like traffic in these tests goes to a localhost scripted fixture.
**New model calls = 0.** No official runner or grader is invoked. The existing CI
workflow also runs the ordinary product regression suite; installed Docker and
OpenCode coverage is checked locally and reported separately.

One independent diff review found that missing/malformed assessment output could
still block a checked D0. The bounded remediation makes response-file failures
diagnostic and validates dispute entries; regression cases retain D0 for missing,
malformed and null-entry responses while cleanup, source mutation and cancellation
remain fatal.

These tests establish that the listed known defects are prevented in the
reproducible scenarios. They do not establish general model accuracy, quality
lift, or superiority over additional compute. The package remains experimental.

See [installation, confirmation format and report semantics](../product/verified-change/README.md).
No merge, release or default switch is performed.
