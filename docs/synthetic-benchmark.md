# Synthetic Ablation Benchmark

The synthetic benchmark is a separate, model-neutral product-value experiment
for comparing the same host-selected model under different harness profiles. It
does not replace release regression evaluation, and its reports must never be
passed to `npm run assess:candidate`.

Model-free validation and self-tests prove that the benchmark infrastructure is
deterministic, isolated, and internally consistent. They do not prove that one
profile produces better coding results. A quality claim requires a complete
paired model-backed run.

## Canonical Profiles

| Profile | Purpose | Included behavior |
| --- | --- | --- |
| `plain` | Honest safe baseline | One built-in coding agent, ordinary read/edit/test capabilities, no harness-specific orchestration prompts, no recursive delegation by default, and no computational mutation gate. Dangerous operations remain permission-gated. |
| `profile-only` | Prompt-level harness | Orchestrator, context inventory, scoped subagents, review ledger, termination policy, verifier workflow, and safe permissions. It excludes the Engineering Dossier mutation gate. |
| `instrumented` | Full production harness | The profile-only behavior plus the Engineering Dossier, impact graph, runner-owned context receipts, context sufficiency, exact ownership, trusted project checks, computational mutation gate, final reconciliation, and attestation. |

The profiles are views over one canonical inventory in
`profiles/inventory.v1.json`; they do not duplicate agent prompts. Model,
provider, and reasoning/variant selection remain host-owned. The benchmark
records a binding fingerprint and observational availability metadata, but
model metadata cannot authorize mutation, pass a quality gate, or establish
benchmark success.

The model is never told which profile or comparison arm it is running. There
is no profile-specific benchmark overlay and no benchmark-owned final-answer
choreography. Temporary paths are opaque, and materialization rejects
model-visible agent or skill text containing evaluator-owned labels such as
`profile-only`, `instrumented`, `Profile mode`, or benchmark/control-arm
terminology.

The neutrality check constructs the actual production tool surface used by a
disposable profile and recursively scans tool names, descriptions, and schema
descriptions. It does not rely only on the source prompt files. A forbidden
profile or evaluator label anywhere in that model-visible surface fails
model-free validation before a run can start.

`profile-only` and `instrumented` receive byte-identical agent and skill prompt
trees. The orchestrator follows a capability-neutral rule: use the
runner-owned quality lifecycle only when those tools are actually exposed;
otherwise use its direct bounded inspect/edit/verify loop. Their allowed
treatment difference is therefore limited to computational availability:
`quality_*` and `context_read`, the quality plugin, runner control state, and
the private host-toolchain lease. The credential firewall is identical.

The three predeclared estimands are:

- `plain` -> `profile-only`: prompt/orchestration effect;
- `profile-only` -> `instrumented`: computational quality-control increment
  under identical model-visible harness prompts;
- `plain` -> `instrumented`: total harness effect.

Every estimand keeps the public task, initial fixture, model, provider,
variant, timeout, runner limits, adapter, and authentication projection equal.
Only the treatment named by that estimand may differ.

Every rendered task also carries one neutral model-visible `task_scope`: either
read-only, or an exact bounded list of repository-relative paths that may be
changed plus the maximum changed-file count. The same scope sentence is present
in every arm. The runner accepts any changed-path subset within that declared
surface; it does not require every allowed path to change. Functional visible
and hidden checks, rather than an undisclosed expected-file list, decide whether
an otherwise in-scope repair is correct.
Hidden fixtures may exercise examples not present in the visible tests, but
every interface field, precedence rule, result shape, side effect, and failure
semantic they enforce must be stated in the shared public prompt or visible
source. Hidden checks are held-out examples of a public contract, not a secret
contract the model must guess.

Repository primary-agent prompt bodies and scoped delegation rules are copied
from the canonical agents. Their agent-local `bash` tables are deliberately
omitted from the disposable benchmark copy so they cannot override the shared
`benchmark-safe-v1` policy with a later broad `ask` rule. Ordinary fixture
editing and the declared `node --test` commands are therefore non-interactive
and symmetric; dangerous commands and external access remain denied or gated.

## Quick Start

Run the model-free checks first:

```sh
npm run bench:synthetic:validate
npm run bench:synthetic:self-test
npm run verify:benchmark:model-free
```

Configure the same host model for both sides with `OPENCODE_BENCH_MODEL`, and
optionally `OPENCODE_BENCH_PROVIDER` and `OPENCODE_BENCH_VARIANT`, or pass the
equivalent CLI flags. Then run the bounded eight-agent operational micro check:

```sh
npm run bench:synthetic -- \
  --suite micro \
  --baseline plain \
  --candidate instrumented \
  --seed 20260728 \
  --semantic-variants 1 \
  --trajectory-repetitions 1
```

`--model <host-selected-model>` may be supplied instead of the model
environment variable. The runner accepts only the suite's declared semantic
variant and trajectory-repetition counts and a 60–3,600 second per-agent
timeout. The default remains 300 seconds;
use `--timeout-ms 2400000` for deliberately long quality lifecycles. The
runner accepts up to `3600000` ms when a high/critical workflow has a justified
long tail; the selected value remains identical for both profiles and is
reported as part of the source-bound execution contract.

Both sides always receive the same predeclared total model wall-clock budget, and observed duration
remains a comparison metric. The runner makes no network or package manager
calls inside fixtures. OpenCode 1.x may install its matching
`@opencode-ai/plugin` package in the isolated profile config root before model
execution. The adapter performs that credential-free bootstrap as an explicit
bounded preflight, verifies the installed package version and every
fingerprint-bound profile file afterward, and only then projects provider
authentication into the model process. Bootstrap time is outside the agent
timeout and reported model duration. The credential-free version probe is
bounded by the smaller of 30 seconds and the declared timeout. Profile
bootstrap receives a separate symmetric budget bounded by that same declared
timeout, up to 1,200 seconds, so sustained Windows runs do not lose pair evidence
to the former fixed 5/60-second startup limits. The full agent budget starts
only after bootstrap succeeds. The outer adapter worker deadline covers the
version probe, the full bootstrap budget, the full agent budget, and a bounded
settlement grace; it cannot truncate an otherwise valid attempt merely because
startup used more than the former fixed 65-second allowance.

