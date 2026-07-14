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
path-boundary sensor. Optional live A/B evaluation remains outside the default
model-free gate.

## Four Assurance Layers

| Layer | Command | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Deterministic repository verification | `npm run verify` | Static structure, feedback foundation, trace store, Engineering Dossier/gate/impact contracts, model and prompt manifests, immutable report history, adapter process-tree boundary, contract/config evaluation, drift, runtime parser fixtures, 24+1 corpus validation, infrastructure tracing self-test, and acceptance-engine negative tests. It requires no model, network, or installed live adapter. | Actual model behaviour or the installed profile. |
| Installed permission and model surface | `npm run verify:runtime` | Current `opencode debug` output, effective tool/delegation permissions, and, with `--all-experiment-models --profile-role baseline|candidate`, complete distinct requested/effective model-option evidence. | End-to-end task quality or GPT-5.6 superiority. |
| Actual behavioural evaluation | `npm run eval:live` | Real adapter/model/tool behaviour on isolated baseline/candidate copies with hidden evidence and runner-owned quality attestations. | Deterministic CI assurance or permission compatibility by itself. |
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
- `npm run verify:live-manifests` — exact 24+1 corpus, suites, selection, and
  declarative trace assertions;
- `npm run verify:live-eval` — manifest validation plus infrastructure runner
  self-tests without a model, including a no-process in-memory/batch-commit test
  and the real process-tree teardown test;
- `npm run verify:acceptance` — accepted/rejected/inconclusive engine cases.
- `npm run verify:quality-contracts` — checked Engineering Dossier, gate, and
  attestation schemas plus drift and strict negative cases;
- `npm run verify:engineering-dossier` — risk-scaled dossier lifecycle,
  immutable fingerprints, mappings, pre-gate latching, and atomic quality run
  bundles;
- `npm run verify:architecture-policy` and `npm run verify:impact-graph` —
  bounded impact coverage and optional configured-policy evaluation;
- `npm run verify:model-profiles` — GPT-5.5/GPT-5.6 profile identities,
  eligibility, fingerprints, and the planned comparison matrix;
- `npm run verify:prompt-inventory` — bytes, lines, model/options, permission
  and task surfaces, safety sentinels, growth, and exact/normalized duplication
  drift across all 11 agent prompts and eight `SKILL.md` entrypoints;
- `npm run verify:quality-live-coordinator` — runner-owned dossier/gate action
  ordering and fail-closed mutation/delegation cases;
- `npm run verify:quality-live-manifests` — the 12 added whole-system quality
  scenarios, sidecars, fixtures, suite allocation, and public/hidden boundary;
- `npm run verify:quality-acceptance` — report-v2 identity and independent
  architecture/invariant/mapping/regression rejection cases;
- `npm run verify:milestone-2-dod-contract` — validates the machine-readable
  DoD manifest and classification policy only. It consumes no execution
  receipts and asserts no completion status. The runner-owned `npm run verify`
  maps all mandatory deterministic check IDs to bounded in-memory receipts and
  reports `verified` without requiring optional runtime/live A/B evidence.

Optional `HARNESS_CHECK_LINKS=1 npm run verify:drift` enables network link
checks; the default `npm run verify` remains network-free.

## Engineering Dossier And Pre-Implementation Gate

The Milestone 2 quality path starts with a versioned Engineering Dossier. It
records task shape, behavior and compatibility contracts, affected areas,
entry points and call paths, data shapes, invariants, edge cases, failure
modes, test obligations, assumptions, unknowns, subagent handoffs,
verification boundaries, an impact graph, and architecture-policy status.
Every scope, check, mapping, and handoff uses stable IDs with referential
integrity. A finalized dossier is immutable and content-fingerprinted.

For a required baseline or a high/critical plan challenge, names in the dossier
are not execution evidence. The trusted runner must produce a versioned
`preimplementation-evidence.json` bundle: baseline receipts bind the exact
check ID, command/mechanism, phase, producer, status, timestamp, and evidence
fingerprint; architect and reviewer receipts bind distinct traced result IDs to
trusted preimplementation mechanisms. The gate fingerprints that persisted
bundle. Missing, failed, future-dated, wrong-phase, wrong-producer, or merely
optional obligations block the gate.

`standard-lite` dossiers keep the same contract but permit a smaller bounded
shape for low-risk local work. High and critical instrumented runs require the
full affected-system inventory and a passed runner-owned gate before an edit,
write tool, implementation event, or writable delegated job. The gate blocks
on incomplete relevant mappings, blocking unknowns, impact gaps, workspace
drift, or a configured architecture violation. An attempted pre-gate mutation
irreversibly invalidates the run; creating a dossier afterward cannot repair
the causal violation.

