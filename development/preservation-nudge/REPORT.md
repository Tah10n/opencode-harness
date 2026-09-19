# Preservation nudge: local implementation evidence

Implemented one independent direct-only opt-in, `HARNESS_TASK_PRESERVATION_NUDGE=1`.
It adds one advisory after a supported focused feature pass following production
changes. The existing author chooses an old behavioral check and handles its real
result; no new tool, model stage, automatic command or mandatory correction exists.
Default remains off. See [supported scope and enablement](../../docs/native-task/PRESERVATION-NUDGE.md).

## Historical replay and public discrimination

The unchanged historical inputs are those referenced by
[the trajectory report](../polybench-pilot/svelte-1190-trajectory/REPORT.md).
[replay.json](replay.json) records the same runtime classifier recognizing e91:
production changes, new sample, four named Mocha passes, eligibility with over
1,000 seconds left and before snapshot edits e105. e92's zero-test output does
not qualify. Suite identity is retained; the additional generic Mocha control
shows that an old server-suite pass cannot suppress a missing screen-suite check.

The extractor executes no commands from the history and reads no evaluator,
E/gold or hidden tests. It applies every retained native text patch through e91
with unique exact contexts to the affected baseline files, producing a diff
projection and new-file bytes. Recorded snapshot IDs remain references: neither
a complete intermediate tree nor ignored build bytes are independently attested.
This is offline trigger replay. The historical author did not receive this nudge.

[public-check.json](public-check.json) records two disposable, network-disabled
copies built from the pinned base/dependency archives and saved author image:

| Implementation | Unchanged public DOM sample | Exit | Total copy/setup/build/test time |
| --- | --- | --- | --- |
| Baseline | 3 passing | 0 | 14.465 s |
| Baseline + exact full saved H1 patch | 3 failing, including `dispatchEvent` | 3 | 14.168 s |

Both performed the normal fresh build. No hidden test patch was applied, no
historical model patch was repaired, and no full suite/F/E campaign was repeated.
This proves that this public test distinguishes the saved implementations. It
does not prove that an early historical run would have produced complete delivery.

## Installed author → receipt → red → green → portable patch

[installed.json](installed.json) is the final OpenCode **1.18.26**, Linux/Docker
receipt. The container has network disabled; the provider is scripted on loopback.
Each positive scenario receives the full task, edits production using native
read/edit, writes a new feature test with native write and runs actual native Bash:

1. Focused new feature passes while old behavior is broken.
2. The automatically generated advisory is in the last tool receipt of actual
   scripted request 7 (request hash retained).
3. The selected original behavioral check fails; its actual assertion error is
   in the last tool receipt of request 8.
4. A native edit preserves the new feature and repairs the old behavior.
5. The feature command, old command and `npm test` all pass after that edit.
6. The terminal patch applies unmodified to an ordinary Git clone. Its project
   tests pass; old/new assertion bytes, production bytes and executable modes
   match the delivery worktree. Original checkout and index are unchanged.

The second control uses different API names, a `spec` directory and an ESM feature
test importing the CommonJS public module. OFF uses the same task and sequence
as the primary control, with the advisory module physically absent from the
installed bundle: no new block or state artifact, and the same portable patch hash.

The irrelevant-check control receives a nudge but chooses an unrelated constant
test. No real failure is delivered to that author and no repair is claimed. The
unchanged final acceptance in the portable clone fails. No forced extra turn is
opened by the advisory.

The scripted decisions and edits are predetermined. This tests integration, not
Luna's independent ability to select a useful old test. Every workflow terminates
with verified cleanup and a patch, without abort in the positive scenarios.
The main observer retains `incomplete`: the new-file focused route is outside its
old trusted interpretation. It is not promoted by the advisory. The explicitly
rerun old command resolves its real earlier failure; the accepted portable patch
and real test exits are separate evidence from that internal status.

## Cost and accounting

The final installed run has 48 local scripted HTTP requests (13 each for the two
positive controls and OFF; 9 for irrelevant), 17 native project-check executions,
and four additional portable `npm test` executions. Exact per-check durations,
classification times, request hashes and installed module hashes are in the receipt.
The two public DOM executions and their fresh builds are counted separately above.
The recommendation of 120 seconds is not reported as measured cost.

The positive receipts add one block of 571/572 bytes each; OFF adds zero. Once
attached, subsequent Bash calls update only the bounded once/counter state.
Host classification measurements cover advisory work, not the existing snapshot
capture, native startup, model computation or all developer test time.

Development attempts are not erased: two initial installed attempts failed at
advisory delivery because the native Node reporter was spec rather than TAP.
The diagnostic error handler initially returned HTTP 400, allowing local SDK
retries; it now ends the scripted response and surfaces the assertion after the
workflow returns. Exact HTTP counts for those two failed attempts were not
retained and remain unknown. Three subsequent completed development runs recorded
42, 48 and 48 scripted requests before the final 48-request run. Thus completed-run
accounting is 186 scripted requests, plus the uncounted failed-attempt requests;
this is not an all-attempt exact total. None were real research providers.

Real research provider calls, Luna task runs, availability probes, new dependencies,
benchmark campaigns and paid reviewers: **0**. Developing-agent work and local
project execution are not added to historical Luna usage. Historical patches,
R/T/D, acceptance diagnostics, freeze/pause and 12 not-started slots are unchanged.

## Regression evidence and limitations

* 39 advisory unit controls cover runner/count parsing, new/old origin, current
  and stale checks, baseline failure non-attribution, incomplete history,
  missing admission, source changes, time/cancellation, once state, scope identity,
  configuration change and read refusal.
* Native hook tests cover three rejected configurations and six workflows:
  queued concurrent checks, cancellation during eligible-state persistence,
  permission denial, OFF, independent workflow state, and coexistence with command
  hints and TYPE_COMPAT enabled. The coexistence control leaves TYPE_COMPAT
  unsupported in this JS-only project; it does not claim combined compiler analysis.
  Raw events stay free of advisory text and permission continuations stay unused.
* Existing `verify-native-task.mjs`, command-observation (23 scenarios),
  check-first and native-template regressions passed locally.
* `verify-native-task-format.mjs` could not bind loopback in the host sandbox
  (`listen EPERM`) and did not run its installed path. This is an unavailable
  check, not a failure of tested product code and not a pass. The final dedicated
  installed path above ran inside the already available isolated Linux environment.
* Syntax, whitespace and one final diff review are part of this local delivery.
  That review found permissive duplicate TAP totals; the parser was narrowed to
  the complete supported report grammar, its contradictory-total control passed,
  and the installed scenario was repeated on the final module bytes.
  Targeted results are not a full CI/platform pass.

Limits remain explicit: changed individual cases, complex shells/runners,
ambiguous dynamic layouts, hidden/oversized reads, arbitrary regex selection and
nested cwd are unknown. This is not a universal coverage map or a compatibility
certificate. No next model series or additional mechanism is scheduled.
