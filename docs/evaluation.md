# Evaluation And Candidate Decisions

The repository separates deterministic contract verification, installed
runtime verification, actual live behaviour, and candidate acceptance. No one
layer substitutes for another.

The feedback-plane commands and package entry points below describe the
unreleased `0.3.0` development target. They are not exports of tagged `v0.2.0`.

These sensors remain mapped to the [Harness Control Map](harness-map.md). The
deterministic contract/config evaluation includes the `trace-contract`,
`budgeted-termination`, `subagent-result-schema`, and `adversarial-fixtures`
static behavior contracts. Live manifest verification includes the fixture
path-boundary sensor. Optional general live regression evaluation remains
outside the default model-free gate.

## Four Assurance Layers

| Layer | Command | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Deterministic repository verification | `npm run verify` | Static structure, feedback foundation, trace store, immutable report history, adapter process-tree boundary, contract/config evaluation, drift, runtime parser fixtures, 12+1 corpus validation, infrastructure tracing self-test, and acceptance-engine self-tests. It requires no model, network, or installed live adapter. | Actual model behaviour or the installed profile. |
| Installed permission surface | `npm run verify:runtime` | Current `opencode debug` output and effective tool/delegation permissions. | End-to-end task quality. |
| Actual behavioural evaluation | `npm run eval:live` | Real adapter/model/tool behaviour on isolated baseline/candidate copies with hidden evidence. | Deterministic CI assurance or permission compatibility by itself. |
| Candidate decision | `npm run assess:candidate` | Deterministic, policy-backed `accepted`, `rejected`, or `inconclusive` decision over trusted paired evidence. | Automatic harness mutation or deployment. |

The infrastructure self-test exercises tracing, receipts, job lifecycle,
baseline/candidate isolation, hidden staging, and immutable history without an
LLM. It belongs to the `infrastructure` suite and does not count toward
acceptance metrics. Static behavior contracts do not claim actual model
behaviour was tested.

## Deterministic Commands

Run the complete local/CI gate:

```sh
npm run verify
```

The component commands are:

- `npm run verify:static` — structural prompt/config/docs contracts;
- `npm run verify:feedback-foundation` — canonical data, privacy, atomic file
  primitives, and confinement;
- `npm run verify:trace-store` — schema v2, v1 reads, quotas, finalization
  consistency, structured findings, redaction, immutability, and path safety;
- `npm run verify:report-history` — confined immutable report generations,
  JSON/Markdown fingerprints, and coherent latest markers;
- `npm run verify:adapter-worker` — IPC timeout, trace quotas, and verified
  Windows/POSIX process-tree teardown;
- `npm run eval` — deterministic contract/config evaluation;
- `npm run verify:drift` — release metadata and documentation drift;
- `npm run verify:adoption-bundle` — isolated source-bundle copy, public export
  import, manifest validation, and buffered self-test without a live provider;
- `npm run verify:runtime:fixture` — deterministic parser fixtures only;
- `npm run verify:live-manifests` — exact 12+1 corpus, suites, selection, and
  declarative trace assertions;
- `npm run verify:live-eval` — manifest validation plus infrastructure runner
  self-tests without a model, including a no-process in-memory/batch-commit test
  and the real process-tree teardown test;
- `npm run verify:acceptance` — accepted/rejected/inconclusive engine cases.

Optional `HARNESS_CHECK_LINKS=1 npm run verify:drift` enables network link
checks; the default `npm run verify` remains network-free.

## First-Party Acceptance Evidence

Capture immutable static-verification evidence for each source snapshot used by
an installed baseline or candidate profile. Use two explicit absolute checkout
roots; evidence paths are owned by the checkout in which the producer ran. The
candidate artifact is also the mandatory static-verification hard-gate input:

```sh
BASELINE_ROOT="/absolute/path/to/baseline"
CANDIDATE_ROOT="/absolute/path/to/candidate"

cd "$BASELINE_ROOT"
npm run evidence:static -- --candidate-id baseline-v1

cd "$CANDIDATE_ROOT"
npm run evidence:static -- --candidate-id candidate-v1
```