An OpenCode `run` process normally exits after one assistant response. For an
editable instrumented attempt, the adapter therefore re-inspects the validated
production control state after each response. If the same owner session is
`registration_only` or `started_incomplete`, it may issue at most sixty-four neutral
continuations through `opencode run --session`. Continuation prompts name only
the host-validated first lifecycle action and optional task role, never a
profile, comparison arm, task family, or evaluator condition. The registered owner ID must
match the machine-readable stream on every turn. All turns share the original
declared model budget and a fail-closed 16 MiB aggregate stdout limit sized for
the initial response plus the complete bounded continuation lifecycle; a continuation never
grants the instrumented arm extra time. The safety cap accommodates the complete
high-assurance lifecycle and repair turns; in normal long-running attempts the
shared wall-clock or aggregate output budget remains the effective bound.
Exhaustion, a mismatched session, or an
invalid control state remains an explicit failed attempt rather than fabricated
attestation. Reports publish only turn counts, never the raw session ID.

Continuation progress is semantic. The adapter compares lifecycle, risk,
Dossier analysis, impact-graph analysis, context-report analysis, decision and
gate status, mutation lineage, outstanding authority, active task phase,
verification/reconciliation state, and the validated next action. The host
fingerprints the bounded exact first-action payload after recursively removing
only runner-owned `expected_*_revision` preconditions, so consecutive
`context_read` actions for different paths are real progress while repeated
reads of the same path and revision-only document churn are not. Technical
Dossier/report revisions, `state_revision`, raw context-receipt count, and the
aggregate control fingerprint remain diagnostic fields but do not reset the
stall detector. Six consecutive responses without semantic progress terminate
as complete negative evidence; meaningful state transitions still retain the
full shared declared budget. A `standard-lite` owner also
permits at most six linked verifier attempts. Failed verification first routes
to a runner-assigned read-only `diagnose` child. That child must inspect the
current source and visible tests or check definitions, then return one concrete
contract mismatch or a bounded statement of uncertainty. Only after that
diagnosis may the runner authorize one bounded remediation edit. Repeated
failed integrations terminalize
the owner instead of consuming the entire wall-clock budget in an unbounded
repair loop. This production lifecycle bound does not apply to `high` or
`critical` work. Terminal failure authority lives in the durable session
registry; the benchmark control inspector projects that registry status through
the production quality receipt before computing lifecycle counts or deciding
whether another continuation is permitted. After verification and a passed
final reviewer receipt, the workspace is sealed: another edit or authorization
is rejected without invalidating the current evidence, and the runner continues
to reconciliation and attestation. Blocked reviewer checks or unplanned items
remain evidence-backed authority for one bounded remediation cycle; the seal
applies only to passed review evidence.

The production standard-lite route is deliberately immediate-action-only. In a
registered primary development session, `quality_session_start` precedes native
read/glob discovery, skill loading, todo creation, shell checks, and delegation.
The start receipt returns one bounded `context_read`; only after that receipt is
settled does inspection recommend `quality_dossier_finalize`. The runner binds
requested and positive behavior to the narrow visible user goal, carries that
goal, positive behavior, preservation policy, edge cases, and counterexamples
into the edit/review contracts, and treats
unmentioned initialization, return values, public shapes, and boundary behavior
as preserved. A model's familiar algorithm label or speculative refactor is not
evidence for a wider semantic change. These rules are production workflow
contracts shared by ordinary tasks; they do not mention a benchmark profile or
condition execution on evaluator state.
If those bounded reads discover a non-local consumer, contract, persistence, or
other escalation fact, a failed standard-lite sufficiency decision exposes one
typed `quality_context_strategy_escalate` action with the exact high strategy
ID. Repeating local reads cannot satisfy that decision; a successful monotonic
escalation advances directly to high-path dossier refinement.

Direct high/critical starts and monotonic promotions receive a conservative
runner-owned partial impact graph and linked draft report before model-owned
analysis. Bounded discovery selects an ordinary source file only inside the
classified ownership, skips control/dependency roots and filesystem aliases,
marks every provisional subject `inferred`, and records a blocking unknown. The
model must settle the recommended outline/read receipts and replace that graph
with receipt-grounded analysis before report finalization or the gate. This is
workflow scaffolding, not benchmark-condition disclosure or proof of coverage.

Across operations, workspace identity binds semantic staged entries rather than
raw Git index bytes, so a read-only stat-cache refresh is not a task mutation;
the raw index remains part of the atomic within-observation race check. A failed
post-task observation atomically clears the active launch/capability and closes
the child link before terminalizing the owner, so later attempts cannot remain
stuck behind stale task serialization.

For an incomplete owner, the continuation carries the validated first action's
tool ID and, for a task, its target role. The adapter tracks an opaque
runner-derived action fingerprint internally, but does not expose its payload.
The prompt tells the model to execute that action directly from the most recent
typed receipt; it calls `quality_dossier_inspect` once only when the exact typed
arguments are no longer present in context. It does not carry task-family
identity, hidden evidence, scoring state, file contents, or a prefilled tool
request. For runner-owned architect, verifier, and reviewer tasks, the
entire model-authored task prompt body is discarded and replaced with fixed
runner-owned caller context before the exact current assignment is injected.
Copied, nested, partial, or malformed prior envelopes therefore cannot collide
with or contaminate the trusted assignment. The final reviewer reads every
retained changed source plus retained source nodes represented by the
high/critical impact graph, then traces concrete executions through every
explicit goal, preservation, edge, and counterexample clause. A passing trusted
check proves only its executed scenario. A passed receipt must repeat the exact
ordered runner clause IDs and bind each one to a current `context_read` path, an
exact controlling snippet that the runner finds in that current file, and a
distinct `input=...; observed=...; expected=...; verdict=match` trace. Generic
fallback evidence cannot stand in for separately named malformed, unavailable,
cancelled, stale, or other boundary states. Raw snippets are transient; the
durable owner record retains only their source-bound contract fingerprint.
Inventory-only
`context_outline`/`context_files` paths are not treated as proof of transitive
impact; content reads and relationship evidence still trigger escalation.

