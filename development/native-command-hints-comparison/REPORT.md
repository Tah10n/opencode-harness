# Four full-task command-hint attempts

**Decision: keep command hints experimental and default-off; no further campaign.**
ON produced no additional full autonomous delivery. On A, OFF delivered and ON
failed the ordinary formatting gate. Both B patches violate an existing public
TypeScript contract. This selected two-task, one-attempt-per-arm development
comparison establishes neither general lift nor causal harm. There is no new
plain OpenCode control and no claim about the whole harness.

## Conditions and preparation

Product candidate: `c90fc7c78bcdd4d8288550b887f52990bafb11a6`, independently
materialized from its source archive; publication branch advancement did not
change the measured runtime. OpenCode 1.18.26, `openai/gpt-5.6-luna`, high,
direct, one author, 1800 seconds per complete task. Context, project checks,
sensitivity, investigation and EXTRA_ATTENTION were disabled. The sole arm
flag difference was HARNESS_TASK_COMMAND_HINTS=0/1. No route instructions were
added to the complete user prompts. Full settings, source/input/bundle hashes,
commands and rubric are in [PLAN.md](PLAN.md) and [frozen-inputs.json](frozen-inputs.json).
The private freeze hash is
`69f26dd40a5c49cad776054cb6253c36ee03fe8f2c16eceb831a0fecfa2a9f5c`.

A adds UFO's raw-preserving selective `withoutQuery`; B adds EventEmitter3's
exact-registration subscription cancellation. They are full behavior tasks with
implementation, consumers, regression tests, types, documentation and retained
compatibility. A deliberately selects the ordinary nested delivery worktree's
ancestor dependency layout with bare pnpm missing from PATH. It is not a random
sample of user environments. B has working ordinary npm project commands.

After the historical deny blocker, the user expressly approved identical
`external_directory: allow` in all four isolated containers. Author mounts held
only the task's public input, runtime and toolchain; evaluator, references,
other attempts, private host files and credentials were absent. Existing host
transport used the authorized Codex responses endpoint. Containers had no network,
no capabilities, read-only host mounts and private writable tmpfs. This amended
permission configuration limits generalization to the earlier deny configuration.

Before any real request, prepared baselines passed their existing commands and
failed new-feature acceptance; references passed; deliberately incomplete
solutions failed on substantive new behavior (A key decoding, B broad listener
removal). Preparation errors were corrected before the freeze and retained in
local logs. Four installed scripted preflights verified full prompt/config/tools,
flags/cwd, checkout preservation, transferable terminal patch, stop and cleanup.
A/ON's scripted `pnpm test` demonstrated a **partial ESLint ancestor route**;
separately selected ordinary npm test/build also worked. That scripted trace is
not the real A/ON author's behavior. See [preflight-summary.json](preflight-summary.json).

## Delivery grading

All four attempts ran once in the assigned order. There were no probes, retries,
replacement attempts, manual interventions or continuations. Each produced a
normal terminal patch and native `step_finish: stop`, with verified native/local
termination, closed forwarding, zero active provider handlers and removed relay
container. Thus T=true for all; no recovered interruption patch was substituted.
All four internal workflow statuses are `incomplete`, separately retained.

Unchanged terminal patches were applied to ordinary fresh copies under neutral
IDs. Mechanical checks and source/test/type/doc review were recorded before
reading the ID mapping and explanatory traces. The random neutral assignment
happened to preserve the original order; this is not independent human or perfect
blinding. [Patch hashes/results](comparison-results.json), [mechanical checks](grading-checks.json),
and [recorded review](neutral-review.json) preserve this distinction.

| Slot | Task / arm | Patch | Frozen checks | Q | T | D=Q∧T |
|---|---|---|---|---|---|---|
| 1 | A / OFF | [n01](patches/n01.patch) | pass | true | true | true |
| 2 | A / ON | [n02](patches/n02.patch) | fail: formatting | false | true | false |
| 3 | B / ON | [n03](patches/n03.patch) | pass | false | true | false |
| 4 | B / OFF | [n04](patches/n04.patch) | pass | false | true | false |

