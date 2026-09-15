# Two selected Luna usage attempts

Luna independently discovered and called the native `harness_sense` tool on both
inputs. Real baselines and eight standard variants ran and returned to each
author. **A useful diagnostic-to-delivered-test chain was not demonstrated.**
A misclassified the relevant surviving variant and delivered no regression for
it; B preserved the good control but was interrupted by a safety stop.

The two attempts are preserved, with no replacement or extra real smoke. This
series has an operational protocol deviation: an unknown HTTP 503 was retried
automatically before detection, and B had already started. It is not a clean
successful two-run demonstration. No comparative baseline or quality advantage
is claimed; historical H0 4/4 and H1 3/4 are unchanged.

| Observed result | A: case 1 | B: case 2 |
| --- | --- | --- |
| Native tool advertised in author requests | 19/19 | 14/14 |
| Independent author sessions | 1 | 1 |
| Autonomous `harness_sense` calls | 1 | 1 |
| Baseline / actual variants | pass / 8 | pass / 8 |
| Surviving variants | error message; `_copyArray(true)` | error message |
| Changes relative to supplied patch | wrapped-capacity test only, before diagnosis | none |
| Test change after diagnostic | none | none |
| Author diagnostic repeated | no | no |
| Ordinary `npm test`, including types, after last edit | pass | pass; no edits |
| Post-stop ordinary patch and independent checks | pass / pass | pass / pass |
| Frozen full acceptance | fail: missing relevant regression | captured patch accepted; control preserved |
| Native completion | normal exit 0, final stop, terminal patch | safety stop, exit 143, no terminal patch |
| Internal observer | incomplete | captured incomplete; runner status null |
| Provider requests / missing usage | 22 / 1 | 16 / 1 |
| Known input / output tokens | 565,840 / 6,646 | 430,805 / 5,360 |
| Native execution time | 224.725 s | 191.301 s |

## What the diagnostic changed

A's only edits were tool events 22 and 26, before `harness_sense` at event 30.
They expanded the wrapped bounded queue test to retain more falsy values and
check backing-array length and capacity mask. That local improvement is not
attributed to the subsequent mutation observation.

The diagnostic reported that changing `_copyArray(false)` to `_copyArray(true)`
still passed. The author called it equivalent, overlooking an empty deque. No
new test or diagnostic followed. Offline, the final suite still accepts exactly
that standard BooleanLiteral variant. A separate public API counterexample
calls `new Denque().removeWhere(predicate)`: correct production invokes the
predicate **zero** times; the recorded variant invokes it **four** times. The
expected-zero assertion rejects the variant, with no source inspection or
mutation identifier in the assertion. This is evaluator evidence after stop,
not a test delivered by Luna. Correct production and existing tests pass, but
that does not satisfy the frozen requirement for the new regression.

B called the tool at event 19. Its existing regressions rejected the actual
unconditional-return variant with a meaningful expected-removed-count assertion;
only the unspecified Error message survived. The author correctly accepted it
and changed no source bytes or executable modes. Existing order, same-error
atomicity, wrapped storage, falsy values, identity, capacity/overflow, type and
documentation coverage remain. No 100 percent mutation score was required.
Direct Mocha resolution and forwarded-grep attempts failed; the ordinary suite
passed twice and a later direct public API check passed. Those command failures
are retained and are not scored as assertion successes.

## Safety stop and delivery limits

A request 9 returned HTTP 503 with `upstream connect error or disconnect/reset
before headers. reset reason: connection termination`. There was no bound
terminal response or usage. The existing scheduler applies its missing-terminal
check to HTTP 200, so it forwarded this response instead of pausing. OpenCode
replayed the byte-identical request as request 10. The scheduler subsequently
admitted B before the uncertainty was detected. This violated the requested
unknown-execution boundary; neither the retry nor the late stop is omitted.