The bounded impact graph represents direct and transitive affected paths,
cross-module contracts, tests/fixtures, config and schema consumers, public
interfaces, compatibility/version surfaces, persistence and lifecycle edges,
explicit exclusions, and unresolved paths with owners and resolution plans.
High/critical work must use the available semantic context surface or record
its unavailability and reduced-coverage fallback. The graph never claims an
unbounded whole-repository proof.

Architecture policy is optional and project-owned. When configured, the runner
strictly validates it. The pre-edit evaluation treats the dossier graph as the
baseline; after workspace reconciliation, a trusted host graph extractor must
produce the candidate graph and the runner evaluates candidate versus that
exact baseline. The adapter cannot attest its own candidate graph. A missing
post-edit extractor or blocked evaluator is incomplete evidence; an introduced
violation is persisted as failed post-edit evidence. For high/critical work that
failure blocks the completion attestation, so it cannot become an accepted run
bundle. When policy is absent, the result is explicitly `not_configured`. The
harness never invents allowed dependencies or upgrades a missing policy to a
computational architecture pass.

After verified adapter teardown and integrated verification, the runner binds
the dossier, gate, pre-edit architecture evaluation, post-edit architecture
evaluation when configured, model/prompt identities, workspace fingerprints,
and trace order into an immutable quality attestation and atomic run bundle.
This is causal evidence for an instrumented run, not a claim that unrelated
OpenCode sessions are intercepted.

## First-Party Acceptance Evidence

Capture immutable static-verification evidence once for the stable candidate
repository that both runtime profiles will evaluate. Baseline/candidate identify
separate installed runtime configurations, not separate static subjects. The
candidate artifact is the mandatory static-verification hard-gate input:

```sh
CANDIDATE_ROOT="/absolute/path/to/candidate"

cd "$CANDIDATE_ROOT"
npm run evidence:static -- --candidate-id experiment-subject
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

Record the absolute JSON path printed by the producer, then capture trusted
installed runtime permission snapshots separately from both runtime roots while
binding both snapshots to that exact same static subject:

```sh
CANDIDATE_ROOT="/absolute/path/to/candidate"
BASELINE_RUNTIME_ROOT="/absolute/path/to/installed-baseline-runtime"
CANDIDATE_RUNTIME_ROOT="/absolute/path/to/installed-candidate-runtime"
SUBJECT_STATIC_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<experiment-subject-static>.json"

cd "$CANDIDATE_ROOT"
HARNESS_RUNTIME_CWD="$BASELINE_RUNTIME_ROOT" \
HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_ROOT" \
npm run verify:runtime -- --evidence-profile baseline-v1 \
  --subject-id experiment-subject \
  --subject-evidence "$SUBJECT_STATIC_JSON"

HARNESS_RUNTIME_CWD="$CANDIDATE_RUNTIME_ROOT" \
HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_ROOT" \
npm run verify:runtime -- --evidence-profile candidate-v1 \
  --subject-id experiment-subject \
  --subject-evidence "$SUBJECT_STATIC_JSON"
```

`--evidence-profile` names the installed permission surface; `--subject-id`
names the immutable static evidence subject. Both snapshots therefore bind the
same repository fingerprint without pretending their runtime profiles are the
same.

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

Model compatibility is a separate first-party runtime artifact. Capture every
distinct canonical invocation for each side into one fresh candidate-owned
evidence workspace:

```sh
BASELINE_RUNTIME_ROOT="/absolute/path/to/installed-baseline-runtime"
CANDIDATE_RUNTIME_ROOT="/absolute/path/to/installed-candidate-runtime"

HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_ROOT" \
HARNESS_RUNTIME_CWD="$BASELINE_RUNTIME_ROOT" \
npm run verify:runtime -- --all-experiment-models --profile-role baseline

HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_ROOT" \
HARNESS_RUNTIME_CWD="$CANDIDATE_RUNTIME_ROOT" \
npm run verify:runtime -- --all-experiment-models --profile-role candidate
```

The dedicated `.oc_harness/evidence/runtime-model-batches` directory contains
a validated batch array, the same evidence as individual `*-model-*.json`
documents for live evaluation, and a completion marker for each side. The
marker appears only after every exact requested model, effort, verbosity, and
mode is installed-runtime eligible. Fixture evidence and missing, ignored,
alias-only, conflicting, or unsupported values publish no complete bundle and
are not eligible live-model proof. See [model-profiles.md](model-profiles.md).

## Acceptance Policy

`evals/acceptance-policy.json` remains the Milestone 1 compatibility policy.
Milestone 2 adds the strict schema-v2 quality policy at
`quality/acceptance/acceptance-policy.v2.json`. Legacy v1 artifacts remain
readable but cannot satisfy v2 quality evidence requirements. Both policies
are versioned and fingerprinted. Assessment pairs results by `scenario_id`
plus `repetition`, never array position, and evaluates independent hard gates
rather than reducing quality to one scalar score.

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

Schema-v2 results additionally bind the exact comparison ID; baseline or
candidate role; model-profile ID and fingerprint; effective model, effort,
verbosity, and mode; installed-runtime model-evidence ID and fingerprint;
permission-snapshot and permission-profile fingerprints; prompt-profile ID and
fingerprint; dossier schema and fingerprint; gate and attestation fingerprints;
and complete quality outcomes. Prescribed experiment bindings, not report
labels, determine the expected identity. The policy pair-universe fingerprint
covers the complete canonical objects for all 96 comparisons, including model,
profile, prompt, catalog, capability, role, scenario, repetition, and variant
identity; keeping the same comparison IDs while substituting those fields is
rejected.

Quality hard gates independently reject architecture-policy violations,
invariant violations, unverified critical invariants, incomplete dossiers,
pre-edit gate violations, unresolved affected-path gaps, incomplete edge-case
or failure-mode coverage, test-quality failures, permission widening,
introduced regressions, and hidden edge-case failures. Cost, duration, and
token ceilings remain separate optional gates; they cannot compensate for a
correctness or architecture failure. Missing or mismatched quality/runtime
evidence is `inconclusive`, not a silent pass or a quality rejection based on a
partial comparison.

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

Schema-v2 quality assessment uses only the checked policy, experiment, model
catalog, prompt inventory, scenario corpus, and exact 96-pair universe. The
caller supplies immutable-history report paths plus installed runtime and
permission evidence, but cannot replace those canonical inputs:

```sh
QUALITY_REPORT_JSON="evals/reports/<quality-report>.json"
RUNTIME_MODEL_EVIDENCE_DIR="$CANDIDATE_ROOT/.oc_harness/evidence/runtime-model-batches"
BASELINE_PERMISSIONS_JSON="/absolute/path/to/<baseline-permissions>.json"
CANDIDATE_PERMISSIONS_JSON="/absolute/path/to/<candidate-permissions>.json"

npm run assess:quality-candidate -- \
  --report "$QUALITY_REPORT_JSON" \
  --runtime-evidence "$RUNTIME_MODEL_EVIDENCE_DIR" \
  --baseline-permission-evidence "$BASELINE_PERMISSIONS_JSON" \
  --candidate-permission-evidence "$CANDIDATE_PERMISSIONS_JSON" \
  --baseline-id baseline-v1 \
  --candidate-id candidate-v1
```

The report path must name a complete JSON/Markdown/marker history generation.
Permission key-set drift is inconclusive; a trusted `deny -> ask/allow` or
`ask -> allow` transition is a failed `permission_surface` hard gate.

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

The boundary is propose/evaluate/accept, never propose/evaluate/auto-apply.
Any future proposal generator must remain outside permissions, security
controls, runner-only hidden checks, and acceptance-policy ownership. An
`accepted` decision still requires a separate reviewed configuration change;
a rejected candidate never mutates the active harness.

## Behaviour Contracts And Corpus

`scripts/evaluate-harness.mjs` checks that guides, sensors, permissions, and
static fixtures encode expected behaviour. Covered contracts include bounded
recursive context, read-only review, small-task routing, architecture/quality
gates, dangerous-command approval, project-local knowledge, trace and
termination schemas, structured subagent handoff, and static adversarial
fixtures.

The Milestone 1 live corpus under `fixtures/live/`, `evals/scenarios/`, and
`evals/hidden/` contains twelve distinct behavioural mechanisms: small local work,
broad audit, visible-plus-hidden bug, related call path, read-only review,
prompt-injection data, fake secret bait, stale context, conflicting write
scope, weak handoff, project-local knowledge, and approval-gated destructive
work. Milestone 2 adds twelve whole-system quality scenarios across
development, held-out, and canary suites. They exercise cross-module
invariants, public API compatibility, architecture boundaries, concurrency and
cancellation, parser boundaries, small-local control, persistence rollback,
retry/idempotency, stale cache/version skew, partial dependency failure,
resource lifecycle, and migration compatibility. See
[live-evaluation.md](live-evaluation.md).

## Operational Versus Durable Memory

`.oc_harness/` is ignored machine-local operational evidence for runs and
acceptance inputs. It is bounded, redacted, and disposable. Durable semantic
memory remains the separately gated `global-memory`/`improver` mechanism;
project facts remain in project-local workflow files and skills. Evaluation
does not create a semantic index, autonomously mutate the harness, or perform
candidate search.
