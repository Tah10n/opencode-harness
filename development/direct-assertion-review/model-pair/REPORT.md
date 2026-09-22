# Direct assertion-review development pair

**No additional complete delivery: AR0 and AR1 both have Q=false, T=true,
D=false. The observed comparison is negative for the proposed benefit.** Both
resolve the intended truncation expectation without an identity gate. AR1 also
weakens a separate preserved partial-rewrite assertion and loses four legacy
migration cases that AR0 passes. This single known development pair establishes
neither causality nor a general error rate or harness ranking.

Exactly two fresh runs executed in the frozen order, with no intervention,
continuation, reviewer, third attempt, availability request or repair of M.
[PLAN](PLAN.md) and [manifest](manifest.json) were committed as `184b41e4`
before any real request. Historical plain (204/204, 10/23,
Q=false/T=true/D=false), reference/compatibility copies, pauses, Material UI,
Svelte and unstarted slots are unchanged and excluded from this comparison.

| Arm | Native outcome | delivery_apply | F readers/config/protocol + affected security | Raw E | Q | T | D | Native execution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AR0, ca72c444 | ordinary stop; internal incomplete | true | 90/90 + 103/103 + 14/14 + 1/1 | 20 pass, 3 fail / 23 | false | true | false | 1,657.252 s |
| AR1, 8facea83 | ordinary stop; internal incomplete | true | 89/89 + 103/103 + 14/14 + 1/1 | 17 pass, 6 fail / 23 | false | true | false | 1,502.435 s |

The unchanged complete patches [AR0](AR0.patch) and [AR1](AR1.patch) apply to
fresh ordinary Git copies with files/modes preserved. Independent F/E inventories
match before and after evaluation. The exact prior F/E procedure and 23 probes
were reused; only artifact paths changed. No historical test diff was overlaid.
The full `corepack pnpm verify` gate is unavailable offline for both, not passed.
AR1's author additionally ran its full connector suite: 276 passed, six skipped;
that author evidence is distinct from the independent F rows above and from CI.

## Assertion behavior and actual delivery

[Initial request comparison](input-comparison.json) confirms equal tool inventories
and exact removal of only the new block/separator from the real AR1 author text
to obtain AR0. Both received the full original task/environment bytes. Installed
bundle inventories differ only in native-task-workflow.mjs; the added instruction
is 204 words, 1,505 bytes plus its newline. Runtime paths and session IDs are
recorded separately. No arbitrary prompt normalization or HTTP rewriting occurred.

