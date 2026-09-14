# Separately authorized diagnostic series: no sensitivity benefit

The additional eight attempts completed normally on the corrected installed
profile. **H0 delivered 4/4 complete patches; H1 delivered 3/4.** The four selected
pairs contain one H0 win and three ties, with no new control regression. There
was no substantive mutation observation in any H1 session, and no additional
complete H1 delivery. The conditional transfer gate fails. The capability stays
experimental and off by default; no further campaign is scheduled.

This is a deliberately selected development comparison, not a random sample or
statistical evidence of a general H0/H1 ranking. It does not establish the
project's goal of more correct complete Luna deliveries. The [original eight
startup failures](../README.md) remain separate and unchanged. They are not
replaced, erased or pooled into the quality score below.

## Fixed inputs and actual installed execution

The [authorization amendment](../REAUTHORIZED.md) records the new eight-start
allowance. The same four inputs, seed patches, original tasks, balanced order,
model, dependencies and [pre-result rubric](../RUBRIC.md) were reused. The input
manifests are identical to the first series. The runtime bundle differs only by
the prepared `.gitignore` that fixes read-only startup.

Source/preparation commit: `91609c04`; component runtime: `5b5464c9`.
Freeze SHA-256:
`898d7dca7e7bafe3fc3e783e726bbbee70f3f1b9bd01d6dd0e3666aa48d8b1fd`.
Before freezing, this exact bundle passed the scripted installed H1 fixture with
`/template` mounted read-only: 15 scripted requests, 6.683 seconds native elapsed,
normal native stop, verified termination and zero real provider requests. Its
bundle manifest remained unchanged through the fixture.

Actual series: OpenCode 1.18.26, `openai/gpt-5.6-luna`, high, 900 seconds per side.
Both arms used direct with A/B disabled; H1 alone enabled sensitivity. Each had
one native author session and its own source copy. All eight native processes
exited normally with final `step_finish: stop`, verified termination and an
applicable `terminal.patch`. Every terminal patch reproduces the captured author
source bytes and executable bits. No internal paths or diagnostic mutations
were added to any source patch; no changed/deleted source file was omitted.

The internal workflow observer nevertheless reports `incomplete` in all eight
runs, principally because it does not classify their npm/AVA project commands.
That status and any retained ordinary tool failures are not rewritten. Q below
is full patch suitability under the frozen rubric; D adds the independently
verified normal native handoff and applicable patch. D does not mean that the
internal observer issued a green status.

## Every pair and retained delivery

| Slot | Input | Arm | Q / D | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Weak computed insertion | H0 | 1 / 1 | Added finite-TTL regression | [facts](attempts/01.json), [source](patches/01-case-1-H0.patch), [terminal](terminal-patches/01-case-1-H0.patch) |
| 2 | Weak computed insertion | H1 | 0 / 0 | Required finite-TTL regression still missing | [facts](attempts/02.json), [source](patches/02-case-1-H1.patch), [terminal](terminal-patches/02-case-1-H1.patch) |
| 3 | Weak removeWhere | H1 | 1 / 1 | Capacity tested through overflow after filtering | [facts](attempts/03.json), [source](patches/03-case-2-H1.patch), [terminal](terminal-patches/03-case-2-H1.patch) |
| 4 | Weak removeWhere | H0 | 1 / 1 | Added direct configured-capacity assertion | [facts](attempts/04.json), [source](patches/04-case-2-H0.patch), [terminal](terminal-patches/04-case-2-H0.patch) |
| 5 | Computed insertion control | H1 | 1 / 1 | Preserved finite TTL; public recency checks and docs | [facts](attempts/05.json), [source](patches/05-case-3-H1.patch), [terminal](terminal-patches/05-case-3-H1.patch) |
| 6 | Computed insertion control | H0 | 1 / 1 | Preserved control; added valid checks and docs | [facts](attempts/06.json), [source](patches/06-case-3-H0.patch), [terminal](terminal-patches/06-case-3-H0.patch) |
| 7 | RemoveWhere control | H0 | 1 / 1 | Added two valid atomic-failure assertions | [facts](attempts/07.json), [source](patches/07-case-4-H0.patch), [terminal](terminal-patches/07-case-4-H0.patch) |
| 8 | RemoveWhere control | H1 | 1 / 1 | Clarified excluded reentrant-predicate behavior | [facts](attempts/08.json), [source](patches/08-case-4-H1.patch), [terminal](terminal-patches/08-case-4-H1.patch) |