This command captures tracked and untracked non-ignored files into an external
materialized snapshot, fingerprints the exact content/mode manifest, verifies
the snapshot before and after running `npm run verify` inside it, and then
checks that the source still matches. A changing source, changed snapshot,
interrupted command, or failed verify cannot become passing complete evidence.
The verification command runs in a bounded managed process tree. A timeout or
unverified descendant teardown stops before evidence publication; command exit
alone is not treated as settled execution.
Snapshot deletion uses bounded retries, and the evidence producer retries a
transient cleanup failure before publication. If cleanup still cannot be
confirmed, a separately owned recovery pass is attempted. A permanent failure
stops before evidence publication and reports only the harness-owned OS
temporary entry name; operators must release the blocking handle and remove
that entry. No failed-cleanup artifact can be mistaken for acceptance evidence.

Record the absolute JSON path printed by each producer, then capture trusted
installed runtime permission snapshots separately for both profiles. Do not
reuse one relative `.oc_harness/evidence/...` path from a third working
directory for both checkouts:

```sh
BASELINE_ROOT="/absolute/path/to/baseline"
CANDIDATE_ROOT="/absolute/path/to/candidate"
BASELINE_STATIC_JSON="$BASELINE_ROOT/.oc_harness/evidence/<baseline-static>.json"
CANDIDATE_STATIC_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<candidate-static>.json"

cd "$BASELINE_ROOT"
npm run verify:runtime -- --evidence-profile baseline-v1 \
  --subject-evidence "$BASELINE_STATIC_JSON"

cd "$CANDIDATE_ROOT"
npm run verify:runtime -- --evidence-profile candidate-v1 \
  --subject-evidence "$CANDIDATE_STATIC_JSON"
```

These artifacts also live under `.oc_harness/evidence/`. Fixture-backed
runtime parser output remains valuable deterministic coverage, but a snapshot
whose source is `fixture` is not trusted for acceptance; acceptance requires
first-party `installed_runtime` evidence with the expected producer ID and
matching profile ID. The producer obtains the authoritative installed-agent
inventory from `opencode agent list`, then parses the complete permission
container for config and every discovered agent. The normalized `{name, mode}`
inventory is fingerprinted; required primary/subagent modes and exclusive web
and `oc_learning_*` boundaries are checked across all discovered agents,
including exact `oc_learning_...` grants that could override a denied wildcard.
Missing, empty, malformed, or ambiguous inventory fails closed. An unparsed,
unknown, or missing permission leaf is incomplete and never synthesized as
`deny`.

Permission evidence binds the static subject fingerprint, a digest of the
resolved runtime outputs, and the normalized permission-surface fingerprint
into one content-derived profile fingerprint. Live reports must match that
profile fingerprint and the candidate repository fingerprint. A stale or mixed
evidence chain is inconclusive.

## Acceptance Policy

`evals/acceptance-policy.json` is versioned and fingerprinted. Assessment pairs
results by `scenario_id` plus `repetition`, never array position, and evaluates
independent hard gates rather than reducing quality to one scalar score:

Every `policy.target.scenario_ids` entry must belong to the policy's exact
`target.failure_family` in the canonical checked-in corpus. A caller-supplied
policy cannot relabel unrelated scenarios into the target metric.

Only reports with exact immutable-history attestations are trusted. The
canonical validated scenario corpus supplies each scenario fingerprint and
required repetition; corpus and pair-universe fingerprints are recorded in the
decision, so caller-supplied lowered universes cannot produce `accepted`.

- candidate static verification passed;
- static, permission, and live evidence identities match;
- effective permission surface did not widen;
- canary regressions are zero;
- held-out regressions are zero;
- no new hidden-check failure was introduced;
- every required baseline/candidate pair is complete and comparable;
- the configured target failure family improved by the threshold;
- configured cost and duration ceilings were respected.