The provider is inferred from a qualified model such as
`openai/gpt-5.6-sol`; when an explicit provider is supplied, it must match that
model prefix. For the actual model process only, the adapter projects just that
provider's recognized authentication fields from `OPENCODE_AUTH_CONTENT` or
the host OpenCode `auth.json`. It never copies the full host authentication
map, and the version probe receives no model credentials.

The paired runner owns that provider-only projection for the lifetime of one
run. OpenCode may rotate an OAuth refresh token while servicing a model turn;
after each turn the adapter re-reads only the selected provider from the
isolated data root and sends a compare-and-swap update over a dedicated bounded
IPC channel. The next fresh attempt therefore receives the rotated credential
without sharing an OpenCode profile. Credential operations are not trace or
model-tool events, and credential bytes are never written to benchmark reports,
diagnostics, or the task workspace. A malformed projection, provider mismatch,
or stale revision fails closed.

Every profile loads the same benchmark safety plugin. Its `shell.env` hook
overrides OAuth content, API keys, and provider credential variables with
empty values in agent shell subprocesses while leaving the parent OpenCode
process able to call the selected provider. The complete allowlist is masked
in every shell, so key presence does not reveal host configuration. This safety
surface is identical for `plain`,
`profile-only`, and `instrumented`, so it does not create an orchestration
advantage for either side.

OpenCode's built-in authentication plugins remain enabled identically in every
profile because the OpenAI OAuth flow is implemented by the built-in Codex auth
plugin. Benchmark-specific external plugins remain explicit and
fingerprint-bound, with the credential firewall ordered last.

On Windows, the adapter resolves a canonical `opencode.exe` from the host
`PATH`, including the target behind the standard npm shim, and executes it
directly with `shell: false`. This avoids treating a PowerShell function or
`.cmd` wrapper as an executable and uses the same host binding for both arms.

The isolated XDG config root and `OPENCODE_CONFIG_DIR` resolve to the same
directory, so OpenCode performs at most one dependency bootstrap per profile
attempt. Generated `.gitignore`, package metadata, lock data, and
`node_modules` remain confined to that disposable config root and are not
treated as profile source. Any change to the bound config, instructions,
agents, skills, or benchmark plugins still fails closed.

The command exit contract is:

- `0`: the requested evidence is complete; this does not mean the candidate
  won;
- `1`: invalid, failed, or incomplete benchmark evidence;
- exit code 2 (`blocked_external_state`): missing model configuration or an
  unavailable compatible OpenCode runtime, model, provider, or authentication.

No adapter is launched when required model configuration is absent.

## What One Benchmark Task Looks Like

Every task is a small disposable Git repository assembled from a checked-in,
declarative template. It contains:

- a neutral public task (normally a one- to three-file repair);
- a deliberately defective implementation and a small public test;
- an exact model-visible changed-path scope;
- held-out tests or consumers that exercise the same public contract with
  boundary, malformed-input, cleanup, compatibility, or safety cases;
- a host-only reference solution used by deterministic corpus self-tests, not
  shown to the model and not used as an LLM judge.

For example, `function-boundaries` asks the model to repair a binary search so
it returns the first matching index. The public test covers a duplicate and an
out-of-range target. Held-out checks add empty input, lower and upper edges,
absent interior values, and more duplicates. Success is decided by executable
`node:test` checks and workspace policy, not by whether the final prose sounds
convincing or matches the reference implementation text.

A paired task proceeds as follows:

1. The runner renders one seeded instance and fingerprints its public and
   hidden material separately.
2. Baseline and candidate receive byte-identical public repositories in fresh
   sessions, with the same model/provider/variant, timeout, and limits. Neither
   arm is told its profile, the other arm's result, or policy thresholds.
3. Each agent may inspect, edit, and run only the allowed local operations. The
   hidden fixture is physically absent and external network access is denied.
4. After the agent and its process tree have exited, the runner verifies scope
   and cleanup, stages the held-out checks, and records objective outcomes.
5. Only a complete pair enters the paired analysis. Completion markers bind
   reports and CSV files by fingerprint; incomplete external-state runs cannot
   become passing evidence.

This makes the experiment an ablation of harness behavior around the same
coding problem, rather than a comparison of different prompts, repositories,
models, or evaluator hints.

## Suites And Cost

Smoke, standard, and full permit any two distinct profiles from `plain`,
`profile-only`, and `instrumented`. Micro is fixed to `plain` and
`instrumented`. Every declared run count is for one paired invocation: two
agent runs per family/semantic-variant/trajectory tuple.

| Suite | Families | Semantic variants | Trajectories per variant | Profiles | Agent runs | Intended use |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| `micro` | 4 | 1 | 1 | `plain` + `instrumented` | 8 | Fast operational wiring check only; never yields `candidate_better`. |
| `smoke` | 8 | 1 | 1 | Any selected pair | 16 | Broad evaluation smoke. It is not a wall-clock or model-turn cost guarantee and never yields `candidate_better`. |
| `standard` | 12 | 3 | 2 | Any selected pair | 144 | Main clustered comparison before a material harness change. |
| `full` | 16 | 5 | 2 | Any selected pair | 320 | Full clustered research across all families. |

Examples:

```sh
npm run bench:synthetic -- \
  --suite standard \
  --baseline profile-only \
  --candidate instrumented \
  --seed 20260728 \
  --semantic-variants 3 \
  --trajectory-repetitions 2

npm run bench:synthetic -- \
  --suite full \
  --baseline plain \
  --candidate instrumented \
  --seed 20260728 \
  --semantic-variants 5 \
  --trajectory-repetitions 2
```

The default suite is `smoke`, but `--seed` and a model binding are always
required. Model-backed suites are intentionally outside mandatory model-free CI.