On discovery, the unique remaining B native process received SIGTERM. Request
16 ended with AbortError after an in-progress response; its usage and remote
execution remain unknown. The scheduler outcome is preserved as
`paused / unknown_submission`. Both local workloads have verified termination,
zero active relay handlers, saved capture and removed containers. Local
termination does not establish remote cancellation for either unknown request.
No request or task was restarted after detection; no launcher repair or further
campaign was started.

[A's patch](patches/01-case-1.patch) is the actual terminal patch.
[B's patch](patches/02-case-2.patch) is reconstructed from the captured interrupted
worktree against the frozen original base; it is not an autonomous handoff.
Both patches apply in ordinary copies and reproduce the captured project bytes
and executable modes. Both pass `npm test` (55 runtime tests plus TypeScript)
and the existing independent behavior checks. No internal paths, diagnostic
files or engine dependency changes are in either patch. The prepared ignored
lockfile is not part of either delivery. No author patch was edited manually.

## Environment, selection and cost

Runtime remained `5001f4cd4bccc1befad8e916580bbfd59443344f`; execution harness
preparation was committed as `ccf2ca3bdfedc3a4425550866099bbd8e5bd8592` before
freezing both inputs. See [frozen inputs](frozen-inputs.json) and the
[pre-run plan](PLAN.md) for hashes, full original task and the two existing
public denque 2.1.0 seed patches. Production changes remained uncommitted against
the original base. The same neutral task, OpenCode 1.18.26, Luna high, direct,
A=0/B=0, sensitivity=1, 900-second task deadline and 180-second diagnostic budget
were used. No runtime, prompt, input, operator or budget changed between runs.
This supported example was deliberately selected because the previous standard
operators did not expose the TTL gap; it is not a representative sample.

The actual installed container preflight used the same image, bundle and mounts
as Luna, with a local scripted provider. It checked outgoing native schema,
real baseline/engine/variants, returned observations, a subsequent assertion,
ordinary terminal-patch application and successful tests. A separate sleeping
native diagnostic verified cancellation and child termination. Two preparation
mistakes were corrected before provider calls: the control admission assertion
looked for the wrong operator, and the cancellation fixture used CommonJS in an
ES module. The failed local fixture and the initial successful preflight remain
preserved. See [preflight and admission](preflight-and-admission.json).

Total known model usage: **996,645 input + 12,006 output = 1,008,651 tokens**,
plus **two requests with unknown usage**. The 629,248 cached input and 6,980
reasoning tokens are subsets, not additions. All 38 provider requests, including
title/bootstrap work and the automatic replay, are accounted for. There were
67 native tool calls, including two sensitivity calls and their 18 diagnostic
commands. Author diagnostics consumed 20.379 s inside the 416.026 s of native
execution. Cleanup took 0.130 s; measured preparation/capture overhead was
5.358 s. Input admission, scripted preflight and post-stop checks are separate
in [costs.json](costs.json). Overall developer preparation time and monetary
charges are unavailable, not zero.

[Results](results.json), [A observations](attempts/01.json),
[B observations](attempts/02.json), [request accounting A](attempts/01-requests.json)
and [B](attempts/02-requests.json) retain compact observations and request hashes.
Complete source copies, raw provider streams, private session data and credentials
remain outside version control. Neither the evaluator nor the other model run's
results entered an author environment.

Local checks include the two-run scheduler fixture and H00 scheduling compatibility,
installed container delivery/cancellation preflight, actual post-stop patch tests,
recorded-variant counterexample, changed-file syntax and final diff review. The
scheduler fixture did not cover the observed non-200 unknown-response path; its
success does not establish that safety property. No historical model matrix,
manual Actions, merge, release, package publication or default change was run.
The required `npm run verify` could not start deterministic checks: both sandboxed
and elevated runs returned `PROCESS_CONTAINMENT_UNAVAILABLE`. That check is
unavailable, not passed; no containment bypass or unrelated repair was made.
The staged `git diff --check` flags the single-space context lines inside the
two saved unified-diff artifacts. The patches are retained byte-for-byte; their
applied source passed `git diff --check`, and the other new files pass it. No
whitespace rule or hook was disabled.
The broader product goal of improved Luna delivery remains unproven.