Reason codes identify failed and inconclusive gates, for example
`CANARY_REGRESSION`, `HELD_OUT_REGRESSION`,
`NEW_HIDDEN_CHECK_FAILURE`, `PERMISSION_SURFACE_WIDENED`,
`MISSING_STATIC_VERIFICATION`, `MISSING_REQUIRED_PAIR`,
`INCOMPLETE_LIVE_REPORT`, and
`MISMATCHED_CANDIDATE_EVIDENCE_FINGERPRINT`. Missing, malformed, untrusted,
mismatched, or incomplete mandatory evidence always produces `inconclusive`,
even when another complete gate failed: the whole decision `inconclusive`
precedes rejection. `rejected` therefore requires a complete evidence set with
at least one failed hard gate.

Example assessment:

```sh
BASELINE_ROOT="/absolute/path/to/baseline"
CANDIDATE_ROOT="/absolute/path/to/candidate"
CANDIDATE_STATIC_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<candidate-static>.json"
CANDIDATE_REPORT_JSON="$CANDIDATE_ROOT/evals/reports/<report>.json"
BASELINE_PERMISSIONS_JSON="$BASELINE_ROOT/.oc_harness/evidence/<baseline-permissions>.json"
CANDIDATE_PERMISSIONS_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<candidate-permissions>.json"

cd "$CANDIDATE_ROOT"
npm run assess:candidate -- \
  --report "$CANDIDATE_REPORT_JSON" \
  --baseline-id baseline-v1 \
  --candidate-id candidate-v1 \
  --static-evidence "$CANDIDATE_STATIC_JSON" \
  --baseline-permissions "$BASELINE_PERMISSIONS_JSON" \
  --candidate-permissions "$CANDIDATE_PERMISSIONS_JSON"
```

The CLI writes immutable JSON/Markdown plus `.complete.json` under the ignored
`evals/decisions/` directory. A non-accepted decision exits with code 2. The
decision is evidence only; it is never applied automatically to the active
harness.

## Behaviour Contracts And Corpus

`scripts/evaluate-harness.mjs` checks that guides, sensors, permissions, and
static fixtures encode expected behaviour. Covered contracts include bounded
recursive context, read-only review, small-task routing, architecture/quality
gates, dangerous-command approval, project-local knowledge, trace and
termination schemas, structured subagent handoff, and static adversarial
fixtures.

The live corpus under `fixtures/live/`, `evals/scenarios/`, and
`evals/hidden/` adds twelve distinct behavioural mechanisms: small local work,
broad audit, visible-plus-hidden bug, related call path, read-only review,
prompt-injection data, fake secret bait, stale context, conflicting write
scope, weak handoff, project-local knowledge, and approval-gated destructive
work. See [live-evaluation.md](live-evaluation.md).

## Operational Versus Durable Memory

`.oc_harness/` is ignored machine-local operational evidence for runs and
acceptance inputs. It is bounded, redacted, and disposable. Durable semantic
memory remains the separately gated `global-memory`/`improver` mechanism;
project facts remain in project-local workflow files and skills. Evaluation
does not create a semantic index, autonomously mutate the harness, or perform
candidate search.

## Engineering Dossier assurance

The repository has three distinct operating modes:

Profile-only mode
  Prompt-level quality workflow.

Instrumented quality mode
  Dossier, gate, workspace binding, verification evidence, and mutation
  enforcement through the installed quality bridge.

Live-evaluation mode
  Isolated scenarios, hidden checks, immutable reports, and runner-owned
  assertions.

The project-local `.opencode/plugins/engineering-dossier.mjs` bridge exposes
only the eight `quality_*` tools documented in the README. Agents can author
dossier content, but runner-owned code derives workspace fingerprints, evaluates
the gate, issues one-shot capabilities, validates canonical verification
receipts, and creates the final attestation. Finalizing a dossier does not pass
the gate.