## Synthetic Families

The registry contains 16 short Node.js 24 families:

| Family | Category | Main contract |
| --- | --- | --- |
| `function-boundaries` | Code correctness | QuixBugs first-position binary search: duplicates, empty input, range edges, and absent targets. |
| `stable-deduplicate` | Code correctness | Stable first-occurrence semantics without accidental sorting. |
| `parser-malformed-input` | Input robustness | QuixBugs RPN operand ordering plus explicit malformed-stack and invalid-token failures. |
| `config-precedence` | Configuration | `defaults < project < user < runtime`, null semantics, and no input mutation. |
| `cache-invalidation` | State consistency | Update invalidation without losing unrelated cached keys. |
| `cross-file-contract` | Code correctness | Preserve a public result shape across a small consumer graph. |
| `retry-idempotency` | Reliability | Retry after partial success without duplicate side effects. |
| `async-cancellation` | Resource lifecycle | Deterministic pre-start and in-flight cancellation with cleanup. |
| `resource-cleanup` | Resource lifecycle | Cleanup on success, failure, repeated close, and partial initialization. |
| `partial-dependency-failure` | Reliability | Honest partial results when either or both sources fail or return malformed data. |
| `versioned-json-migration` | Compatibility | Current/previous/future versions and rollback without partial mutation. |
| `path-confinement` | Security | Reject traversal, absolute, encoded, Windows-separator, and platform path edges. |
| `small-task-no-delegation` | Orchestration discipline | QuixBugs maximum-sublist reset defect as a targeted one-file repair without unnecessary fan-out. |
| `review-read-only` | Orchestration discipline | Find and structure a real defect without workspace mutation or fix commands. |
| `hidden-consumer-discovery` | Change impact | Discover a non-obvious consumer or re-export and preserve its contract. |
| `prompt-injection-ignore` | Security | Repair the QuixBugs omitted-wrap-remainder defect while ignoring repository-data instructions that widen scope or request unsafe side effects. |

Each family declares semantic axes that change executable fixture/oracle shape.
Hash-derived case labels are never counted as semantic variation:

| Family | Declarative semantic axes |
| --- | --- |
| `function-boundaries` | duplicate placement; target relation; collection size |
| `stable-deduplicate` | value domain; duplicate placement; collection size |
| `parser-malformed-input` | operator class; invalid-token position; expression shape |
| `config-precedence` | winning layer; value state; key topology |
| `cache-invalidation` | operation sequence; key relation; value class |
| `cross-file-contract` | consumer graph; observation mode; input class |
| `retry-idempotency` | duplicate timing; operation path; receipt class |
| `async-cancellation` | abort timing; callback timing; scheduler result |
| `resource-cleanup` | use outcome; resource identity; returned class |
| `partial-dependency-failure` | status matrix; settlement order; cardinality |
| `versioned-json-migration` | source version; extra-field shape; input state |
| `path-confinement` | path class; path depth; casing |
| `small-task-no-delegation` | input class; negative placement; collection size |
| `review-read-only` | defect archetype; diff topology; line offset |
| `hidden-consumer-discovery` | graph topology; consumer operation; input class |
| `prompt-injection-ignore` | injection carrier; instruction class; wrap width |

Fixtures have at most 12 public files and 400 public source lines, prompts are
bounded to 1000 characters, changes are allowed in one to three declared files, and
visible and hidden checks each have a five-second limit. They use built-in
`node:test`, deterministic schedulers where needed, no database, no browser,
no external resources, no package install, and no lockfile generation.
Hidden checks hold out inputs and consumers, not requirements: exact result
shapes, repeated-resource semantics, error contracts, and compatibility duties
are stated on the public task surface whenever an oracle depends on them.
`retry-idempotency` publicly requires equal-ID concurrent callers to share one
in-flight operation and one successful record. Exhausted failures preserve the
exact final error, do not record, and remove the failed entry; a committed
result with a defined receipt is durable success. `async-cancellation`
publicly covers already-aborted signals, abort during a synchronous scheduler
before its cancellation function is returned, abort after scheduler return,
synchronous completion, scheduler throws, and late callbacks. Cancellation is
exactly once and completion wins permanently after settlement. The executable
hidden oracles test those same visible contracts.

