# Revision 2: interrupted Svelte-1190 development pair

ON received the advisory and ran behavioral checks, but did not finish an
autonomous delivery. The 1800-second deadline interrupted provider request 51;
its server completion and usage are unknown. The unchanged admission policy
closed scheduling. OFF is **not_started**, with no session or request. No retry,
probe, continuation, replacement or second submission followed that closure.
The saved full ON patch was independently evaluated without repair.

This is one interrupted, known-task development pair, not official SWE-PolyBench
resolved scoring or evidence of general lift. Default stays off.

## Assigned slots only

| Slot | Arm | Advisory / autonomous outcome | F_checks | E | A | Q_pair | T | D_pair |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ON | 1 block delivered; hard deadline, unknown submission | 1670 passing / 11 failing / 53 pending, exit 11 | 1654 passing / 23 failing / 53 pending, exit 23 | false | false | false | false |
| 2 | OFF | not_started: admission closed after slot 1 | NOT RUN | NOT RUN | unknown | unknown | unknown | unknown |

[Plan](PLAN.md), [frozen manifest](manifest.json), [results](results.json),
[unchanged ON patch](patches/ON.patch), [F/E receipts](evaluation.json).
The local byte-exact freeze commit is `b7dbcc58`, before real requests. Both
assigned arms use the complete candidate `829f78ee2ff5592046c5e18746fb154bd9941519`,
OpenCode 1.18.26, Luna high, original 1377-byte prompt and environment, original
Svelte source/dependency archives and images, Node 16.20.2/npm 8.19.4, offline
fresh build sessions and a single 1800-second budget. Only the nudge flag differs.

No terminal patch or autonomous final result was produced. The common collector
captured the complete stopped worktree patch: 58,503 bytes, SHA-256
`3659f2721f6c94ae28202017063c3005f54e084d3e1b01993cb6251c16414bf0`.
It applies unchanged in an ordinary Git copy; all 1884 resulting files were
checked against Git-index bytes and executable modes. No harness service paths
or dependencies are introduced. Researcher capture does not establish T.

## Acceptance and incompleteness

Both F and E have verified integrity, fresh builds, current-tree imports,
unchanged independent expectations and preserved production bytes/modes outside
the declared E surface. F retains all author tests and snapshots. E uses exactly
the original independent test surface, commands, parser and F2P/P2P criterion.
Driver, adapter and manifest hashes match the prior calibration; baseline/gold
receipts were reused without rerunning them or changing evaluation preparation.

F's eleven failure names **and messages** equal calibrated baseline F: eight
custom-element timeouts and three binding-select failures. No count allowance
was used. E has `all_f2p_passed=false`, `no_p2p_failed=true`; its additional twelve
failures remain literal evaluation failures:

- Eight CSS HTML expectations require the scope class after the original class;
  the author emits it first: combinator-child, static/dynamic class, inner-global
  class, refs-qualified and three unused-selector cases.
- Two generated-code expectations, collapses-text-around-comments and
  css-media-query, differ in helper/code shape and scoping-ID representation.
- Two SSR expectations, styles and styles-nested, require base-36 scoping IDs;
  the author retains decimal IDs.

Exact actual/expected differences are retained in the receipts. They do not by
themselves demonstrate a functional DOM regression. They are also not removed
or normalized out of A. Because frozen Q_pair requires A, Q_pair=false. The
absence of an autonomous terminal delivery independently makes T=false.

The last author `npm test` completed at 1792.679 seconds with 1670/11/53 and exit
11. Request 51 included that native receipt at 12:53:01.418 UTC, received HTTP 200
and a response ID with `in_progress`, but had no terminal response before the
deadline. Local SIGKILL/termination and forwarding closure are verified; remote
completion remains unknown. Local stopping is not a claim of remote cancellation.

## Observed reaction, without inferred reasoning

[Trajectory](trajectory.json) links commands, call IDs, timing and first actual
provider requests. No hidden reasoning or missing stdout is reconstructed.

1. **e68**, 617.858–635.781 s: original `npm test -- --grep
   'omit-scoping-attribute-class-(dynamic|static)'`, including nvm startup and
   full pretest build, exits 0 with two CSS cases. The cases compare generated
   CSS/SSR HTML; they do not execute the old DOM callback. Production and author
   snapshots had already changed. This is the first eligible selected pass.
2. Revision 2 records one eligible event, one attached **665-byte** block.
   Actual request **22** contains it at **636.288 s**, leaving **1163.712 s**.
   This establishes attachment and delivery to a real provider request, separately
   from the classifier's eligibility claim.
3. The author reads test/generated files and adds a **new** runtime sample for
   dynamic class updates. **e83** starts at **800.547 s** (13m20.547s), **164.259 s
   after delivery**, and takes **18.973 s including build**. It checks that the
   existing user class changes from foo to bar while retaining the new scope
   class. Three DOM variants and one SSR case pass; request **27** contains all
   four passes. This is a substantive dynamic-class check, not an existing
   sample or a received regression failure. No production repair follows it.
4. **e85**, `--grep '^css'`, passes 49 CSS cases. Its scope is the CSS suite,
   not runtime DOM callbacks. **e86**, full `npm test`, starts at **879.763 s**
   (14m39.763s), **243.475 s after delivery**, and takes **114.233 s with build**.
   Its full retained file confirms the unchanged existing
   `event-handler-event-methods` DOM callback passed in all three runtime
   variants; the callback queries the original user classes and dispatches
   clicks to test propagation. This is the first observed execution of that
   relevant existing scenario. Request **30** contains the overall 1666/15/53
   result, but truncation excludes those particular DOM rows. The same-named SSR
   case is not substituted as DOM-delivery proof. Earlier receipt delivery of
   that specific DOM result is not observed.
