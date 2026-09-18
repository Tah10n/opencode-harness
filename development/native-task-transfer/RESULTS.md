# Fixed-product transfer pilot results

**Frozen scoring: A 5/6 complete deliveries, B 6/6; one B win, zero A wins,
five ties.** This is a new six-task development pilot. It does not replace the
historical A 5/6, B 4/6 pilot or any bookmark continuation.

All twelve preassigned full task-runs were executed once. Product bundle:
`db99470ab3517b741e0452613a9ff04f68a49bc1`, OpenCode 1.18.26,
`openai/gpt-5.6-luna`, variant `low`. A used plain OpenCode; B used installed full
`/harness-task`. No B imported initialReview or D0. Each native invocation had a
single 900-second limit including all native stages. No runtime, task or evaluator
changed between arms. Existing defaults remained two repairs, one evidence
correction and the bounded format correction. No observer messages or edits
entered a running session. References/acceptance were unavailable to author and
reviewer; independent checks ran only after verified workload termination.

## All six pairs

The check columns show **independent behavior / unchanged original tests / delivered
ordinary project suite**. Tests/docs delivery is judged against the pre-frozen
rubric, separately from those counts. Completion is scoped to that rubric and its
coverage limits, not universal correctness. Explicit atomic replacement was also
reviewed in both state tasks. All original assertions were retained or equivalently
refactored; no lost old coverage was found.

| Task | A checks | B checks | Required tests/docs A; B | Complete A; B | Native B status | B D0 to final |
|---|---|---|---|---|---|---|
| partial-checkout | 3/3; 1/1; 3/3 | 3/3; 1/1; 3/3 | yes/yes; yes/yes | yes; yes | reviewed_delivery | Identical; D0 already complete |
| http-error-consumer | 3/3; 1/1; 5/5 | 3/3; 1/1; 4/4 | yes/yes; yes/yes | yes; yes | incomplete | Extra URL/options assertions only; D0 already meets frozen rubric |
| transactional-settings | 3/3; 1/1; 4/4 | 3/3; 1/1; 4/4 | yes/yes; yes/yes | yes; yes | incomplete | Identical; D0 already complete |
| document-backup | 4/4; 1/1; 4/4 | 4/4; 1/1; 4/4 | yes/yes; yes/yes | yes*; yes | incomplete | Identical; D0 already complete |
| dual-lookup | 3/3; 1/1; 8/8 | 3/3; 1/1; 6/6 | yes/yes; yes/yes | yes; yes | incomplete | Identical after unsupported experiment was removed |
| quoted-contact-import | **2/3**; 1/1; 4/4 | 3/3; 1/1; 6/6 | yes/yes; yes/yes | **no**; yes | reviewed_delivery | Identical; correct behavior already in D0 |

The single scored difference is an explicit, pre-frozen CSV requirement. A drops
an explicit empty record after another row: `parseRows(' é ,x\n\n')` returns only
`[[' é ', 'x']]` instead of also retaining `['']`. Its `finishRow` skips empty
records whenever previous rows exist. B preserves the record. A's quoted-value
assertion earlier in that acceptance test passes, then the empty-record assertion
fails; the subsequent empty-input and empty-quoted-field assertions in that test
are **not counted as reached**. The two separate header/error tests still run and
pass. Required project test categories and docs were delivered by A despite the
behavior failure. This is a new-requirement failure, not a regression of the old
simple-import test. No retry or manual correction was made.

All six B/D0 versions pass the same frozen behavior and original preservation
checks as B/final. **No scored behavior defect was repaired after review; no
production regression was introduced after D0.** Production repairs = 0,
evidence corrections = 0, format corrections = 0 across B. Correct D0 without a
repair is an allowed success, not a reason to force reviewer activity.

## What the workflow actually contributed and where it stopped

- **partial-checkout, quoted-contact-import:** ordinary implementation then review;
  no changes after D0. The CSV pair win therefore concerns initial implementation,
  not evidence of review-driven repair effectiveness.
- **http-error-consumer:** reviewer requested URL/options assertions on the other
  error branch in addition to the existing 404 assertions. Reproduction added
  them and ran tests, but returned a disposition for F-001 without the separately
  represented obligation-0. Controller retained `incomplete`. Frozen test delivery
  did not require duplicating those assertions on every branch; D0 already covered
  all requested categories, just as A did. The additional assertions are recorded
  as stronger coverage, not a newly invented requirement or a behavior repair.