Native `edit`, `write`, `apply_patch`, and writable `task.general` delegation
are denied in `tool.execute.before` before a passed gate. A post-gate capability
is bound to one session, one native call, and the dossier ownership paths.
Per-path content/index hashes detect repeated changes to files that were already
dirty. Successful and host-reported failed tool calls reconcile durable pending
state and invalidate earlier verification when content changed. Corrupt, stale,
replayed, cross-session, or unresolved restart state fails closed.

Architect, reviewer, verifier, and general subagent sessions are represented by
minimal child links rather than cloned parent state. Read-only contributions and
trusted verification update the parent owner record; a writable general child
is confined to the one serialized delegated path set. When
`quality/architecture-policy.json` exists, its validated identity is bound at
dossier creation. High/critical sessions require one integration-only
architecture graph check. The runner binds its final generated output to the
trusted receipt and requires the check to create or rewrite that output during
the current contained run; an unchanged pre-existing graph is rejected as
stale. It then extracts and evaluates the final graph against the policy and
baseline and repeats that evaluation during finalization. Missing, stale,
unavailable, failed, or violating post-edit evidence prevents attestation even
when ordinary tests pass.

The installed API exports `permission.ask`, `tool.execute.before`,
`tool.execute.after`, and `event` hook types. OpenCode 1.17.20 executes the
pre/post tool callbacks around native tool execution, but its permission service
does not invoke the declared `permission.ask` plugin callback. The bridge uses
the pre-tool callback as its hard boundary and keeps permission handling only as
compatibility defense. `npm run probe:runtime:quality-plugin-api` is the separate
optional installed-API/factory probe; it accepts the expected pre-gate denial
only when the plugin throws the exact `ContractError`. It does not prove host
plugin discovery, callback invocation, or effective adopted permissions.

The `session.created` event identifies the parent session but not the task call
that created it. One-at-a-time task serialization makes child binding
deterministic by cardinality, but not cryptographically causal. The API also
does not independently label a session high/critical before the dossier is
created; leaving uninstrumented sessions open is what keeps `standard-lite`
work lightweight, so the prompt workflow remains the classification trigger.
Native Bash is disabled for instrumented quality sessions, including after the
gate; repository commands run only through fingerprint-bound project-catalog
checks. On Windows those checks and adapter workers are placed in a Job Object
before initialization. On Linux they enter only a pre-delegated writable cgroup
v2 root through a fixed narrow attach helper while the coordinator/watchdog stay
outside. The guard cgroup and its migration controls must be non-writable by the
workload principal. Root-level `cgroup.kill` therefore still covers a workload
that moves from the initial leaf into the root or a sibling. Teardown is
accepted only after hierarchical `cgroup.events` reports `populated 0` and all
descendants are removed while the delegated root remains; a process group is
never containment proof.

macOS uses a different verified boundary because it has no public cgroup or Job
Object equivalent. `macos-exclusive-uid-v1` requires the complete coordinator
chain to run under one dedicated, non-root, non-admin real UID with no unrelated
same-UID processes. A root-owned, singly linked, mode-`0555` native controller
under canonical root-owned ancestry that is also non-writable under effective
ACLs binds preserved coordinator ancestors by PID and start
time. Every other process with that real UID is stopped to a fixed point and
killed, including detached, reparented, and double-fork descendants. Successful
teardown requires two empty UID scans with no zombies. EOF after coordinator
death invokes the same cleanup, and a second concurrent scope is rejected.
The controller's ten-second teardown bound is paired with a longer parent-side
close-confirmation window, so the parent cannot declare failure and return while
the native teardown is still within its own advertised deadline.
Ordinary interactive accounts, UID mismatch, controller identity drift, a
non-exclusive UID, or missing controller configuration all fail closed as
unavailable. This mechanism assumes the workload account has no sudo, setuid,
or other privilege-changing path; it is process-lifecycle containment, not a
privilege-escalation, filesystem, or network sandbox.
The root-owned executable is not setuid and the watchdog runs as the workload
UID. Deliberate same-UID attacks on the watchdog are outside the trusted-check
threat model; unexpected controller exit still fails the receipt closed, but is
not represented as adversarial sandbox enforcement.

