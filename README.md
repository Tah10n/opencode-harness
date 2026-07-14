# opencode-harness

[![Verify](https://github.com/Tah10n/opencode-harness/actions/workflows/verify.yml/badge.svg)](https://github.com/Tah10n/opencode-harness/actions/workflows/verify.yml)

Reproducible OpenCode orchestration profile.

This repository contains a reusable OpenCode behavior profile:

- primary orchestrator prompts;
- focused subagents;
- global safety rules;
- review and re-review ledger workflow;
- high-assurance quality gates for baseline, behavior contracts, edge/failure
  matrices, verification ladders, and final adversarial audit;
- a runner-owned, versioned Engineering Dossier and computational
  pre-implementation gate with persisted baseline/plan-challenge execution
  receipts, bounded impact graphs, optional project architecture policies, and
  explicit invariant/edge/failure/test mappings;
- an executable feedback plane: schema-v2 operational traces, immutable live
  reports, paired baseline/candidate assessment, and explicit decisions;
- active GPT-5.6 Sol/Terra role profiles, a retained fingerprinted GPT-5.5
  comparison baseline, and evaluation-only Luna, with prompt-inventory and
  runtime-evidence boundaries;
- trace, budget/termination, and shared subagent result-schema contracts;
- a strict read-only primary review orchestrator for diff and release review;
- recursive-context operating rules;
- static adversarial fixtures for prompt-injection, command-injection,
  secret-bait, and review-only traps;
- controlled memory and self-improvement policy;
- commands such as `learn`, `curate-learning`, `review-diff`, `workflow`, and
  `harness-release-review`;
- deterministic verification for static structure, contract/config scenarios,
  drift, feedback persistence, live manifests, and runtime parser fixtures;
- optional installed runtime permission checks and live A/B evaluation.

Development status: this checkout targets unreleased `0.3.0`. The latest
tagged release is `v0.2.0`, whose package metadata has no `exports` field and
therefore does not expose the feedback API subpaths described below.

It is intentionally separate from plugin capabilities:

- [`opencode-recursive-context`](https://github.com/Tah10n/opencode-recursive-context) provides safe read-only `context_*` tools.
- [`opencode-learning-guard`](https://github.com/Tah10n/opencode-learning-guard) provides bounded `oc_learning_*` write tools.
- `opencode-harness` decides when and how agents should use those tools.

## Usage

Copy or adapt the profile files into an OpenCode configuration:

- `AGENTS.md`
- `opencode.json`
- `agents/`
- `commands/`
- `skills/`
- `docs/`

Keep personal memory entries, machine-specific plugin paths, local automation,
and project-specific workflow facts outside this repository.

Detailed adoption steps live in [docs/adoption.md](docs/adoption.md). The
control matrix lives in [docs/harness-map.md](docs/harness-map.md), and project
readiness guidance lives in [docs/harnessability.md](docs/harnessability.md).
Trace, budget, and subagent handoff contracts live in
[docs/trace-contract.md](docs/trace-contract.md),
[docs/budgets-and-termination.md](docs/budgets-and-termination.md), and
[docs/subagent-result-schema.md](docs/subagent-result-schema.md). The model
matrix and evidence protocol live in
[docs/model-profiles.md](docs/model-profiles.md).

## Adoption

1. Install or configure the capability packages:
   - [`opencode-recursive-context`](https://github.com/Tah10n/opencode-recursive-context)
   - [`opencode-learning-guard`](https://github.com/Tah10n/opencode-learning-guard)
2. Copy or adapt this profile's `AGENTS.md`, `opencode.json`, `agents/`,
   `commands/`, `skills/`, and `docs/` into the target OpenCode configuration.
3. Keep machine-local plugin paths, personal memory entries, and project-specific
   workflow facts out of this template.
4. Run the local verifier:

   ```powershell
   npm run verify
   ```

5. In the live OpenCode configuration, confirm the effective runtime surface:

   ```powershell
   npm run verify:runtime
   ```

   Or run the underlying OpenCode checks manually:

   ```powershell
   opencode debug config
   opencode debug agent orchestrator
   opencode debug agent orchestrator-deep
   opencode debug agent review-orchestrator
   opencode debug agent reviewer
   opencode debug agent improver
   ```

Expected runtime result: the orchestrator and read-only agents expose the
minimal safe `context_*` surface (`context_outline`, `context_files`,
`context_search`, and `context_read`), while `oc_learning_*` write tools are
available only through the bounded self-improvement path. Advanced
recursive-context tools are host opt-ins.

## Local State Boundary

`skills/global-memory/SKILL.md` in this repository is a clean template. It
defines the memory shape and policy, but it should not contain private durable
memory entries.

`.oc_harness/` is a different kind of memory: bounded machine-local operational
evidence for runs and first-party acceptance inputs. Its run store contains
structured events, context receipts, delegated-job records, verification, and
outcomes, with total quotas and consistency-checked finalization. It is ignored
by Git and the OpenCode watcher. Generated live reports
and candidate decisions are likewise ignored under `evals/reports/` and
`evals/decisions/`.

Operational evidence is disposable and must not become durable semantic
memory. Reusable lessons remain gated through `global-memory`/`improver`, while
project-specific facts remain in `WORKFLOW.md` or project-local skills.

## Feedback Plane API And CLI

The API and CLI in this section describe the unreleased `0.3.0` target, not
the tagged `v0.2.0` package.

Node ESM integrations import the public package boundary:

```js
import { createAdapterInstrumentation, createTraceStore } from "opencode-harness/feedback";
import { createEngineeringDossierDraft, evaluateEngineeringGate } from "opencode-harness/quality";
```

`opencode-harness/trace-store` is a compatibility export. The trace CLI exposes
run creation, schema-v2 event emission, and inspection:

```sh
npm run trace -- create --json '{"risk":"standard"}'
npm run trace -- emit --run-id <id> --file event.json
npm run trace -- inspect --run-id <id>
```

See [docs/trace-contract.md](docs/trace-contract.md) for lifecycle, privacy,
and schema-v1 read compatibility.

## Verification

Run the local harness checks before copying or publishing template changes:

```powershell
npm run verify
```

The default gate includes an isolated, no-provider copy smoke. Run it directly
when changing adoption contents or package boundaries:

```powershell
npm run verify:adoption-bundle
```

Milestone 2's model-free quality checks are also available individually:

```powershell
npm run verify:quality-contracts
npm run verify:engineering-dossier
npm run verify:architecture-policy
npm run verify:impact-graph
npm run verify:model-profiles
npm run verify:prompt-inventory
npm run verify:quality-live-coordinator
npm run verify:quality-live-runner
npm run verify:quality-live-manifests
npm run verify:quality-acceptance
npm run verify:milestone-2-dod-contract
```

The DoD contract command validates only the manifest and status policy: it
consumes no execution receipts and asserts no milestone completion status.
`npm run verify` is the runner-owned sequential aggregator. It emits bounded
in-memory receipts for every deterministic DoD check and exits as `verified`
when those mandatory checks pass. Installed-runtime evidence and live A/B
evidence are optional external inputs. These commands validate contracts, schemas, failure
cases, corpus structure, and evaluation logic. The prompt inventory covers 11 agent prompts and eight
skill entrypoints. These checks do not prove an installed model profile or
actual GPT-5.6 quality.

Run the installed-profile runtime sensor after copying the profile into a live
OpenCode configuration:

```powershell
npm run verify:runtime
```

For local private-name checks, keep the marker list outside the repository
and pass it through the environment:

```powershell
$env:HARNESS_FORBIDDEN_MARKERS=$env:HARNESS_PRIVATE_MARKERS
npm run verify
```

After copying the profile into a live OpenCode configuration, also run the
runtime checks documented in `docs/recursive-context-mode.md` and
`docs/memory-and-self-improvement.md`.

The static evaluation scenarios are documented in
[docs/evaluation.md](docs/evaluation.md). Compatibility and release guidance
live in [docs/compatibility.md](docs/compatibility.md) and
[docs/release.md](docs/release.md). Optional live A/B evaluation is documented
in [docs/live-evaluation.md](docs/live-evaluation.md). Static adversarial
fixtures live under [fixtures/adversarial/](fixtures/adversarial/).

`npm run verify` is deterministic repository-side assurance. It does not prove
actual model behaviour, requires no model/network/live adapter, and includes
the infrastructure tracing self-test without an LLM. Keep these layers
separate:

1. `npm run verify` — deterministic repository, feedback-plane, and portable
   adoption-bundle contracts, including the model-free Engineering Dossier,
   gate, impact, model-profile, prompt, quality-corpus, and acceptance checks.
2. `npm run verify:runtime` — effective installed permission surface; use
   `-- --all-experiment-models --profile-role baseline|candidate` to capture
   every distinct planned model-option invocation into the same dedicated
   runtime-evidence directory.
3. `npm run eval:live` — actual adapter/model/tool behaviour.
4. `npm run assess:candidate` — policy-backed accepted/rejected/inconclusive
   decision over trusted legacy evidence; schema-v2 quality evidence uses
   `npm run assess:quality-candidate -- ...`.

Capture first-party static evidence with
`npm run evidence:static -- --candidate-id <id>`. Capture installed permission
evidence for that exact source snapshot with
`npm run verify:runtime -- --evidence-profile <runtime-profile-id> --subject-id <static-candidate-id> --subject-evidence <static.json>`.
`--subject-id` keeps the shared repository subject identity separate from the
baseline/candidate runtime-profile labels; when omitted it defaults to the
evidence profile for backward compatibility.
The runtime producer inventories installed agents with `opencode agent list`,
records each `{name, mode}` and every discovered permission surface, and binds
them to a content attestation. Required modes and exclusive web/learning
permissions are checked across the discovered inventory. Missing or unsupported
inventory or permission data fails closed
or stays explicitly incomplete instead of becoming an implicit deny. Fixture
permission snapshots are parser tests and are not trusted for candidate
acceptance. See
[docs/evaluation.md](docs/evaluation.md) and
[docs/live-evaluation.md](docs/live-evaluation.md).

Static evidence verifies an external materialized snapshot rather than the
mutable source directory. Live report trust requires an intact immutable
JSON/Markdown/marker generation, and candidate decisions bind the canonical
scenario-corpus and repetition-universe fingerprints.
Live adapter traces stay in a bounded in-memory journal and reach
`.oc_harness/` only as a finalized batch after verified process-tree teardown.

## Repository layout

```text
AGENTS.md              global rules
opencode.json          permissions, default agent, command entries
agents/                primary and subagent prompts
skills/                reusable global skills and templates
commands/              command prompt files
docs/                  design notes and verification guidance
examples/              copyable examples for host profiles and projects
fixtures/              static evaluation fixtures
evals/                 policies, suites, scenarios, and hidden checks
lib/feedback/          operational trace, reports, and acceptance APIs
lib/quality/           dossier, gate, impact, model, prompt, and quality APIs
quality/               checked schemas, policies, profiles, and live sidecars
scripts/               local deterministic harness checks
.oc_harness/           ignored machine-local runs and evidence
```

## Active GPT-5.6 Profiles

The checked-in agents now use explicit GPT-5.6 IDs directly:
`openai/gpt-5.6-sol` for primary
implementation, architecture, review, diagnosis, decisions, and integration;
`openai/gpt-5.6-terra` for bounded read-heavy exploration and research; and
`openai/gpt-5.6-luna` only for evaluation-only, high-volume, low-risk
`standard-lite` experiments. Luna is not an active agent and is prohibited for
critical canaries. The fingerprinted GPT-5.5 profiles remain only as an
optional comparison baseline.

The active profiles preserve each role's existing reasoning effort and low text
verbosity while omitting `temperature`. The optional comparison plan also compares
the same and one-lower effort, and evaluates low/medium verbosity where complete
dossiers or reports matter. `max`, API pro
mode, persisted reasoning, and other nested provider features remain disabled
until the installed OpenCode runtime proves their exact supported surface.

The direct model switch does not claim measured superiority and does not depend
on A/B execution. If comparative evidence is wanted later, runtime compatibility
can be captured with both
`npm run verify:runtime -- --all-experiment-models --profile-role baseline`
and the matching `candidate` command against their installed runtime roots.
The producer publishes a completion marker only after every exact invocation
is eligible, and a comparative quality claim requires paired live evidence from
a compatible adapter. Without those optional inputs, behavioural superiority
is explicitly unverified while GPT-5.6 Sol/Terra remain active. See
[docs/model-profiles.md](docs/model-profiles.md).

## Why This Is A Harness

Plugins add tools. A harness defines the agent runtime behavior around those
tools: orchestration, safety, delegation, context gathering, review loops, and
verification discipline.

## Design Influences

The feedforward/feedback and computational/inferential framing is adapted from
Birgitta Böckeler's
[Harness engineering](https://martinfowler.com/articles/harness-engineering.html)
article, published on Martin Fowler's site. Operational role and workflow
practices are also informed by
[DenisSergeevitch/agents-best-practices](https://github.com/DenisSergeevitch/agents-best-practices).

From Lilian Weng's July 4, 2026 article,
[Harness Engineering for Self-Improvement](https://lilianweng.github.io/posts/2026-07-04-harness/),
this repository adapts workflow automation around plan/execute/observe/improve,
filesystem artifacts as bounded operational memory, explicit and inspectable
subagent jobs, structured context engineering instead of prompt growth,
verifier-grounded evaluation, and propose/evaluate/accept separation with
held-out regression protection.

These are design influences, not a claim that this repository implements every
system or paper discussed by those sources. The harness has an evaluation and
acceptance plane, but it does not autonomously apply candidate edits to the
active profile. Permissions, security controls, hidden checks, and the
acceptance policy remain outside any future proposal loop. Rejected candidates
never mutate the active harness, and an accepted decision is still evidence for
a separate human-reviewed change.
