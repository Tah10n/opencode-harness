# Ledger review delivery: preparation blocked before model execution

**The requested A → R → F pilot has not run.** Preparation found a conflict
between F's prescribed remaining budget and the existing development transport's
30-minute per-native ceiling. No conclusion about Luna, review utility or complete
delivery follows from this result.

The existing `container-session.mjs` rejects `setTaskBudget(3150000)` with
`Invalid relay task budget`; its relay independently imposes the same 1800000 ms
maximum. By contrast, the native task plugin accepts up to 3600000 ms. A legal
example with A=300 s, R=120 s and 30 s of transitions leaves 3150 s for F, so the
transport cannot express the requested F budget for every admitted trajectory.
Silently capping F, consuming time deliberately, restarting it or replacing the
transport would change the prescribed experiment. The user prohibited changes
to transport policy; no such change was made.

[The boundary receipt](budget-boundary.json) records an actual call on the existing
pinned, isolated container session. It is a preparation check, **not** the required
three-stage scripted fixture. Only `opencode --version` ran; no native conversation
was started. The temporary container was removed and its absence verified.
A permission question proposed the narrow limit amendment; no approval had been
received when this report was prepared. Further dispatch is not authorized by
this saved preparation state.

| Required result | Actual state |
| --- | --- |
| A / D0 | not_started / unavailable |
| R / findings | not_started / unavailable |
| F / final M / delta | not_started / unavailable |
| Whole-chain scripted preflight | not_started |
| False-review negative control | not_started |
| Reviewer exact outgoing inventory | NOT RUN |
| Independent D0/final assessment, raw 23 probes | NOT RUN |
| delivery_apply / assessment_integrity / Q | unknown |
| T / D | not evaluated: real path never started |
| Overall real deadline | not started |

## Preserved preparation

The target branch was clean at f98a9612, matching its remote tracking branch.
No ledger-review-delivery directory/state or matching active process was found;
no existing pilot was resumed or duplicated. Origin and PR #25 were verified as
Tah10n/opencode-harness, Draft, head `feat/native-task-workflow`, and base
`feat/native-template-regression-workflow`. Docker and GitHub access worked after
using the permitted execution context; initial sandbox denials were not treated
as missing tools or authentication.

[Preparation hashes](preparation.json) bind the exact 1468-byte original task,
saved environment and original baseline archive. The restored baseline matches
the saved original tree. Separate author/reviewer bundles use the same f98a9612
runtime, with only installation path mapping. Required `.gitignore` files exist
before mounting. The reviewer per-run configuration denies everything except
read/glob/grep and explicitly denies skill. This is prepared configuration,
not evidence of the actual offered tool set. Author permissions remain separate.
Private baseline, dependencies and bundles remain outside Git.

An initial preparation command tried to exclusively create the author's existing
`.gitignore` and stopped with EEXIST. The materializer already supplied the correct
bytes. Preparation now verifies those bytes and creates the file only when absent;
the same partial bundle and verified baseline were reused. [History](preparation-history.json)
preserves this local error. No installed native preflight or provider attempt
was repeated.

The previous AR0/AR1 results, reviewer responses, control defects, skill caveat,
costs and scores are unchanged. No implementation or reference was repaired.
No change was made to lib/, prompts, collector, recorder, upstream evaluator,
shared scheduler, relay, defaults or experimental status.

## Accounting and limits

Real requests: **0**. Scripted provider requests: **0**. Native conversations: **0**.
Model input/output/cached/reasoning usage: no requests to account for; no monetary
estimate. One neutral preparation container was created and removed. Development
agent/tool work is separate from model-pilot accounting. There are no D0/final
files to apply or assess; creating placeholder patches would misrepresent evidence.

The saved-artifact verification checks source/bundle/config hashes, exact task and
baseline custody, budget arithmetic, cleanup, absent stage starts and zero-request
accounting. Syntax checks and one final scoped diff review cover the new preparation
files. They do not establish state transfer, capture of an author delivery, patch
application, exact reviewer inventory, negative-control behavior or product quality.
The full controller/retention/platform matrices and product checks were not rerun.
Local verification is not CI evidence. No next pilot or continuation is scheduled.