A/OFF passes ordinary test/build, independent semantics/types and built CJS/ESM
consumers. A/ON passes independent semantics/types/build/consumers but its unchanged
`test/query.test.ts` fails Prettier in `npm test`. No evaluator formatting repair
was applied. Both include the requested implementation/tests/types/docs.

Both B patches pass ordinary runtime/ESM/build and frozen new-API type/behavior
fixtures, and supply requested tests/docs without weakening old runtime assertions.
However, both extend existing `EventListener` and existing APIs with `this: Context`,
so a previously valid direct call of an arrow callback returned by `listeners()`
now produces TS2684. This violates the already declared existing-API compatibility
contract. [type-compatibility.json](type-compatibility.json) includes the complete
consumer and compiler output: original baseline and frozen reference pass; both
patches fail. This is a **post-hoc diagnostic**, not a pre-frozen test or a changed
rubric. It uses prepared TypeScript 6.0.3 on the host for declarations only, not
an additional Linux runtime claim. Under frozen mechanical checks alone, both
B rows would pass equally; even that narrower reading provides no positive ON
signal because A/ON loses and B is tied.

## Observed author paths

[visible-evidence.json](visible-evidence.json) contains command event indices,
call IDs, exits, mutation markers, hint/native-message evidence and final author
explanations. These are observations, not supported-runner certification or
independent acceptance. Evaluator commands above are never credited to authors.

