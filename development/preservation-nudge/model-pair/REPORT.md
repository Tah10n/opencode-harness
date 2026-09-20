# Svelte-1190: one autonomous OFF/ON development pair

The two assigned attempts finished normally, but neither met the frozen full
acceptance criterion. ON attached no advisory. There is no observed advisory
reaction and no additional complete delivery attributable to the mechanism.
Applicability in this attempt is unconfirmed; this is not evidence of lift.

This is the known development task, not a held-out benchmark, official PolyBench
resolved result, or comparison with plain OpenCode. Candidate runtime remained
`fba1960cad4e2cf25831af1be8a21bea0361947d` for both arms. The local byte-exact
freeze was `f7f70316942f10e4462341cc84e9da3fbf27ffce`, before the first real request.
[PLAN](PLAN.md), [manifest](manifest.json), [exact original input](TASK.md).

## New pair only

Every F/E row below has verified integrity, a fresh build, correct local import
targets and unchanged independent expectations. All four runs retain 53 pending,
which are not passes. `p/f` means raw passing/failing counts, not a pass label.

| Arm | Trigger / delivery | Independently chosen checks | F_checks | E | A | Q_pair | T | D_pair |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OFF | Disabled / none | Existing class cases; added dynamic-update callback; broad runtime/CSS checks; full npm test | 1667p / 11f, exit 11 | 1654p / 23f, exit 23 | false | false | true | false |
| ON | Not observed / none | Existing class cases with added callback; broad suite; SSR ref repair; full npm test | 1666p / 11f, exit 11 | 1662p / 15f, exit 15 | false | false | true | false |

Both full patches apply unchanged in ordinary clean Git copies. Their terminal
patches equal the common collector's complete M byte-for-byte. Both native
processes finished with exit 0 and verified local termination and cleanup.
The internal harness status is `incomplete` in both arms; it is not substituted
for T or quality. No task was retried, resumed, replaced or extended.

[Exact OFF patch](patches/OFF.patch) · [Exact ON patch](patches/ON.patch) ·
[Results and arithmetic](results.json) · [F/E receipts](evaluation.json).

## What independent acceptance rejected

Both F runs have exactly the calibrated baseline's eleven failure names **and
messages**: eight custom-elements timeouts and three binding-select results
(the first assertion failure and two subsequent already-failed errors). They
introduce no additional failures in the executed F suite. This is a scoped
observation, not proof of every untested contract; pending/timeouts remain.

E reuses the original F2P/P2P lists and parser without normalization. Both have
`all_f2p_passed=false`, `no_p2p_failed=true`. ON's four additional failures are:

- `js collapses-text-around-comments` and `js css-media-query`: independent
  generated-code expectations use direct className assignments and base-36
  scoping IDs; both authors retain an encapsulateStyles/setAttribute helper and
  decimal IDs.
- `ssr styles` and `ssr styles-nested`: decimal scoping IDs differ from the
  independent base-36 expected IDs.

OFF additionally fails eight CSS HTML expectations because it prepends the
scope class instead of appending it: combinator-child, the static/dynamic class
cases, descendant-global-inner-class, refs-qualified, and three unused-selector
cases. Exact names, actual/expected values and errors are in the receipts.

These are literal independent-expectation mismatches, not independently
established DOM functional regressions. No new architectural requirement was
introduced and no patch was repaired or normalized to match gold. The declared
A criterion remains false; Q_pair requires A, so Q_pair and D_pair remain false.
This result does not establish that the class-scoping behavior generally fails.

## Mechanism and author behavior

ON state: `skipped/unknown`, 47 considered, 0 attached blocks, 0 added bytes;
`no_production_change=3`, `scope_or_origin_unknown=31`,
`unconfirmed_or_changed_execution=13`. Classification took 8.391 ms total.
There is no candidate attachment, next-request advisory, delivery time, or
advisory-to-check interval. Those fields are not observed, not deadline values.
All 70 captured ON request bodies lack the advisory. No OFF shadow classifier
was run. The visible ON commands use direct Mocha and modified existing cases,
outside the documented positive new-case/npm-lifecycle shapes. Absence of a
message does not certify old coverage.

[Observed events and first model receipts](trajectory.json) preserve command,
relative cwd (the delivery worktree), exit, duration, timestamp and request hash.
The first focused scoping greens used existing modified cases: OFF e66 at
750.595 s completion; ON e53 at 496.513 s. Neither is labelled a qualifying
new-origin nudge event. ON later adds a DOM class-update assertion inside an
existing sample (e65: 2 passing), rather than creating a new sample.

OFF's first clearly retained existing behavioral check is e72, starting at
826.307 s (13m46s): `mocha ... --grep 'css|preserves the scope class'`.
It executes unchanged runtime CSS callbacks using getComputedStyle and a CSS
transition callback, not just HTML snapshots. The check takes 16.948 s; its
preceding successful build takes 13.433 s (30.381 s active build+check time,
141.172 s wall span including intervening author work). It begins 75.712 s after
the first focused scoping green, leaves 956.745 s after completion, and its real
78p/2f result is in request 39. The two failures concern custom-elements timeout
and a generated JS expectation, not a newly observed old-DOM regression.

