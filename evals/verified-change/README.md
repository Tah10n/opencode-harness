# Verified-change evaluation preparation

**Not frozen. No final model outcome has been observed.** The eventual single
60-task evaluation is specified in PROTOCOL.md. It is separate from development.

All 60 tasks in 20 families have been authored and validated. Each family has
one public reproducer, one uncovered requirement and one multi-file obligation:
route table, window quota, catalog, dependency graph, leases, text edits, chunk
upload, decimal ledger, calendar windows, archive planning, JSON lines, JSON
pointer, metric series, order state, byte ranges, CSV tables, package versions,
search index, due jobs and env configuration.

Every task has ordinary public source/tests, a hidden behavioral grader, a
reference and a separately implemented alternative. The alternatives were written
separately, not by wrapping the reference; this does not imply separate human
authors. All 60 were checked through the exact installed product Docker/check
modules. Appropriate invalid baselines fail; both solutions pass public/hidden
checks and source scope. fixture-validation.json records the current definition
hashes and observed statuses. Raw check records remain private. This is fixture
validation, not model evaluation.

Independent read-only corpus review covered all 20 families. Before outcomes,
its counterexamples corrected route prototype keys, text-edit ordering/aliases,
JSONL source-error cleanup, pointer signed-zero copying, sparse batch validation,
and metric min/max signed zero. A full60 validation passed; the two families
changed by the last review then passed bounded revalidation with matching bytes.
The reviewer did not claim complete hidden-test coverage.

The installed A/B/C E2E check uses actual OpenCode with a localhost scripted
provider on a separate mechanism fixture: A produces D0=1, B improves it, C's
author sees only base=0, C imports identical D0 and repairs once. Independent
checks return [0,1,1]. The user workspace remains clean. This is deterministic
mechanism evidence and consumes no final-task model observations.

Run pre-freeze model-free fixture validation against an installed bundle:

```sh
node evals/verified-change/validate-fixtures.mjs /absolute/install/node_modules/@opencode-harness/verified-change
```

An optional final argument selects one corpus module for a bounded recheck. The
script retains actual check records privately. It does not launch models, retry
an evaluation, or issue a scored success claim.

`statistics.mjs` implements the draft paired cluster t analysis and nominal exact
McNemar, with degenerate variance reported unavailable. Independent review checked
the formulas and implementation; four model-free tests passed both locally and
in the independent review. This review preceded final outcomes. The original
sign-flip proposal was removed because its symmetry null was stronger than a
zero-mean effect. The t approximation's assumptions and limitations remain
explicit. Critical-value conventions agree with the
[NIST Student t table](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm).

```sh
node --test evals/verified-change/statistics.test.mjs
```

Do not execute models on these final cases until all 60 are ready, the installed
runner path is verified, and the manifest freezes candidate/bundle/runner/corpus,
instructions, limits, arm order, no-retry policy and analysis. Do not publish a
positive effect from generated tests, fixture validation or review approval.

The runner uses the installed product for C and its isolated session/check
helpers for plain A/B. Per-arm started/finished files prevent ambiguous automatic
resubmission. Grading begins only after both extra-work arms complete. Grader
bytes, source scope, snapshot fingerprints, original workspace and the frozen
bundle/runner/corpus are checked. Independent orchestration review corrected
cleanup accounting, bundle/source linkage, frozen grader reuse and source-error
classification; unit and installed regressions retain those cases.

The Luna/low binding was verified again with one non-task availability message;
binding-check.json records structured completion and usage, without credentials.
Setup and cleanup are included in observed wall time but not separately timed.
C's internal deadline starts after preflight; B's starts before preparation.
There is no equivalent hard token/currency cap. Interrupted calls may omit usage;
provider cost metadata of zero does not mean free execution.

Before freezing, commit the preparation. Then run:

```sh
node evals/verified-change/freeze.mjs /absolute/installed/package /absolute/bundle.tgz evals/verified-change/manifest.json
# Commit that manifest before the first final task.
node evals/verified-change/run.mjs evals/verified-change/manifest.json /absolute/installed/package /absolute/bundle.tgz /absolute/private/run-directory
```

Do not reuse an unresolved arm or remove its attempt marker to retry it. An
interrupted campaign can continue only in the same directory; unresolved started
attempts become unavailable negative outcomes. A stale active.lock requires
checking its exact process is no longer alive before removing that one lock.
Never remove attempt markers, replace tasks or change frozen bytes after outcomes.