- **transactional-settings, document-backup:** final code and required delivery
  pass. A successful `npm test` was followed by a sequential-tool-guard error
  recorded with `before: null` and `after` equal to the current snapshot.
  `finalChecks` treats `before !== after` as a mutation boundary, invalidating the
  referenced npm event. Later Git checks do not replace that reference. The
  controller reports a failed/missing/stale required check although the retained
  code did not change. This is an evidence-accounting limitation, not a failing
  behavior test. Runtime was not revised during measurement.
- **dual-lookup:** reviewer initially demanded propagation of exceptions thrown
  by the consumer callback, which the task did not define. Author executed a
  failing probe and a temporary project test (7 tests, 6 pass, 1 fail), then
  rejected the unsupported expected behavior and removed only that experiment.
  Production code and original required assertions remained unchanged. This is
  a useful observed refusal to make an ungrounded change. The next review asked
  for callback-specific error-first/throw identity tests beyond the frozen rubric
  and cited an earlier npm event from before the temporary experiment alongside
  the final npm event. Internal status remained incomplete. The frozen rubric
  and reference require both styles' first-completion tests and error identity;
  they do not separately mandate every callback error variant. The stronger
  reviewer interpretation is retained, not made into a post-result scoring rule.

Thus B has **2 reviewed_delivery and 4 incomplete** native outcomes, while its
independent frozen delivery score is 6/6. These are intentionally separate facts.
There are no remaining missing test/doc categories in the frozen delivery rubric;
the unresolved native claims and evidence limitations above remain in the raw
workflow reports. No timeout occurred, and all twelve workload terminations and
container cleanups were verified.

## Actual cost

Seconds are each native invocation through verified termination. They include B's
implementation/review/reproduction/disposition-review and bootstrap. Independent
post-model grading, preflight and human-readable reporting are outside this timing.
Requests are actual provider requests, not task-runs. Tools include errors and the
outer `harness_task` in each B; they exclude independent grader commands.

| Task | Seconds A / B | Requests A / B | Tools A / B | Observed total tokens A / B |
|---|---:|---:|---:|---:|
| partial-checkout | 70.712 / 141.933 | 14 / 24 | 22 / 37 | 112,816 / 255,891 |
| http-error-consumer | 83.192 / 142.349 | 13 / 21 | 19 / 26 | 102,939 / 226,341 |
| transactional-settings | 94.781 / 120.615 | 16 / 20 | 23 / 26 | 149,232 / 182,948 |
| document-backup | 79.385 / 120.148 | 13 / 20 | 15 / 25 | 100,366 / 184,944 |
| dual-lookup | 85.492 / 204.706 | 13 / 26 | 20 / 29 | 113,088 / 339,661 |
| quoted-contact-import | 107.604 / 117.971 | 14 / 17 | 22 / 21 | 127,888 / 158,306 + unknown |
| **Total** | **521.166 / 847.722** | **83 / 128** | **121 / 164** | **706,329 / 1,348,091 + unknown** |

A: 687,902 input + 18,427 output. B: 1,317,200 observed input + 30,891 observed
output. Combined observed total **2,054,420 tokens**, 211 provider requests,
285 tool calls and 24 native sessions. A cached input 287,232 / reasoning output
3,381; B cached input 380,928 / reasoning output 5,859. These are already included
subsets; cache-write tokens observed are zero. One request has no observed usage,
so neither that request nor its possible billed tokens is silently treated as zero.
B used 1.63x measured time, 1.54x requests, 1.36x tools and at least 1.91x observed
tokens relative to A. Equal 900-second caps did not mean equal consumption.

## Preserved infrastructure incident and coverage limits

1. **HTTP 503 and the last preassigned slot.** Within quoted-contact-import B,
   16 requests returned HTTP 200 with usage and one returned HTTP 503 without
   observed usage. Native OpenCode nevertheless completed, delivered the patch,
   and terminated; independent checks passed. The original outer runner then
   wrote its infrastructure error and stopped before slot 12. That result/error
   is preserved. Only the never-started, already-authorized quoted-contact-import A
   was subsequently selected using a copy of the existing runner differing in
   exactly its loop filter. The observer disclosed this before starting A. Its
   selection and hashes are retained in `remaining-slot-manifest.json` locally.
   Original runner/freeze, runtime, environment, authorization, model, tasks and
   grader stayed unchanged. No old task-run or session was repeated. This is an
   orchestration deviation from an uninterrupted batch, not a clean all-200 run.
