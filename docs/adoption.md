# Adoption Guide

Use this guide when copying or adapting `opencode-harness` into an OpenCode
configuration.

## Harnessability

Before adoption, use [docs/harnessability.md](harnessability.md) to check
whether the target project has enough local workflow, verification, and
boundary information for the harness to regulate agent work effectively.

## Prerequisites

- OpenCode installed in the target environment.
- Node.js available for local verification.
- Capability packages configured where the host profile can load them:
  - [`opencode-recursive-context`](https://github.com/Tah10n/opencode-recursive-context)
  - [`opencode-learning-guard`](https://github.com/Tah10n/opencode-learning-guard)

## Files To Copy

Copy or adapt these paths into the target OpenCode configuration:

- `AGENTS.md`
- `opencode.json`
- `agents/`
- `commands/`
- `skills/`
- `docs/`

Do not copy repo-local development files such as `.github/`, `fixtures/`, or
`scripts/` into a personal OpenCode config unless you intentionally want the
template development checks there.

To adopt the measurable feedback plane and its repository-side evaluation,
copy a complete source bundle rather than selecting only the public library:

- root package/profile metadata and governance files, including `package.json`,
  `opencode.json`, `.gitignore`, `AGENTS.md`, `README.md`, and `LICENSE`;
- `agents/`, `commands/`, `skills/`, `docs/`, `examples/`, and `.github/`;
- all of `lib/` and `scripts/`;
- all checked-in `quality/` schemas, policies, model profiles, prompt inventory,
  live-scenario sidecars, and Milestone 2 definition-of-done manifest;
- all checked-in `evals/` policies, schemas, suites, scenarios, and hidden
  checks;
- `fixtures/sample-project/` and `fixtures/live/`, as well as the static and
  runtime parser fixtures used by the deterministic verifier.

The fixtures are executable inputs to manifest validation and infrastructure
self-tests; omitting them creates a structurally incomplete bundle. Do not copy
ignored `evals/reports/`, `evals/decisions/`, or `.oc_harness/` state. Before
adopting or publishing, prove the bundle from an isolated temporary copy:

```sh
npm run verify:adoption-bundle
```

That smoke check copies the declared source bundle, imports
`opencode-harness/feedback` and `opencode-harness/quality` through package
exports, runs static and manifest validation, and runs the buffered
infrastructure self-test without a model, network, or live provider. The public
ESM boundaries belong to the unreleased `0.3.0` target; do not couple adapters
to private `lib/feedback/*` or `lib/quality/*` files or assume the tagged
`v0.2.0` package exports them.

Do not copy machine-local operational artifacts into the template.
`.oc_harness/`, `evals/reports/`, and `evals/decisions/` remain ignored local
state.

## Local State Boundary

Keep these outside this template:

- private memory entries;
- machine-local plugin paths;
- project-specific build, test, product, or architecture facts;
- raw logs and credentials;
- real traces or task transcripts that contain private context;
- live reports, acceptance evidence, and decision artifacts;
- local automation that only applies to one machine.

Use project-local `WORKFLOW.md`, `.opencode/skills/*`, or `.agents/skills/*`
for repository-specific operating rules.

Operational memory and durable semantic memory are separate. `.oc_harness/`
stores bounded, redacted run/evidence artifacts for audit and assessment. It
must not become a semantic index. Durable reusable lessons remain gated through
the `improver`/`global-memory` path.

## Engineering Gate Adoption

Instrumented high and critical tasks use the runner-owned Engineering Dossier
and gate before any implementation edit or writable delegation. The host
adapter may create and refine the dossier through its bounded quality facade,
but it cannot declare its own gate passed. The runner validates stable IDs,
impact coverage, invariant/edge/failure/test mappings, workspace state, and any
configured architecture policy, then records the causal gate event.

Adopters may provide `.opencode/architecture-policy.json` matching
`quality/schemas/architecture-policy.schema.json`. After the impact graph is
drafted, the adapter calls the bounded `quality.evaluateArchitecture` facade,
records the runner-produced assessment in the dossier, and only then finalizes
it. This is the baseline assessment. After implementation, the host must supply
a trusted graph extractor so the parent runner can compare the actual candidate
graph to that baseline and persist the post-edit evaluation. The adapter cannot
self-attest that graph; without an extractor, configured-policy live evidence
is incomplete. Do not copy the example as if it described the host project,
and do not infer dependency rules from folder names. No policy means explicit
`not_configured`; it does not remove impact, mapping, or verification obligations.

Keep project-specific entry points, contracts, invariants, failure modes, and
verification commands in `WORKFLOW.md` or project-local skills. They are the
inputs from which a task dossier is built, not reusable global memory.

## Verification

Run the template verifier before publishing or copying changes:

```sh
npm run verify
```

This model-free gate includes the Milestone 2 quality contract, dossier,
architecture, impact, profile, prompt, quality-scenario, acceptance, and
definition-of-done verifiers. It proves deterministic repository behavior, not
an installed OpenCode model or end-to-end task quality.

After installing into a live OpenCode configuration, verify the effective
runtime surface:

```sh
npm run verify:runtime
```

When evaluating a checked model candidate, capture every distinct exact
invocation for both experiment sides into the same fresh candidate-owned
evidence workspace:

```sh
HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_ROOT" \
HARNESS_RUNTIME_CWD="$BASELINE_RUNTIME_ROOT" \
npm run verify:runtime -- --all-experiment-models --profile-role baseline

HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_ROOT" \
HARNESS_RUNTIME_CWD="$CANDIDATE_RUNTIME_ROOT" \
npm run verify:runtime -- --all-experiment-models --profile-role candidate
```

The producer deduplicates the exact 96-pair invocation universe and publishes
the baseline/candidate completion markers only after every requested option is
eligible. Do not promote fixture evidence, a generic model alias, or config
parsing into installed-runtime proof. The checked-in Sol/Terra agents are
already active; runtime and paired live evidence are optional inputs for a
separate comparative-quality claim.

If you prefer to run the underlying OpenCode checks manually:

```sh
opencode debug config
opencode debug agent orchestrator
opencode debug agent orchestrator-deep
opencode debug agent review-orchestrator
opencode debug agent reviewer
opencode debug agent improver
```

Expected result:

- orchestrator/orchestrator-deep/review-orchestrator/reviewer/explore/architect/diagnose/verifier
  expose `context_outline`, `context_files`, `context_search`, and
  `context_read`;
- additional recursive-context tools are treated as host opt-ins, not required
  harness defaults;
- root config denies `oc_learning_*`;
- only `improver` has bounded `oc_learning_*` write tools;
- review requests remain read-only unless fixes are explicitly requested.
- delegated agents report the shared schema from
  `docs/subagent-result-schema.md`, including `files_changed` and
  `termination_reason`.

## Post-Adoption Confidence Levels

Layer 1 is the required repository gate. Add layer 2 when validating an
installed copy, and layers 3-4 only when a comparative A/B claim is wanted:

1. Deterministic repository checks: `npm run verify`, including feedback
   persistence, Engineering Dossier/gate/impact contracts, model and prompt
   manifests, corpus validation, infrastructure tracing without an LLM, and
   acceptance-engine self-tests. This layer needs no model, network, installed
   OpenCode runtime, or live adapter.
2. Optional installed runtime permission checks: `npm run verify:runtime` against the
   copied profile. For acceptance evidence, bind each profile to its static
   source snapshot with `npm run verify:runtime -- --evidence-profile
   <runtime-profile-id> --subject-id <static-candidate-id> --subject-evidence
   <static.json>`. The explicit subject ID lets separate baseline/candidate
   runtime profiles share one repository attestation; fixture permission evidence is not
   trusted for acceptance.
   Capture complete model-option bundles with `--all-experiment-models
   --profile-role baseline` and the matching `candidate` run in one dedicated
   runtime-evidence directory.
3. Optional comparative behavioural evidence: `npm run eval:live` with explicit
   baseline/candidate profiles, their installed permission artifacts, and a host
   adapter. Baseline/candidate copies are isolated and hidden checks/assertions
   remain runner-only.
4. Optional candidate assessment: `npm run assess:candidate` over immutable reports,
   first-party static evidence from `npm run evidence:static`, and installed
   permission snapshots. Only fully attested report generations participate;
   the canonical workspace corpus supplies required repetitions and scenario
   fingerprints.

Live evaluation is behavioural evidence, not a replacement for runtime
permission checks. Candidate assessment does not apply changes automatically.
Missing, incomplete, or content-mismatched mandatory evidence makes the whole
decision `inconclusive`. Permissions, security controls, runner-only hidden
checks, and acceptance policy remain outside any future proposal loop;
rejected candidates never mutate the active harness.

## Host Adapter Boundary

The live runner executes `OPENCODE_LIVE_EVAL_ADAPTER` in a bounded Node IPC
process and passes validated, quota-limited trace and quality facades. The
adapter is responsible for invoking the host OpenCode profile and returning its
content attestation; the parent remains responsible for dossier/gate
validation, workspace observations, architecture evaluation, and final quality
attestation. Configured architecture policy additionally needs a trusted host
candidate-graph extractor after implementation. The parent verifies ordinary
process-tree teardown before hidden staging; this boundary is not a full
hostile-code OS sandbox. If the host has no reliable adapter/runtime or graph
extraction hook, stop at deterministic and installed-runtime verification and
document the gap. Do not
claim arbitrary OpenCode sessions are traced automatically or fabricate a live
success.

Adversarial fixtures under `fixtures/adversarial/` are repository-side static
contracts. Do not execute them or copy them into host projects as runtime
payloads.

## Project-Level Verification Guidance

Host projects should document commands in `WORKFLOW.md` or project-local
skills for:

- targeted tests;
- affected-module or package tests;
- full-suite checks;
- typecheck;
- lint;
- production build;
- integration or E2E;
- race or stress;
- fuzz or property;
- mutation;
- migration;
- rollback or recovery;
- fault injection.

Workflow files describe commands and order only. They do not grant permissions;
OpenCode config remains the permission source of truth.