**A/OFF:** bare pnpm and standalone tool attempts failed; Corepack also failed
while attempting network resolution. The author independently reached a real
formatter failure with `npm run lint` (#57), fixed it using
`npm exec --offline prettier -- --write test/query.test.ts` (#59), and built (#62,
the last tracked mutation due to generated README content). After that, the
built public API probe (#63), full Vitest runtime/type run (#64), lint (#65),
and focused runtime/type run (#75) passed. Build itself passed while generating
that final state; it was not rerun after its generated output. The final report's
510 full tests, 52 focused tests, lint/build/probe claims agree with the tool
outputs. The working offline npm route was found independently without hints.
The explanation of bare pnpm as solely a Corepack issue is imprecise: bare PATH
absence and failed Corepack network resolution were distinct observations.

**A/ON:** unsupported `pnpm --version` and `pnpm exec vitest ...` failures did not
produce hints. Supported `pnpm lint` (#48, exit 127,
`call_juT2E21PLwJ5ckOeuRre3AQN`) produced `path-found` with **original-script**
scope, route `'/work/repo/node_modules/.bin/pnpm' 'lint'`, manager version 10.33.2.
Unlike the scripted preflight, this actual run did not receive a partial ESLint
route. The appended hint is present in native tool message
`prt_0a9f63ea0001UKdrqhszEDKA6E`. Immediately subsequent commands use that ancestor
manager path: focused/full Vitest (#49/#50, exit 254: vitest not found), then the
recommended lint (#51, exit 1: eslint not found) and build (#52, exit 1: automd
not found). This establishes observed route use after the hint, not causality.
There was no useful project-check/fix chain, no successful runtime/type/lint/build
check, and no correction after the last code mutation (#44). The final response
correctly avoids claiming successful tests, but incorrectly says dependencies
are absent: prepared ancestor tools were present and working via npm in
preflight and independent evaluation. The delivered formatting defect remains.

**B/ON:** no hint. After the final code mutation (#52), behavior probes (#53),
`npm test` (#54), ESM (#55), rollup (#56), and syntax/diff checks (#57) passed.
The author explicitly reported TypeScript checking unavailable after its local
compiler check (#46). **B/OFF:** no hint. After the last mutation (#45), bare
mocha failed (#46); the author successfully used `npm test -- --grep ...` (#47),
then full npm test/ESM/rollup (#48–50) and diff checks. Its no-install compiler
attempt (#44) failed. Both final responses accurately report 48 runtime and
3 ESM tests/build plus unavailable author type checking; neither claims a passing
typecheck. The compiler was available to the evaluator through its separate
prepared toolchain, not through the author commands they tested. The broad assertions that no compiler
was installed/prepared overstate those local lookup failures: they did not
exhaust the mounted runtime toolchain. Their broad
compatibility claims do not establish preserved declarations; review found the
regression above. B/OFF's CLI summary was abbreviated; its author explanation
was recovered from the native result artifact, not invented from evaluator data.

**Capture limitation:** the existing launcher's raw HTTP request/SSE save list
omitted the new experiment kind. Real raw payloads/streams were therefore not
archived. Persisted native tool output proves the hint was in the native
user-visible result, and subsequent commands show use of its path; exact real
wire-level receipt and full serialized real prompts cannot be independently
replayed from saved HTTP bodies. Scripted preflight did save and validate those
fields. Actual provider request/usage/lifecycle metadata was retained. No
launcher repair or model rerun was made after discovering this evidence gap.

The original checkout dependency tree fingerprint is unchanged in every slot
(10,511 A entries, 1,705 B entries), excluding `.cache/**` and Vitest's generated
`dist/tsconfig.tmp.tsbuildinfo`. This does not prove absence of new ignored files
inside the delivery worktree. Corepack/network attempts and failed no-install
checks are retained; no successful dependency installation is observed. There
is no claim that every author avoided trying network resolution.

## Costs and limits

Provider counts include one auxiliary title request per slot. All 129 forwarded
requests have usage; unknown usage and unknown server completion counts are 0.
Native tools include the parent harness_task; author-only counts are separate.
Times are measured full native execution / launcher slot wall seconds, not sums
of individual tool CPU times or preparation time.

| Slot | Native / slot seconds | Requests | Native / author tools | Input | Output | Total | Cached input | Reasoning output |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A/OFF | 417.736 / 421.584 | 37 | 77 / 76 | 1,639,380 | 16,812 | 1,656,192 | 1,130,496 | 9,280 |
| A/ON | 348.750 / 352.243 | 31 | 61 / 60 | 1,243,965 | 13,325 | 1,257,290 | 816,640 | 7,046 |
| B/ON | 393.774 / 395.651 | 31 | 62 / 61 | 1,050,895 | 17,991 | 1,068,886 | 695,808 | 9,421 |
| B/OFF | 472.818 / 474.729 | 30 | 59 / 58 | 1,017,619 | 16,983 | 1,034,602 | 686,080 | 8,992 |
| Total | 1,633.078 / 1,644.207 | 129 | 259 / 255 | 4,951,859 | 65,111 | 5,016,970 | 3,329,024 | 34,739 |

Cache and reasoning counts are subsets, not additional tokens. No monetary
estimate is available. The A/ON emitted hint records 96 paths, 4 reads, 14,750
bytes, 4.457 ms and zero executions. Non-emitting paths have no cost artifact;
their overhead is unmeasured, not zero. Lower observed ON time/tokens does not
establish efficiency at equal delivered quality.

Developer work is separate: nine calibration container executions (including
initial preparation errors/rechecks), four scripted preflights with 44 synthetic
HTTP calls and 29.847 seconds total native phase, four ordinary evaluator patch
runs, and four declaration compatibility cases. Historical eligibility added
five synthetic calls and 15.291 seconds, preserved in RESULTS.json. No synthetic
usage is added to model usage. Total preparation/evaluator wall time and the
developer agent's token usage were not metered. There were no real availability
probes or model runs outside the four slots.

The existing targeted launcher verification passed after preparation changes;
new analysis scripts pass syntax checks and artifact consistency checks. This
is not a full CI/platform/containment pass. Historical aggregate
`PROCESS_CONTAINMENT_UNAVAILABLE` remains a separate limitation and was neither
rerun nor disabled. No runtime/default changes, manual Actions, merge, release,
package publication or further experiment are part of this result.

Publication whitespace checking passes for documentation/scripts/data. The full
staged check reports 43 blank context lines in the four immutable unified-diff
artifacts (a required single space); those patch bytes are intentionally retained
and their original hashes verified. All 167 frozen files and three input/runtime
manifests are unchanged; all 21 recorded batch containers are confirmed absent.