OFF also delivers explicit DOM event-handler-event-methods passes in request 51
from e102's rebuilt full suite: 1667p/11f/53 pending. Its final production-byte
edit e112 only removes the trailing newline in Stylesheet.ts. Subsequent focused
checks and CSS/JS/SSR/sourcemaps run (430p/10 pending) use the existing build;
there is no author rebuild after that byte edit. Final F/E rebuilds assess the
actual final M. Ignored author build-output hashes were not retained, so author
freshness is based on observed successful builds, imports and edit sequence,
not a cryptographic attestation of every intermediate dist file.

ON's first broad command starts at 599.413 s and really loads test/test.js via
mocha.opts despite the additional test/css/index.js argument. Its retained
57-failure receipt is truncated; the visible same-named event-handler sample is
SSR, not proof of the DOM callback. Earlier exact old-DOM execution/delivery time
is therefore unknown. The first unambiguous named DOM event-handler passes in
retained model context are e117's full npm test, starting at 1328.705 s (22m09s),
lasting 111.004 s **including its pretest build**, leaving 360.291 s. Request 67
contains that result. This is 832.192 s after the first focused scoping green;
no earlier unseen output is credited. This run follows the last production edit.

ON does independently repair a lost SSR `svelte-ref-button`: e99 exposes the
missing attribute (48p/1f), request 53 carries the failure, e101 restores the
attribute outside the no-class conditional, e102 rebuilds, and e104 passes all
49 CSS cases. New scoping remains. This is a real self-directed SSR rendering
repair, not an advisory effect or an old DOM behavioral callback. The zero-test
SSR filter e106 is not credited; the corrected e107 runs two cases.

## Evidence retention limitation

The reused collector saves unchanged native tool outputs and actual provider
requests/responses, but does **not** export separate full stdout files referenced
by OpenCode's truncated Bash receipts before removing the container. Two OFF
and four ON Bash outputs were truncated. Their native receipts and request
contexts survive; the complete files under /work/data/opencode/tool-output do
not. [Exact affected calls](output-retention.json). No lost output is reconstructed,
no unseen text is claimed delivered, and no replacement run is made. This is an
incomplete evidence deliverable and limits early trajectory conclusions. The
scripted preflight did not exercise this large-output retention case. Evaluator
raw logs are independently retained and do not fill author-delivery gaps.

## Time and usage

| Arm | Task execution | Stop-workload cleanup | Capture + container cleanup after native completion | Requests (author / parent / title) | Native tools | Input | Output | Cached input subset | Reasoning output subset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OFF | 1469.417 s | 0.055 s | 1.054 s | 61 (58 / 2 / 1) | 120 | 6,305,792 | 24,721 | 4,163,584 | 9,857 |
| ON | 1505.961 s | 0.058 s | 1.055 s | 70 (67 / 2 / 1) | 123 | 7,881,269 | 21,130 | 5,564,416 | 12,203 |

The capture/container column includes the stop-workload interval; do not add it
again. Both full native task runs stay within 1800 s. All 131 forwarded requests
have bound completed terminal responses and known usage; unknown-usage requests:
0. Total input 14,187,061; output 45,851. Cache 9,728,000 is included in input and
reasoning 22,060 in output; neither is added again. No monetary bill is available.
ON uses 36.544 s more task time and more input, with no extra D_pair delivery;
this difference cannot be causally attributed to an undelivered advisory.
All 26 OFF and 47 ON Bash commands and durations are retained, including failed,
zero-test, build, lint and final-check commands. OFF's lint is a real author
command; evaluator's frozen lint=noop is not a lint pass.

Preparation is separate: 27 installed scripted requests (14 Svelte pair + 13
existing advisory control); 16 model-free scheduler scenarios with 13 mocked
requests; six schedule refusals. Four baseline/gold F/E executions take 453.391 s;
four final F/E executions take 443.435 s. No Serverless, old six-arm campaign,
39-unit matrix, real probe/smoke, paid reviewer or additional task-run. Developing
agent work is separate and no unsupported monetary estimate is supplied.

Preparation corrections occurred before real calls: portable verification used
an archive-backed ordinary Git copy because author source is not a Git repo;
container accounting compares identities, not creation/removal order; Git CRLF
normalization was corrected with a local byte-preservation commit. An attempted
legacy lifecycle verifier invocation lacked required arguments and ran no
provider/container work; scoped terminal/usage and scheduler checks supplied the
relevant evidence. The reused installed-fixture helper refreshed its ignored
latest-result aliases in local/native-preservation-integration; those aliases
were restored from the retained preceding timestamped log/receipt after checking
its equality to tracked historical evidence. Timestamped logs and the pair's
separate scripted console/receipt remain. Failed preparation attempts are not model attempts.

## Decision and publication scope

Tie at D_pair=false in both arms, with normal T for both; ON has fewer literal
E mismatches but no qualifying full delivery and no advisory reaction. The
predeclared positive limited signal is absent. Applicability is unconfirmed and
mechanism benefit is uninformative in this pair. No follow-on run, runtime change,
default change, benchmark submission, merge or release is authorized/performed.

The new evidence passes bounded frozen-input, schedule, capture/patch-application,
usage arithmetic and verdict-prerequisite checks plus one final diff review.
These are local checks, not aggregate/platform CI. Historical pilot pause,
12 not_started slots, patches and R/T/D are unchanged. Full provider captures and
evaluator raw logs remain local under a restricted directory; no credentials,
projects, dependencies or images are committed. PR #25 retains Draft and its base.
