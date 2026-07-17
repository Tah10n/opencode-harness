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
- an OpenCode-native quality bridge with bounded dossier tools and runner-owned
  `tool.execute.before` decisions for native edits and writable delegation;
- direct, user-editable model configuration in active `agents/*.md`
  frontmatter;
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
- optional installed-runtime hook checks and general live regression evaluation.

Development status: this checkout targets unreleased `0.3.0`. The latest
tagged release is `v0.2.0`, whose package metadata has no `exports` field and
therefore does not expose the feedback API subpaths described below.

Its policy layer is intentionally separate from optional capability packages:

- [`opencode-recursive-context`](https://github.com/Tah10n/opencode-recursive-context) provides safe read-only `context_*` tools.
- [`opencode-learning-guard`](https://github.com/Tah10n/opencode-learning-guard) provides bounded `oc_learning_*` write tools.
- `opencode-harness` decides when and how agents should use those tools.

## Usage

For the complete executable profile, copy the exact portable source-bundle
contract below. Directory entries are written without a trailing slash so the
same list can be checked mechanically against the isolated adoption smoke.

<!-- portable-adoption-bundle:start -->
```text
.opencode/plugins/engineering-dossier.mjs
.opencode/quality/checks.json
.opencode/quality/toolchains.json
.gitattributes
.github
.gitignore
AGENTS.md
CHANGELOG.md
CODEOWNERS
CONTRIBUTING.md
LICENSE
README.md
SECURITY.md
agents
commands
docs
evals
examples
fixtures
lib/feedback
lib/quality
native
opencode.json
package.json
quality
scripts
skills
```
<!-- portable-adoption-bundle:end -->

The plugin is not a standalone file: it imports the `lib/quality/` boundary,
and the package smoke imports both `opencode-harness/feedback` and
`opencode-harness/quality`. Do not replace the explicit plugin path with all of
`.opencode/`, and do not copy `.opencode/node_modules`,
`.opencode/package.json`, `.opencode/package-lock.json`, runtime state, or
generated evidence.

Keep personal memory entries, machine-specific plugin paths, local automation,
and project-specific workflow facts outside this repository.

Detailed adoption steps live in [docs/adoption.md](docs/adoption.md). The
control matrix lives in [docs/harness-map.md](docs/harness-map.md), and project
readiness guidance lives in [docs/harnessability.md](docs/harnessability.md).
Trace, budget, and subagent handoff contracts live in
[docs/trace-contract.md](docs/trace-contract.md),
[docs/budgets-and-termination.md](docs/budgets-and-termination.md), and
[docs/subagent-result-schema.md](docs/subagent-result-schema.md). Model
configuration guidance lives in
[docs/model-profiles.md](docs/model-profiles.md).

## Adoption

1. Use Node.js 24 or newer and install or configure the capability packages:
   - [`opencode-recursive-context`](https://github.com/Tah10n/opencode-recursive-context)
   - [`opencode-learning-guard`](https://github.com/Tah10n/opencode-learning-guard)
2. Copy or adapt the exact portable source-bundle contract under [Usage](#usage).
   Keep `.opencode/plugins/engineering-dossier.mjs` together with its
   `lib/quality/` and `quality/` contracts; never copy the whole `.opencode/`
   directory.
3. Keep machine-local plugin paths, personal memory entries, and project-specific
   workflow facts out of this template.
4. Run the local verifier:

   ```powershell
   npm run verify
   ```

5. In the live OpenCode configuration, confirm the effective runtime surface:

   ```powershell
   npm run verify:runtime
   npm run verify:runtime:quality-hooks
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

Expected runtime result: the orchestrator and designated repository-reading
agents expose the minimal safe `context_*` surface (`context_outline`, `context_files`,
`context_search`, and `context_read`), while `oc_learning_*` write tools are
available only through the bounded self-improvement path. Advanced
recursive-context tools are host opt-ins.

## How The Quality Gate Works

1. `chat.message` registers each primary development session as
   `unclassified`.
2. Before mutation, the orchestrator calls `quality_session_start` with the
   risk class, goal, exact ownership, and trusted project checks.
3. A clean, bounded local task may use `standard-lite`: declared behavior,
   preserved behavior, local edge cases, ownership, and trusted checks. The
   runner synthesizes this compact dossier; callers do not replace or update it
   with `quality_dossier_create` or `quality_dossier_update`.
4. `high` and `critical` require the full Engineering Dossier, impact graph,
   invariants, edge/failure mappings, baseline evidence, and independent
   architect and reviewer contributions.
5. The plugin and runner compute the gate. Native edit, write, patch, and
   writable `task.general` calls remain denied until the runner records a
   passed gate. Native `bash` remains disabled in an instrumented quality
   session.
6. A passed gate issues one-shot authority for exact owned paths. Tests, lint,
   typecheck, and builds run only as runner-owned trusted project checks.
7. The runner compares the bounded source workspace before and after mutation:
   tracked changes, untracked non-ignored files, exact ownership, declared
   generated outputs, the Git index, and `HEAD`. Ordinary ignored dependency,
   cache, and build trees stay outside the source walk; `.oc_harness` has a
   separate control-state guard.
8. Project checks declare a logical `executable_id` in
   `.opencode/quality/checks.json`. `.opencode/quality/toolchains.json` maps it
   to an approved resolver family. The runner avoids ambient `PATH`, rechecks
   identity immediately before spawn, sanitizes the environment, and uses
   `shell: false`.
9. A `standard-lite` bug fix binds one catalog check as both the pre-fix
   reproducer and the integration regression. The runner records expected
   pre-fix failure, post-fix pass, unrelated outcome, or bounded unavailability
   with an explicit reason. Unexpected pass, unrelated evidence, and material
   uncertainty block the compact path.
10. A configured high/critical architecture policy accepts only a freshly
    created or rewritten runner-owned final graph from its integration check.
    Missing, stale, unavailable, failed, or policy-violating evidence cannot
    produce attestation.
11. Final attestation is valid only for the current source workspace after all
    mandatory trusted checks and any required post-edit architecture review.

`quality_command_authorize` returns `QUALITY_NATIVE_BASH_DISABLED` for native
Bash before and after classification. Runner-owned read-only Git observations
use an absolute fixed-install executable with a minimal sanitized environment.

## Project Configuration

Use Node.js 24 or newer, matching the package engine and CI runtime. Each
adopted project also needs:

- `.opencode/quality/checks.json` with real unit, lint, typecheck, build, or
  integration commands;
- `.opencode/quality/toolchains.json` with logical executable IDs and only the
  resolver families the project uses;
- an optional `quality/architecture-policy.json`;
- `WORKFLOW.md` with verification order and repository boundaries;
- project-local skills for specialized workflows.

The project-local wrapper is `.opencode/plugins/engineering-dossier.mjs`. A
global installation uses the minimal wrapper from
`quality/examples/global-quality-plugin.mjs`; checks, toolchain mappings, and
optional architecture policy remain project-local. Project toolchain maps are
machine-neutral and never contain host paths. Non-built-in resolver families
use the host-owned `quality-toolchains.host.v1.json` contract, and receipts bind
`trusted-toolchain-resolution-v5` evidence.

[The adoption guide](docs/adoption.md#normal-session-quality-bridge) is the
canonical source for detailed wrapper, resolver, Linux, Windows, and macOS
provisioning instructions. The README intentionally keeps only this operational
summary so those security-sensitive details have one authoritative narrative.

## Computational Enforcement Boundary

The plugin enforces session registration and classification, gate state, exact
ownership, one-shot mutation capabilities, catalog/toolchain/architecture
drift, bounded workspace reconciliation, stale-verification invalidation,
trusted check receipts, and final attestation. Durable receipts store bounded
status metadata and fingerprints, never raw command stdout or stderr.

An API/factory import is not installed-host evidence.
`probe:runtime:quality-plugin-api` checks API construction only;
`verify:runtime:quality-hooks` requires an explicitly selected trusted host
adapter and independently observes the authorized workspace effect. A
standalone evidence file remains untrusted parser input. Missing host, provider,
or adapter state returns `blocked_external_state`; deterministic fixtures never
claim host-active callbacks.

Production command and adapter children require verified platform containment:

- Windows binds a retained worker handle, creation time, and a fresh IPC
  response before `AssignProcessToJobObject`; closing the Job Object kills its
  descendants.
- Linux uses an exclusive delegated cgroup-v2 root, an external coordinator
  and watchdog, the fixed-destination `sudo-helper-v2`, pidfd/start-time
  identity, root-level `cgroup.kill`, and hierarchical `populated 0` teardown.
- macOS uses `macos-exclusive-uid-v1`: a protected root-owned controller and
  marker plus a workload-owned lease for a dedicated non-admin UID, with
  fixed-point cleanup and two empty same-UID scans.

These are lifecycle boundaries for trusted project-owned checks, not hostile
code sandboxes. They do not prevent privilege escalation, network access, or
access to other files available to the workload user. Any unavailable
production controller fails closed with
`QUALITY_CHECK_CONTAINMENT_UNAVAILABLE`. Containment setup has a separate
deadline from command execution, and cwd identity is rechecked across spawn and
inside the contained worker before project code loads.

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
npm run verify:prompt-inventory
npm run verify:quality-live-coordinator
npm run verify:quality-verification-targets
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
npm run verify:runtime:quality-hooks:fixture
npm run verify:quality-live-manifests
npm run verify:quality-acceptance
npm run verify:whitespace:fixture
npm run verify:milestone-2-dod-contract
```

The DoD contract command validates only the manifest and status policy: it
consumes no execution receipts and asserts no milestone completion status.
`npm run verify` is the runner-owned sequential aggregator and emits bounded
receipts for the deterministic DoD dimension. When
`OPENCODE_MILESTONE_RECEIPTS_OUT` names a new absolute file, it also writes the
sealed deterministic bundle consumed by CI. A deterministic-only
result is `partially_verified`, never milestone-wide `verified`: real Windows
Job Object, Linux cgroup-v2, macOS exclusive-UID, and installed host-hook
evidence are separate operational dimensions. macOS cannot be replaced by an
`unsupported` status; general live evaluation may be `not_requested`. In
particular,
`probe:runtime:quality-plugin-api` is intentionally excluded from this default
chain because it resolves a machine-local `@opencode-ai/plugin` installation.
These commands validate contracts, schemas, failure
cases, corpus structure, and evaluation logic. The prompt inventory covers 11 agent prompts and eight
skill entrypoints. These checks do not prove an installed model profile or
actual model behaviour.

Each deterministic stage owns exactly one outer containment scope. Containment
controller coordinates are removed from the stage child environment, and
recursive runner self-tests are not valid project-catalog checks. Direct
operational verification remains separate and receives the host coordinates it
needs.

Platform jobs produce typed operational bundles only through real verifier
reports, then a separate command aggregates those artifacts instead of trusting
caller-supplied status facts. Every bundle binds a portable source attestation,
and each producer re-observes the source before sealing. CI refuses aggregation
unless all required producer jobs finished with `success`, even when a failed job
uploaded diagnostic artifacts:

```powershell
npm run milestone:2:operational -- --dimension windows_runtime --out C:\absolute\windows-runtime.json
npm run milestone:2:assess -- --bundle-dir C:\absolute\bundles --out C:\absolute\aggregate.json --host-unavailable
```

Use `linux_runtime` on a guarded Linux cgroup-v2 host. Use `macos_runtime` only
inside a dedicated macOS workload account after building and root-installing
`native/macos-exclusive-uid-controller.c`, provisioning its protected UID
marker and paired lease; the required environment variables are shown above
and the complete provisioning reference is the
`macos-containment` CI job. The installed-host path
can write its own `host_hook_e2e` bundle with
`npm run verify:runtime:quality-hooks -- --adapter <host-owned-adapter> --milestone-out <absolute-json>`.
Successful evidence seals a passed receipt; conclusive adapter, evidence,
workspace-effect, or cleanup failure seals a failed receipt in the requested
bundle. A genuinely unavailable runtime remains `blocked_external_state` and
does not masquerade as a failed execution. `--fixture-contract` cannot emit an
installed-host milestone bundle at all. GitHub Actions
uploads deterministic, Windows, Linux, and macOS bundles and reports the absent
installed adapter as bounded external state; it cannot claim milestone-wide
`verified` until a `trusted_adapter` host bundle from the same HEAD/run exists.
"Same run" includes provider, run ID, attempt, repository, HEAD, and portable
source attestation. Therefore an external local host bundle cannot be mixed
with `github_actions` artifacts: use an installed/self-hosted adapter job inside
that workflow run, or produce every platform bundle in one coordinated local
run with the same `OPENCODE_MILESTONE_*` binding.

Run the installed-profile runtime sensor after copying the profile into a live
OpenCode configuration:

```powershell
npm run verify:runtime
npm run probe:runtime:quality-plugin-api
npm run verify:runtime:quality-hooks
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
[docs/release.md](docs/release.md). Optional general live evaluation is documented
in [docs/live-evaluation.md](docs/live-evaluation.md). Static adversarial
fixtures live under [fixtures/adversarial/](fixtures/adversarial/).

`npm run verify` is deterministic repository-side assurance. It requires no
model, credentials, network, live adapter, installed OpenCode runtime, or
machine-local plugin API package. Run `npm run probe:runtime:quality-plugin-api`
separately only in the installed target environment.

Profile-only mode is prompt guidance. Instrumented quality mode adds the
session registry, dossier/gate, workspace binding and mutation hooks described
above. Live-evaluation mode remains a separate isolated scenario runner.
`session.created` still lacks the originating task call ID, so child binding is
serialized and cardinality-checked rather than claimed as cryptographically
causal. Actual host discovery and hook invocation remain external evidence;
the deterministic repository suite never fabricates them.

Capture first-party static evidence with
`npm run evidence:static -- --candidate-id <id>`. Capture installed permission
evidence for that exact source snapshot with
`npm run verify:runtime -- --evidence-profile <runtime-profile-id> --subject-evidence <static.json>`.
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
lib/quality/           dossier, gate, bridge, verification, and quality APIs
quality/               checked schemas, policies, prompt inventory, and live sidecars
scripts/               local deterministic harness checks
.oc_harness/           ignored machine-local runs and evidence
```

## Models

The active agent frontmatter is the authoritative model configuration. Model
selection is not hard-coded into dossier, gate, verification, or acceptance
logic, and no model comparison is a deterministic or release gate.

| Roles | Current model | Files |
| --- | --- | --- |
| Orchestrators, architect, implementation, review, verifier, diagnose, improver | `openai/gpt-5.6-sol` | `agents/orchestrator.md`, `agents/orchestrator-deep.md`, `agents/review-orchestrator.md`, `agents/architect.md`, `agents/general.md`, `agents/reviewer.md`, `agents/verifier.md`, `agents/diagnose.md`, `agents/improver.md` |
| Explore and researcher | `openai/gpt-5.6-terra` | `agents/explore.md`, `agents/researcher.md` |

To change a model, edit the `model:` field in the YAML frontmatter of the
relevant `agents/<name>.md` file.

Example:

```yaml
model: openai/your-model-id
```

When changing only the model, preserve the role prompt and permissions.
`reasoningEffort` and `textVerbosity` are separate optional frontmatter
settings; adjust them only when appropriate for the replacement model. Not all
providers support the same settings. No generated catalog or fingerprint must
be updated for a model-only change. See
[docs/model-profiles.md](docs/model-profiles.md) for the compact configuration
reference.

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