In [AR0's trajectory](AR0-trajectory.json), the old truncation failure was received
in request 46. Native edit call `call_BQZHeQgQ2jU9ugNP9jygb7Bv`, received in request
52, changes only that expectation in the existing mixed truncation test and adds
public collector regressions. The author's recorded explanation explicitly ties
that change to the task's replacement of truncation semantics. It keeps the
separate partial-rewrite expectation and eventually passes the supported
`adapter.collect({dataPath}, ...)` path. No optional source/account identity gate
is introduced. The old direct therefore already achieves this local objective.

In [AR1's trajectory](AR1-trajectory.json), request 41 receives the real old
truncation failure **and** a separate unterminated-rewrite failure. Edit call
`call_uryGHYcZv4oenARlkPO9iHkp`, received in request 45, changes both expectations.
The truncation change is correct and retains neighboring checks; later normal
reader execution and all five independent lifecycle probes pass without decorated
inputs. However, the other change accepts an extra provisional replacement day
and compares only totals, losing date/component equality. The author's recorded
statement broadly calls the remaining expectations intentionally superseded.

A bounded replay of the **unchanged original public partial-rewrite test body**
on final implementations passes AR0 and fails AR1: Claude returns the old accepted
day plus an unterminated replacement day, where the preserved test requires only
the committed entries. Only external import/fixture paths were rebound. This is a
preserved public contract, not a new hidden requirement or an addition to the
frozen 23-test score. The failure stops before later state/Qwen assertions, which
are not credited. Exact body/receipt hashes are in [AR1 assessment](AR1-assessment.json).
Thus AR1 fixes the narrow target but does not demonstrate a clean application of
“change only the actually replaced expectation.”

## Whole-task consequences

[AR0 assessment](AR0-assessment.json) and [AR1 assessment](AR1-assessment.json)
separate raw failures, public contracts, supplemental observations and source review.

- **Both:** accepted OpenCode baseline without confirmed exact-ID cutover returns
  empty complete data instead of failing closed. Corrupting the implementation's
  actual serialized ledger version also returns empty complete data. These are
  mandatory failures independently of test counts.
- **Both:** first-tuple conflict retention and unrelated new usage yield the
  correct total 22 with partial status, but diagnostic integration fails. AR0's
  `event_usage_conflict` is discarded by the real normalizer; AR1 supplies no
  conflict diagnostic. The existing CLI consumes that normalization result.
  Exact diagnostic spelling alone does not determine Q.
- **AR0:** confirmed cutover drops the accepted 100-token baseline, retaining only
  the new seven tokens. Later deletion/replay/privacy assertions in this chain
  were not reached. Source review also finds oldest-entry eviction at its 65,536
  insertion cap; a finite limit alone does not establish retention.
- **AR1:** existing 0.4.3 Claude/Gemini/Qwen/Antigravity state loses the accepted
  old day after source replacement and JSON reload. Full source/account metadata
  does not repair this. AR0 passes those same cases. AR1 also has the preserved
  partial-rewrite regression described above.

Both pass the five fresh-state JSONL lifecycle chains, independent SQLite
lifecycle, two legacy Antigravity inputs, historical Kimi migration and all six
real CLI disk-persistence/source-isolation cases. Both retain the same observed
event exactly once after the tested account remap and pass the unchanged raw
64-hex-ID privacy observation. These successes do not erase the other failures.
AR1 passes the confirmed-cutover fixture that AR0 fails; neither arm dominates
all individual contracts. The frozen raw diagnostic-name failure is kept in
each score; its consumer consequence was checked separately.

Source review covers all changed files, parser exports, persistence/CLI consumers,
range filtering, scan/storage limits and state validation. Neither changes
product dependencies, server/Codex identity code or releases. Overflow performance
and every possible source lifecycle race were not exhaustively tested.

## Costs and preservation

| Provider accounting | AR0 | AR1 |
| --- | ---: | ---: |
| Requests, all roles | 98 | 88 |
| Author / parent / title | 95 / 2 / 1 | 85 / 2 / 1 |
| Input tokens, cached included | 16,554,131 | 16,766,077 |
| Output tokens, reasoning included | 41,721 | 35,666 |
| Cached input subset | 11,769,344 | 11,984,384 |
| Reasoning output subset | 23,059 | 19,542 |
| Requests with unknown usage | 0 | 0 |
| Native tools / sessions | 138 / 2 | 136 / 2 |
| Whole slot, setup/capture/cleanup included | 1,660.554 s | 1,504.967 s |
| Native termination cleanup | 0.055 s | 0.058 s |
| Sum of native test-tool durations | 118.816 s | 190.183 s |
| Independent F/E evaluation | 42.061 s | 41.866 s |

AR1 used 154.817 fewer execution seconds and ten fewer requests, but 211,946 more
input tokens; the instruction's total cost is not its 1,505-byte size. Subsets are
not added twice. [Safe result receipts](result.json) retain per-role usage,
syntax/verify/other Bash durations, hashes, unknowns and termination facts. No
monetary estimate is made without billing evidence.

Preparation used 29 local scripted dispatches: two in the initial inventory
fixture failure, nine before correcting the delivery observer, and 18 in the
successful paired preflight. All were local and made zero real provider requests.
These failures remain recorded. The final fixture verified read/apply_patch/bash,
full task transport, exact delivery capture, linked spill retention and cleanup.
No controller/retention matrix or old installed scenario was rerun. Developing
Codex and evaluator work is separate from Luna; no billing cost is inferred.

For both real runs, complete terminal patches match external captures byte for
byte and point to the reported executionDirectory. Final responses, native
receipts, outgoing request histories and provider terminal/usage metadata remain
private. Native output export reports complete, with zero spill files in these
real runs; spill export was exercised by the scripted fixture. All six containers
created during this preparation/pair are confirmed absent; foreign resources
were untouched.

**Capture limitation:** the new experiment kind was added to request recording
but not the raw response-SSE allowlist. Raw provider streams were therefore not
saved and cannot be reconstructed. Recorded terminal metadata and usage, actual
subsequent requests, full native reports and tool outputs support the stated
observations; no claim of complete raw provider-stream retention is made. The
frozen launcher was not altered between arms to hide this omission.

Automatic approval initially blocked dispatch; read-only verification of the
user's exact data/endpoint authorization and the public repository resolved it.
The same unchanged launch was then approved. No workaround or extra run occurred.

## Decision

No positive development-pair benefit is established. The target assertion was
resolved by both arms; neither completed the full task, and AR1 weakened a
preserved assertion and failed additional migration contracts. Treat this as a
negative observed outcome for the proposed improvement, not proof that the new
paragraph caused those defects. Default and experimental status remain unchanged.
No new mechanism, prompt, task, reviewer or third attempt follows this result.

Local checks cover preparation/capture, unchanged application, scoped F/E,
original public preservation replay, scheduler stops, arithmetic and one final
diff review. They do not stand in for remote CI. Publication is limited to the
existing draft PR #25 with its original base; nothing is published in VibeRacing.