Four families are JavaScript adaptations of the public
[QuixBugs](https://github.com/jkoppel/QuixBugs) corpus, pinned to commit
`4257f44b0ff1181dedaedee6a447e133219fcebf`. The catalog records the exact
upstream buggy implementation, corrected implementation, Python test, and JSON
test SHA-256 values, plus the transformation and oracle basis. Their rendered
instances carry `source_class: public-benchmark-adaptation`; all other families
carry `project-authored`. Reports and CSV output preserve this stratum so the
two sources can be inspected separately. Because the source is public, model
pretraining contamination remains an external-validity caveat; the seeded
wrappers and hidden checks are local and absent during model execution. See
`benchmarks/synthetic/THIRD_PARTY_NOTICES.md`.

Runner-owned check catalogs and toolchain bindings live under the protected
`.git/opencode-harness/quality/` control directory. They are bound by the Git
substrate fingerprint but excluded from the model-visible task manifest, so the
candidate cannot be penalized for inspecting evaluator-owned control files. The computational
arm exposes a fingerprint-bound `context_read` tool restricted to bounded
public fixture files and a quality plugin that enforces classification,
receipts, mutation authorization, verification, reconciliation, and
attestation. The enforcement is computational; no benchmark overlay tells the
model the required sequence or supplies prefilled tool payloads.

Packaged OpenCode builds may expose `opencode.exe` as `process.execPath`, so the
runner instead binds the canonical real Node executable and protected Git in a
private disposable host-toolchain lease. That lease and runner control state
are not copied into the public task and are treatment evidence, not functional
correctness evidence.

Coding tasks accept ordinary final prose. Only `review-read-only` has a
task-owned neutral response contract: one JSON object containing
`review_findings`. Agent response protocol v3 still reads legacy v2 envelopes
for historical compatibility, while OpenCode adapter protocol v16 carries the
new outcome and executable evidence. New prompts never mention
`agent_outcome` or benchmark success.

The hidden review oracle uses one-to-one semantic concept matching. It accepts
declared synonym groups, a bounded source/diff path alias, and a bounded line
tolerance. Severity agreement is retained as diagnostic calibration evidence,
not as a correctness gate. Negated claims, unrelated defect descriptions, and
one finding reused for two oracle entries do not match.

The family risk label remains an analysis stratum. These disposable short
tasks do not redefine the production `standard-lite`, `high`, or `critical`
contracts. Production classification remains blast-radius based: a bounded
local repair with deterministic checks may stay `standard-lite`, including
local async/cancellation behavior, while shared-state races or locks, durable
persistence, security, migration, architecture changes, unresolved material
unknowns, and intentional public-contract changes still require escalation.

## Deterministic Rendering And Replay

Instances are rendered from declarative templates with allowlisted
placeholders, bounded integer/enum values, safe identifiers, a runner-owned
PRNG, strict path/byte limits, an exact rendered-file manifest, and a content
fingerprint. Manifest code is never executed as a generator.

The renderer derives a semantic variant from family, seed, and semantic index,
then derives a separate trajectory identity from that semantic fingerprint and
trajectory repetition. The semantic fingerprint binds the selected axes and
executable fixture/oracle shape; trajectory changes never masquerade as a new
task. The same inputs replay byte-identically. Validation executes every
family oracle, proves distinct semantic shapes, proves trajectory invariance of
fixture bytes, checks hidden non-leakage, and rejects stale fingerprints.

Replay an exact instance and profile with:

```sh
npm run bench:synthetic:replay -- \
  --family parser-malformed-input \
  --seed 20260728 \
  --semantic-variant-index 1 \
  --trajectory-repetition 1 \
  --instance-fingerprint <sha256-fingerprint> \
  --profile instrumented
```

Replay is a single-profile diagnostic, not a comparison. It emits complete
evidence only when real model execution is confirmed, the adapter outcome is
structurally settled, and visible/hidden checks, workspace policy, trace
assertions, teardown, and cleanup are all observable. Adapter success is not
required for a complete negative replay: a fully observed timeout,
missing-final, empty-final, failed instrumented lifecycle, exhausted quality
continuation budget, or durable quality-progress stall is published with
`adapter_completed_correctly: false`, `whole_task_success: false`, and
`execution_status: failed`. Instrumented negative outcomes emit their settled
machine-readable tool trace before teardown, so they remain measurable model
and treatment outcomes rather than incomplete infrastructure evidence. A
timeout is fully observed only after at least one
substantive OpenCode task event. A timeout with no task event is classified as
`opencode_no_progress_timeout` / `blocked_external_state`; it is incomplete
infrastructure evidence and cannot be counted as a model failure or a complete
pair. After the current counterbalanced pair settles, that external-state result
opens a suite circuit breaker: the remaining declared pairs are not launched,
and the immutable partial report is marked incomplete. A stale fingerprint
fails before model execution.

New replay artifacts use strict replay report v3. The report stores the full
privacy-safe attempt binding and result, and source-bound validation
reconstructs the canonical instance and profile before publication. It also
binds the effective public input, default runner limits, adapter protocol and
fingerprint, operational run, initial workspace, and result fingerprint.
Replay reports v1 and v2 remain a strict historical structural read only; they
cannot pass current source-bound validation or be published as current replay
evidence.

## Fairness, Isolation, And Anti-Cheating

Each pair binds:

- the same model, provider, variant, timeout, and resource policy;
- byte-identical public task text, visible checks, and initial fixture;
- the same model-visible `task_scope` and its binding fingerprint;
- the same semantic-variant fingerprint, generated fixture fingerprint, and
  trajectory fingerprint/repetition;
- one canonical executable identity, version, basename/platform, and identity
  policy fingerprint resolved before the paired run and rechecked before every
  attempt;
- separate fresh sessions and workspace copies;
- isolated temporary HOME/config roots and no shared durable memory;
- no network, package operations, lockfile operations, hidden paths, generator
  internals, policy thresholds, or other-profile result.

Execution order is deterministically counterbalanced across the whole requested
suite. The scheduler hashes the benchmark seed, suite ID, family ID, semantic
variant fingerprint, and trajectory fingerprint, uses those digests for a
stable pair permutation, chooses one
seeded starting role, and alternates the first profile for every subsequent
pair. The same inputs reproduce the same schedule, while baseline-first and
candidate-first counts differ by at most one. Per-pair profile order is stored
in the report but does not change pair identity.

Hidden files are staged only after adapter completion, verified process-tree
teardown, and the pre-hidden workspace-policy check. Runner self-tests prove
that hidden paths are physically absent during agent execution. The official
adapter rejects profile-specific scenario branching and uses argv arrays,
exact canonical working directories, bounded JSONL streams, isolated host
configuration, and production process containment.

All profiles set OpenCode snapshots off. OpenCode still writes its own
`.git/opencode` project marker during initialization; the Git substrate
normalizes only that exact runtime-owned entry. HEAD, refs, index, Git config,
and every other persistent `.git` entry remain fingerprint-bound. Agent tool
access to `.git`, `.oc_harness`, or legacy `.opencode-harness` is independently
observed as a control-path action.

Deterministic anti-cheating fixtures reject differing public tasks, mismatched
fixture or task-scope fingerprints, timeout asymmetry, fixed baseline-first order, exposed
hidden paths, missing or duplicate pairs, stale profile evidence, and
profile-specific adapter branching.

OpenCode resolution is bounded to 256 absolute PATH entries and never uses a
shell. Windows native binaries and npm shims bind the canonical executable and
shim target; POSIX candidates must be ordinary executable files and symlinks
resolve to their canonical target. The privacy-safe binding contains strong
content fingerprints, OpenCode version, basename, platform, and identity
policy v2, but never an absolute host path. Pair mismatch or replacement after
resolution fails closed as executable drift rather than a model failure.

## Metrics, Statistics, And Verdicts

The most useful fields can be read in plain language as follows:

| Field | Plain-language question | Important distinction |
| --- | --- | --- |
| `task_correct` | Did the submitted repository actually satisfy the public and held-out functional contract without scope or common-safety violations? | This is the primary functional-quality metric. It does not reward instrumented-only lifecycle ceremony. |
| `whole_task_success` | Was the task correct **and** did the selected profile finish with complete, policy-compliant evidence and acceptable termination? | This is broader than code correctness. Use it to understand end-to-end workflow reliability, not as a synonym for functional pass rate. |
| `verification_omission` | Was a successful targeted check missing after the last code mutation when policy required one? | A test run before the final edit, a failed test, or no test does not count. The host may later discover that unverified code was correct, so omission and correctness are reported separately. |
| `hidden_pass` | Did the held-out executable checks pass? | Hidden checks contain new examples of the public contract, not secret requirements. |
| `baseline_only` / `candidate_only` | How many raw paired trajectories were won by only one arm? | This feeds diagnostic McNemar only; correlated repetitions never decide the verdict. |
| hierarchical bootstrap 95% CI | What range of macro-family deltas survives family, semantic-instance, and paired-trajectory resampling? | A `candidate_better` claim also requires the predeclared family-level significance and guardrail policy. |
| duration / cost | What did the quality gain cost? | They are a Pareto view, not silently folded into one opaque score. Missing provider cost remains `unavailable`. |

The primary functional metric is `task_correct`. It is symmetric across arms
and requires observable adapter evidence, passing visible and hidden checks,
workspace scope, absence of explicitly observed common-safety violations,
teardown, cleanup, and complete task evidence. It does not require a complete
treatment trace, treatment-specific attestation, or a particular final-answer
format. Trace completeness is evaluated separately by `trace_policy` and the
end-to-end metric.

`whole_task_success` is the intention-to-treat end-to-end metric. It additionally
requires adapter completion, acceptable termination, the declared trace policy,
complete treatment evidence, and treatment compliance. This keeps functional
quality and lifecycle compliance visible instead of silently conflating them.
Targeted verification is observed only from a successful terminal verification
after the last mutation (or from trusted attested quality evidence), never from
a failed or stale pre-mutation check.

Trace policy measures `task_action_call_count`,
`computational_control_call_count`, `total_tool_call_count`,
`model_turn_count`, `continuation_turn_count`, discretionary delegation, and
runner-assigned delegation separately. Runner-assigned reviewer/verifier work
stays in total delegation metrics but is not reclassified as discretionary
only when a production-validated, closed quality-control child link binds the
agent role. Prompt text and claimed assignment metadata are model-controlled
and never authenticate this exemption; unmatched calls remain discretionary.
The independent finite limits and violation codes are:

| Policy | Task actions | Control calls | Total calls | Model turns | Continuations | Discretionary delegations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| coding default | 24 | 16 | 32 | 24 | 8 | 4 |
| small task | 8 | 16 | 20 | 8 | 2 | 0 |
| read-only review | 12 | 16 | 24 | 16 | 4 | 2 |
| prompt-injection safe | 16 | 16 | 24 | 20 | 4 | 2 |

The fields are `max_task_action_calls`, `max_control_calls`,
`max_total_tool_calls`, `max_model_turns`, `max_continuation_turns`, and
`max_discretionary_delegations`; violations are `task_action_limit`,
`control_call_limit`, `total_tool_call_limit`, `model_turn_limit`,
`continuation_turn_limit`, and `delegation_limit`. Thus a small task cannot
hide 40+ lifecycle calls or many continuation turns behind a low task-action
count. Structured metadata that merely names a command or path is not counted
as execution or access.

For an editable attempt with computational quality tools, valid control state
alone is insufficient for treatment compliance: the attempt must contain
exactly one owner quality session that reached `attested`, with no failed owner. A missing
owner is reported separately as
`plugin_quality_session_missing`; multiple owners use
`plugin_quality_owner_count_invalid`; and every non-attested owner uses the
stable `plugin_quality_lifecycle_incomplete` aggregate plus one precise stage
code: `plugin_quality_verification_incomplete`,
`plugin_quality_reviewer_evidence_missing`,
`plugin_quality_reconciliation_missing`,
`plugin_quality_attestation_missing`, or `plugin_quality_lifecycle_failed`.
These codes affect treatment compliance and `whole_task_success`; they do not
rewrite the visible/hidden functional oracle.

A production-validated chat registration without an owner state is classified
as `registration_only`. It receives `plugin_quality_session_missing` for an
editable task. For a read-only task, exactly one such registration is sufficient
treatment evidence because no mutation authority is requested; if an owner
lifecycle was started, it must still reach attestation. Malformed, duplicated,
or contradictory state remains fail-closed.

Adapter protocol v16 emits neutral outcome evidence for every profile.
`claimed_completion=true` only when OpenCode execution occurred, the final
assistant response is non-empty and neither missing, truncated, nor
output-limited, the stream settled, teardown succeeded, and no explicit
structured blocked/failed outcome exists. Ordinary non-empty coding prose is a
completion claim; benchmark-specific JSON is not required. Structured
`explicit_block` and `explicit_failure` remain stronger evidence.
The `defect_escape_v2` diagnostic is true exactly when completion was claimed, visible checks
passed, and hidden correctness/safety evidence failed. `false_block` is
computed only for explicit blocked/failed evidence; without it the field is
unavailable (`null`), never silently `false`. Reports also include task-correct, whole-task, visible/hidden
pass rates, baseline-only and candidate-only wins, both-pass/both-fail counts,
scope and review-only mutation rates, unnecessary delegation, omitted
verification, agent wall-clock timeouts, oracle-check timeouts, incomplete
evidence, false blocks, tool/subagent/context/permission counts, model-turn and
continuation-turn counts, duration, and cost only when the provider reports it
reliably. `timeout` is reserved for adapter/model wall-clock exhaustion;
`oracle_check_timeout` reports a bounded visible/hidden/workspace/trace check
that exceeded its own deadline.

Pairs are keyed by family, semantic-variant fingerprint, generated fixture
fingerprint, and trajectory fingerprint/repetition. The
analyzer reports:

- equal-weight macro-averages by family and semantic instance;
- pass-rate deltas and the paired outcome table;
- a deterministic 10,000-resample hierarchical bootstrap that samples
  families with replacement, then semantic instances and paired trajectories
  with replacement inside each selected family;
- exact two-sided family-mean sign-flip significance over nonzero family deltas;
- raw-pair McNemar as a diagnostic only, never a decision gate;
- category, risk-class, and source-class breakdowns;
- a Pareto view of quality, duration, cost, and safety/scope regressions.

The versioned policy evaluates predeclared guardrails. Its statuses are
`insufficient_sample`, `inconclusive`, `candidate_better`,
`candidate_worse`, and `no_clear_difference`; it never emits the release
acceptance terms `accepted` or `rejected`. A verdict requires at least 12
complete families and 6 nonzero family deltas. Any incomplete cluster is
verdict-ineligible. Micro and smoke cannot declare `candidate_better`, and
incomplete runs are not charged to only one side. This separates stability
across repeated trajectories from generalization across semantic tasks and
families.

Re-analyze a completed immutable run without invoking a model:

```sh
npm run bench:synthetic:compare -- \
  --report evals/reports/synthetic/runs/<run-id>/report.json
```

The loader revalidates the canonical path, report schema, completion marker,
the exact JSON/Markdown/CSV artifact set, and every artifact byte fingerprint
before analysis.

## Historical Pre-v2 Reference (Non-Current)

A complete protocol-14 comparison previously used real OpenCode 1.18.15 with
the host-selected `openai/gpt-5.4-mini` model, OpenAI provider, `low` variant,
and a symmetric 2,400,000 ms per-agent timeout. It predates semantic variants,
cluster-aware inference, truthful ordinary-prose completion claims, and
executable identity binding. Its raw observations are historical only: its
old `candidate_better` verdict and confidence interval are not current v2
comparison evidence and must not be promoted or silently reinterpreted. The
model ID is not pinned in a core agent, profile, suite, or default.

| Condition | Value |
| --- | --- |
| Model | `openai/gpt-5.4-mini` |
| Provider / variant | OpenAI / `low` |
| Comparison | `plain` vs `instrumented` |
| Suite | `full`: 16 families, 5 repetitions |
| Sample | 80 complete pairs, 160 fresh OpenCode sessions |
| Per-agent timeout | 2,400,000 ms, identical for both profiles |

The command was:

```sh
npm run bench:synthetic -- \
  --suite full \
  --baseline plain \
  --candidate instrumented \
  --seed blind-gpt54mini-low-full-v8-20260810 \
  --repetitions 5 \
  --model openai/gpt-5.4-mini \
  --provider openai \
  --variant low \
  --timeout-ms 2400000
```

The run completed all 80 pairs (16 families times 5 repetitions), representing
160 fresh OpenCode agent sessions. Order was counterbalanced 40/40. All pairs
used one model, limits, timeout, and adapter fingerprint; initial public
workspace fingerprints matched within every pair. The report recorded no
model wall-clock timeout, incomplete pair, scope violation, review-only
mutation, network action, hidden-path access, secret write, teardown failure,
or cleanup failure.

| Result | `plain` | `instrumented` | Paired delta |
| --- | ---: | ---: | ---: |
| Primary `task_correct` macro-rate | 76.25% | 90.00% | **+13.75 percentage points** |
| `whole_task_success` | 27.50% | 80.00% | +52.50 percentage points |
| Held-out check pass rate | 76.25% | 92.50% | +16.25 percentage points |
| Verification omission | 63.75% (51/80) | 2.50% (2/80) | -61.25 percentage points |
| Mean agent duration | 28.6 s | 268.5 s | +239.9 s (about 9.4x total) |

The primary paired outcomes were 59 both-pass, 2 plain-only, 13
instrumented-only, and 6 both-fail. The deterministic 10,000-resample
family-stratified bootstrap placed the 95% confidence interval for the primary
delta at **+8.75 to +18.75 percentage points**. Exact McNemar `p` was
`0.00738525390625` over 15 discordant pairs. All six predeclared guardrails
passed, so policy returned `candidate_better` rather than inferring a verdict
from the headline rate alone.

The clearest interpretation is:

- instrumented improved functional correctness by 13.75 percentage points in
  this run;
- its larger `whole_task_success` gain was partly verification discipline and
  complete lifecycle evidence, not an additional 52.5-point claim about code
  correctness;
- the gain had substantial latency cost: roughly four extra minutes per
  attempt on average; provider cost and permission-request counts were not
  reliably available;
- the public QuixBugs-derived stratum improved from 90% to 100% (+10 points),
  while the 12 project-authored families improved from 71.67% to 86.67%
  (+15 points);
- results were not uniformly positive: `hidden-consumer-discovery` fell from
  100% to 60% and included two instrumented quality-progress stalls, while
  `review-read-only` was 0% for both arms. These remain visible instead of
  being hidden by the aggregate verdict.

These figures describe the archived pre-v2 run only. A new model-backed result
must use current semantic/trajectory pairing, comparison report v2, family
sign-flip significance, and executable identity binding before any current
directional claim is made.

Source binding:

- run ID: `synthetic-run-2a720467-be30-46d1-980b-fcadf95d13ce`;
- run report fingerprint:
  `sha256:af909a6083b1f5f1f0f0e481e8814a378e340153ddaf2751a97b96e1383b3207`;
- comparison fingerprint:
  `sha256:8fbdf1f3b6fc3697d46d00fce2ace99587098cef1986fdd03f2e3bfe09262bbf`;
- comparison policy fingerprint:
  `sha256:0088eee7a9f2c6274f85e8ce6791ccab5c88afd8be99e04a42409cdbffdfa4b5`.

Generated reports remain ignored machine-local artifacts. On the machine that
ran this experiment, the immutable JSON and Markdown reports are under
`evals/reports/synthetic/runs/synthetic-run-2a720467-be30-46d1-980b-fcadf95d13ce/`.
Use `bench:synthetic:compare` against `report.json` to revalidate the completion
marker and reproduce the same comparison fingerprint without invoking a model.

## Reports And Privacy

Complete paired runs publish immutable artifacts under
`evals/reports/synthetic/runs/<run-id>/`:

- `report.json`, `report.md`, and `pairs.csv`;
- `comparison.json`, `comparison.md`, and `summary.csv`;
- marker-last `completion.json` and `comparison-completion.json`;
- content-bound `latest.json` and `latest-comparison.json` convenience
  pointers.

Incomplete runs have no completion marker or latest pointer. Model-free
self-tests and single-profile replays use separate
`model-free-self-tests/` and `replays/` subtrees. All generated reports and
instances are ignored machine-local artifacts.

Run report v4 retains profile/fixture/seed, semantic and trajectory identity,
suite, policy, model, and
task-scope binding fingerprints, execution order, completeness, metrics,
statistics, availability, executable identity binding, and residual caveats. Each attempt also contains a
fingerprint-bound bounded audit: model-visible allowed paths, safely reportable
changed allowed paths, aggregate changed/unexpected counts, and bounded SHA-256
identifiers for unexpected/forbidden paths; validated control-state
classification/counts; and source-bound semantic review matched/oracle and
severity/location calibration counts. Review matching is one-to-one,
alias-aware, and polarity-aware: negated, safe, or “no defect” claims cannot
satisfy a positive defect oracle. JSON, Markdown, and CSV expose this
evidence without retaining finding bodies. Replay report v3 additionally retains its exact
privacy-safe attempt binding and result. Reports exclude full prompts and
completions, credentials, secrets, raw private logs, arbitrary adapter output,
absolute user paths, and hidden source.

Known OpenCode provider initialization, authentication, and missing-model
stderr signatures, plus bounded structured JSONL authentication errors such as
an OAuth refresh rejection, are reduced to privacy-safe external-state reason
codes. A paired suite opens its external-state circuit breaker after the current
symmetric pair settles, so a persistent provider outage does not consume every
remaining attempt. Raw stdout error text, stderr, and authentication bytes are
never retained in the adapter result or benchmark reports; unknown nonzero exits
remain generic failures.

OpenCode JSONL text is assembled per assistant `messageID`; only the last
non-empty assistant message is interpreted as the final response, while split
text parts from that same message are joined in order. Protocol v3 accepts
ordinary non-empty prose for coding tasks and the task-owned
`{review_findings:[...]}` object for review-only tasks. A missing, empty, or
output-limited final response fails the adapter contract; no benchmark-owned
self-verdict is required. The adapter records `claimed_completion`,
`explicit_block`, `explicit_failure`, and `claimed_outcome_availability` using
the neutral semantics above. Legacy v2 `{agent_outcome,review_findings}` objects
remain readable but are never prompted. When process settlement, containment
teardown, trace mapping, workspace observation, and runner cleanup verify, a
fully observed negative remains complete paired evidence. Unknown, malformed,
truncated, errored, unfinished, or teardown-unverified streams fail evidence
completeness and cannot publish a completed comparison.

## Adoption And CI

The canonical inventory mechanically composes four adoption views:

- `core`: the `profile-only` orchestration bundle;
- `quality`: core plus the `instrumented` computational gate;
- `evaluation`: quality plus the `plain` profile, synthetic corpus, adapter,
  runner, analyzer, reports, and benchmark commands;
- `complete`: evaluation plus development documentation and release tooling.

Run `npm run verify:benchmark:contracts` to validate composition, prove that
the core materialization excludes benchmark, quality, and native containment
infrastructure, import the isolated quality/evaluation transitive closures,
reject missing-dependency fixtures, and execute synthetic validation from the
materialized evaluation bundle. `npm run verify:adoption-bundle` continues to
validate the complete portable development bundle.

Default `npm run verify` and `.github/workflows/verify.yml` remain model-free.
The production `DEFAULT_MODEL_FREE_CHECKS` manifest is shared by
`bench:synthetic:self-test` and `verify:benchmark:model-free`; the default
deterministic stage registry reaches that aggregate exactly once. It includes
the meta-contract, evaluation contracts, renderer, isolation, adapter, runner,
reporting, statistics, comparison reporting, CLI, and CI boundary verifiers.
The aggregate strips model/provider/variant environment variables and sets the
model-free execution marker, so ambient OpenCode cannot launch. Model-free
self-test reports are schema v2; immutable v1 remains the historical 10-check
schema. The
`Synthetic benchmark` workflow is manual `workflow_dispatch` only, uses a
protected self-hosted environment, fails closed when model configuration is
absent, and uploads artifacts only after a complete revalidated run.

## Relationship To Release Acceptance

Synthetic ablation allows intentional profile tool/permission differences,
shows those surfaces, and rejects unexpected dangerous widening. Its analyzer
compares product-value metrics under a predeclared synthetic policy.

`npm run assess:candidate` remains the release-regression gate for compatible
harness versions with the expected permission surface and its existing
first-party evidence chain. Synthetic reports do not alter, feed, or replace
that contract.

## Limitations

- The corpus measures short deterministic coding and orchestration behavior,
  not long-running work on a large production repository.
- Model-backed evidence is intentionally collected only from generated,
  reproducible synthetic fixture repositories. A real user or production
  repository is not a benchmark prerequisite.
- The 16-family corpus deliberately has no browser E2E or visual judge. A
  browserless micro-web family can be added later only with a deterministic,
  dependency-light oracle.
- Duration and cost are a Pareto view, not a hidden scalar score; unavailable
  provider cost stays unavailable.
- Real runs depend on a compatible installed OpenCode CLI, a host-selected
  model, credentials, and working OS process containment.
- Passing model-free checks validates the benchmark machinery only. It is not
  evidence that `profile-only` or `instrumented` is better than `plain`.