2. **Native tool errors.** A recorded 24 `ripgrep execution failed` events and one
   malformed read invocation. B recorded 18 ripgrep errors, 18 sequential-guard
   errors and seven missing-file errors. These errors remain in the journals,
   contribute to tool cost, and are not success evidence. Both arms shared the
   pinned environment; no mid-series toolchain fix was made. The ripgrep problem
   limits interpretation of a fully healthy native environment. B's two stale
   check outcomes show a specific interaction with its guard/event accounting.
3. **Document input-domain ambiguity (*).** Post-run source review identified
   a case not settled by the frozen ordinary-JSON-data corpus: an object with
   a custom `toJSON` returning `undefined`. A and the reference do not reject
   `JSON.stringify(...) === undefined` before changing backup; B does. If such
   non-JSON serialization hooks are included in the task's broad invalid-input
   wording, A/reference have a contract gap. This was not executed as a new
   evaluator test, not hiddenly added between arms, and not scored as a B win.
   The primary 5/6 versus 6/6 numbers remain frozen-rubric counts, qualified by
   this domain/reference limitation; universal completion is not established.
4. Preflight was checked before calls on references, alternatives and mutants.
   Its first order test accidentally used a palindrome; the failure to reject a
   reverse-order mutant exposed this, and a non-palindromic duplicate sequence
   replaced it before freeze. Twelve behavioral mutants then failed by actual
   assertions. Two direct-write mutants expose the need for the explicit atomicity
   source criterion. These facts establish bounded grader checks, not exhaustive
   correctness. No required project examples were introduced after results.
5. Six small synthetic tasks, one run per arm, are not statistical evidence of
   broad superiority. Tests within a task are not independent observations. With
   all six B/D0 behavior checks already passing, this corpus offers no observed
   behavior-repair opportunity and cannot establish transfer of the bookmark
   repair success to new defective D0s. No minimum baseline-failure target was set,
   and no harder replacement tasks or reruns were selected after seeing results.

## Decision and retained evidence

There is one favorable initial-delivery difference for B and one useful rejection
of an unsupported review suggestion. There is **no demonstrated transfer of
production repair benefit** on these six tasks. Four internal incomplete outcomes
and higher observed cost limit the usefulness of the full path even when its code
is correct. This result alone does not justify a larger paid evaluation claiming
repair lift or promotion/default change. A separately authorized, preregistered
larger evaluation could test that question; this stage does not start one or alter
the product to obtain a better outcome.

[Machine-readable results](results.json), [preflight summary](preflight-results.json),
[freeze](freeze.json), original task trees/graders/references under `tasks/`, and
[all final/D0 patches](deliveries/) are preserved together. Local private artifacts
retain complete snapshots, original outputs, commands, provider metadata, grader
stdout/stderr and the orchestration manifest. Public result hashes identify those
artifacts without publishing raw logs or authorization material. All 7,434 frozen
input/runtime/dependency hashes and 432 prior historical artifact hashes verified
unchanged after all twelve runs. Independent read-only reviews checked the corpus,
completed deliveries and accounting interpretation; candidates were not repaired
by the observer.

The executed product's existing [exact-head CI](https://github.com/Tah10n/opencode-harness/actions/runs/34327926899)
is successful at db99470. It remains model-free validation, separate from this
transfer evidence. This report publication does not change the measured runtime,
prior A 5/6/B 4/6 outcomes, or any continuation. No merge, release or default change.

Publication validation: all corpus JavaScript passed `node --check`, all JSON
parsed, and all twelve published final patches reconstructed the captured trees
byte-for-byte without executing candidate code. `git diff --cached --check`
passed for non-patch files. On retained `.patch` files it reports the standard
single-space prefix of empty context lines as trailing whitespace; those original
patch bytes were preserved and verified by reconstruction. Final independent
publication review found no assessment/accounting or sensitive-data issue.