Containment readiness has its own bounded setup deadline; the check/adapter
execution timeout starts only after readiness. Adapter working directories are
identity-bound before and after spawn, after containment, and again inside the
worker before project code import.

`npm run verify:runtime:quality-hooks` classifies host discovery, callback
invocation, child causality, and permission-hook wiring independently from the
installed API/factory probe. Profile prompts remain defense in depth.

All dossier consumers import
`requiredEngineeringVerificationTargets(dossier)`. It includes boundary
checks, every explicit verification-plan/slice/handoff check, integration
checks, boundary mechanisms, required obligations, every
applicable mapping from invariants, edge cases, failure modes, premortem rows,
counterexamples and specialized checks, plus rollback/recovery. Missing trusted
evidence is never converted into a pass.

Quality acceptance is model-neutral. It compares canonical verification
coverage and non-scalar violation counts for general baseline/candidate harness
regression outcomes. Optional host-supplied model metadata is informational and
does not affect the decision. The acceptance input is an explicit, validated,
model-neutral runner/session artifact bundle that binds both roles to the same
canonical scenario and verification-target universe and carries the trusted
dossier, integrated-verification evidence, and outcome attestations. A
standalone self-described outcome or report is never a trusted acceptance
input; missing, narrowed, forged, or incomplete bundle evidence is
`inconclusive`, never `accepted`.

The production `eval:live` entrypoint keeps the generic live-evaluation path.
When a selected scenario has a validated quality sidecar, that same runner
constructs the bound quality artifact bundle and invokes canonical
runner-integrated verification while creating its receipt. Quality sidecars do
not create a second model-comparison runner or bypass the generic workspace,
hidden-check, teardown, and report boundaries.

The default deterministic boundary is:

```powershell
npm run verify
```

It requires no model, credentials, network, live adapter, or installed OpenCode
runtime. The normal-session bridge, classification, catalog, trusted runner,
bounded workspace observer, trusted toolchain resolver, process-containment
contract, native-Bash denial, public plugin export, canonical-target, and
deterministic runtime-fixture checks are stages inside that aggregate. The
fixture executes ten structured edit-flow scenarios through real plugin hooks
and tools but does not claim installed-host verification. Useful focused reruns
include:

```powershell
npm run verify:normal-session-quality-bridge
npm run verify:session-classification
npm run verify:project-check-catalog
npm run verify:workspace-observation
npm run verify:trusted-toolchain-host-config
npm run verify:trusted-toolchains
npm run verify:process-containment
npm run verify:trusted-project-runner
npm run verify:bash-boundary
npm run verify:global-quality-plugin-export
npm run verify:quality-verification-targets
npm run verify:quality-acceptance
npm run verify:whitespace:fixture
```

CI turns execution into sealed artifacts rather than inferring operational
success from this deterministic suite. `npm run milestone:2:operational`
executes the registered Windows or Linux production verifiers and accepts a
passed receipt only when their typed report binds containment identities,
teardown, scenarios, HEAD, local workspace identity, portable source
attestation, and GitHub/local run. Producers re-observe that source immediately
before sealing. `npm run
milestone:2:assess` validates deterministic/platform/optional installed-host
bundles, derives status facts from their receipts, and rejects mixed HEAD/run
or source-attestation provenance. The CI aggregate also requires every receipt
producer job result to be `success`; an artifact uploaded during failed cleanup
cannot satisfy the gate. A missing GitHub-hosted installed adapter may be reported only as
explicit bounded external state; a deterministic host fixture never satisfies
`host_hook_e2e`.

Installed-host and live-model checks remain explicit and outside the default
aggregate:

```powershell
npm run probe:runtime:quality-plugin-api
npm run verify:runtime:quality-hooks
npm run eval:live
```

The committed-whitespace verifier selects local dirty, pull-request, push, or
clean-checkout behavior from explicit arguments or GitHub event metadata. Its
receipt binds the checked HEAD, exact range when available, command statuses,
and an evidence fingerprint. Missing base/before objects are `incomplete`,
not successful.