5. Later SSR handling and SVG class generation are edited before their subsequent
   checks; those changes cannot be attributed to a received old-behavior failure.
   **e110** fails the author's new SVG assertion (3 failures, request 43).
   The next change **e111** adds `compileOptions: { cascade: false }` to the new
   test configuration, with no production repair. The original cascade mode
   scopes the outer SVG; this red-to-green sequence is a configuration correction,
   not proof of repairing a production regression. e112 then passes four cases.
6. The final production edit is e109 at 1415.568 s. Later targeted checks rebuild,
   lint passes, and **e122** runs the complete suite at 1674.621 s for 118.058 s.
   Request **51** contains the named old DOM passes and the final 1670/11/53
   totals; its terminal model response is unknown. No autonomous final turn is
   manufactured from that request or from the collector's patch.

All listed author checks run in the native delivery worktree. Each `npm test`
uses the unchanged original pretest build and project imports. Intermediate
ignored build files are not independently cryptographically attested; freshness
is supported by command output, local import paths and the production-edit
sequence. Final F/E freshness is independently checked by the original driver.
OFF has no trajectory and no shadow nudge analysis.

Thus delivery and post-advisory checks are observed, but the required useful
causal chain—received old regression, correct production repair, preserved new
feature and full autonomous delivery—is **not established**.

## Retention, time and usage

[Provider receipts](provider-receipts.json), [output manifest](output-retention.json)
and [costs](costs.json) preserve safe identities, hashes, timing and accounting.
Full request/response captures, native receipts, database-derived records and
raw F/E logs remain private under ignored
`local/preservation-nudge-revision-2-model-pair/`.

Both native spill files were exported and hash-verified before container removal:
115,876 and 99,808 bytes, **215,684 bytes total**, linked to session/call/part IDs.
`archiveComplete=true` verifies all bytes of the available files;
`sourceCompleteness=unknown` conservatively retains native-internal-limit
uncertainty. Researcher-visible full files do not prove their tails reached the
model. No evidence recovery or retained live tmpfs was needed.

| ON measurement | Value |
| --- | ---: |
| Full task execution / deadline overshoot | 1800.059 s / 0.059 s |
| Stop-workload / capture and container cleanup | 0.055 s / 1.356 s |
| Provider requests (author / parent / title) | 51 (49 / 1 / 1) |
| Known / unknown usage requests | 50 / 1 |
| Known input / output tokens | 4,748,563 / 20,614 |
| Cached input / reasoning output subsets | 2,813,952 / 11,152 |
| Native tools / Bash commands | 123 / 33 |
| Bash time / npm-test time including builds | 549.869 s / 472.761 s |
| Lint | 8.418 s |
| Advisory classification / additional reads | 2.611 ms / 10 |

Cleanup's 1.356 s includes the 0.055 s stop interval; do not add it twice. Token
figures are **known subtotals**, not full-run totals: request 51 usage is unknown.
Cache and reasoning are included subsets, never added again. Total advisory
host overhead beyond the classifier was not independently timed and stays
unknown. No reliable monetary bill is available. OFF consumed no requests;
its unperformed task metrics are not zero-valued execution results.

Preparation is separate: 30 scripted requests (16 through the actual two-slot
Svelte launcher, 14 through the existing single revision-2 scenario), zero real
preflight calls, eight admission-refusal checks. Full spill bytes, inventories,
original prompt, dependencies, builds, applicable patches and cleanup passed.
Two Svelte scripted task durations total 112.906 s. Reused calibration cost no new
executions. Final ON F/E took **235.804 s**. Developing-agent work is separate
and is not included in Luna usage. Before dispatch, sandbox worktree creation
needed authorized escalation, and Git newline normalization was corrected by a
scoped byte-preservation rule plus follow-up freeze commit; neither caused a
model retry or changed the measured candidate.

## Decision and publication

**Interrupted pair; no established additional full delivery or mechanism benefit.**
ON has D_pair=false; OFF is unknown/not_started. This is neither a two-failure tie
nor evidence that OFF would have lost. Advisory delivery worked, but the required
useful repair-and-delivery chain did not occur. No third run, revision 3, new task,
scoring change or automatic follow-on study is scheduled. Default stays off.

Only development candidate/order and manifest routing were parameterized. The
installed runtime, collector, transport, model, permissions, text, trigger and
F/E driver stayed byte-identical to the selected candidate. Bounded schedule,
input/capture/hash, patch bytes/modes, arithmetic and F2P/P2P checks pass; one final
diff review covers the delivered evidence. Full controller, installed matrix and
retention campaign were not repeated. Local checks are not aggregate CI. The unmodified patch artifact produces Git
whitespace warnings for literal diff context lines; it is byte/hash-checked
separately, and scoped whitespace checks exclude that immutable artifact.
Historical reports, patches, pauses and R/T/D remain unchanged. All containers
created for this pair and evaluation were removed after capture. Publication is
one ordinary push to the existing branch and an update of Draft PR #25, retaining
base `feat/native-template-regression-workflow`; remote identity and check status
are reported separately after publication.