On case 1, H0 asserts `remaining > 0 && remaining <= maxAge`; H1 retains only
`expiresIn(key) > 0`. An isolated evaluation change removes the computed entry's
expiry without changing other cache semantics. H0's delivered assertion fails;
all 118 H1 tests still pass. H1's production code works, but its required test
regression is missing, so the complete delivery is Q=D=0.

Both denque case-2 tests reject configured-capacity loss. H1 observes a wrong
survivor after overflow. H0 observes `_capacity` becoming undefined, in addition
to existing ordinary post-filter operations. The frozen rubric requires actual
configured-capacity discrimination, not merely checking backing-array size;
it did not require every such assertion to use overflow. Both count in full.
The controls preserve their required behavior, tests, types and documentation;
additional valid assertions or wording changes do not constitute a quality win.

## What the component actually did

H1 cases 1, 3 and 4 queried `command -v harness-sense`, then reported the command
unavailable. They made no direct sensitivity invocation. `harness-sense` is
handled by the native Bash hook, not installed as a PATH executable, so this
probe cannot discover it. The available instruction did not lead those authors
to a usable invocation.

H1 case 2 requested `harness-sense index.js "npm test"` seven times, with two
quoting forms. Every invocation returned `not-run`: the current interface
accepts the script name `test` (or an explicit supported local runner), not a
quoted `npm test` command. These repeated calls came from the author; the harness
did not replay errors. The seven calls consumed 445 ms of adapter/native command
time, but ran zero project test commands and zero mutation-engine executions.
Original calls and returned observations are preserved in the attempt facts.

Consequently the denque repair cannot be attributed to a mutation observation,
and no mutation score or engine benefit is inferred. The installed fixtures
prove a supported program path; this series exposes failures of discovery and
command format in actual Luna use. No runtime/prompt repair or replacement
attempt was inserted after observing these failures.

## Checks, costs and limits

All eight final patches passed the ordinary suites including types, and the
independent behavior checks. Seven suites rejected the required-regression
variant with an inspected relevant assertion; the eighth passed it as described
above. These 24 commands used fresh Linux arm64 copies and 69.645 seconds of
measured model-free verification time. The [verification script](verify.mjs)
applies the terminal patch, checks captured bytes/modes, runs the project suite,
and evaluates the pre-existing required TTL/capacity discriminations. Those
evaluation changes are never loaded into an author environment or runtime.

The assessor reviewed full source diffs and seed-to-final changes, types/docs,
ordinary and independent checks, and actual assertion failures. The same
assessor also monitored execution, so this is not an independently blinded
assessment. Public facts include selected output excerpts and raw output hashes;
full logs and private sessions remain local.

| Cost or result | H0 | H1 |
| --- | ---: | ---: |
| Q / D | 4 / 4 | 3 / 3 |
| Provider requests, including title/bootstrap | 78 | 80 |
| Native tool calls | 150 | 147 |
| Native execution, seconds | 970.225 | 859.047 |
| Native cleanup, seconds | 0.222 | 0.229 |
| Preparation and capture, seconds | 22.543 | 15.870 |
| Input tokens | 2,199,862 | 2,334,684 |
| Output tokens | 31,047 | 31,431 |
| Total known tokens | 2,230,909 | 2,366,115 |
| Cached input subset | 841,216 | 709,632 |
| Reasoning output subset | 18,509 | 19,645 |
| Unknown-usage requests | 0 | 0 |

H1 used 135,206 more known tokens and two more requests, while its total native
elapsed time was 111.171 seconds shorter. These differences do not compensate
for the missing complete delivery, and the small selected series does not
establish general cost or quality effects. Cache/reasoning subsets are not
added again. [Structured results](results.json) and [costs](costs.json) retain
per-attempt and aggregate accounting. Monetary charges are unavailable; copying,
hashing, Git verification, report/review and Codex orchestration are not all
measured, so their aggregate cost is unknown rather than zero.

All eight model containers and all verification containers were removed after
verified stop. The previous eight startup outcomes/patches retain their hashes;
old H00 pauses/outcomes and slots 43–48 remain untouched. This stage has now used
sixteen starts: eight original startup failures and eight separately authorized
model executions. New retries, replacements, real smokes and transfer runs: zero.
No manual Actions, platform matrix, merge, release, package publication or user
default change was performed.
