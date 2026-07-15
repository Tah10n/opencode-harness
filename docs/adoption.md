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

Copy or adapt this exact portable source-bundle contract. Directory entries
are written without a trailing slash so the same list is checked mechanically
against `scripts/verify-adoption-bundle.mjs`.

<!-- portable-adoption-bundle:start -->
```text
.opencode/plugins/engineering-dossier.mjs
.opencode/quality/checks.json
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
opencode.json
package.json
quality
scripts
skills
```
<!-- portable-adoption-bundle:end -->

The exact plugin file depends on `lib/quality/` and the checked `quality/`
schemas, policies, prompt inventory, and live sidecars. The package boundary
also needs `lib/feedback/`, and the scripts, eval manifests, fixtures, and
metadata above are executable inputs to deterministic verification.
`fixtures/sample-project/` and `fixtures/live/` remain required subsets of the
declared `fixtures` entry. Do not copy the whole `.opencode/` directory.

The fixtures are executable inputs to manifest validation and infrastructure
self-tests; omitting them creates a structurally incomplete bundle. Do not copy
`.opencode/node_modules`, `.opencode/package.json`,
`.opencode/package-lock.json`, ignored `evals/reports/`,
`evals/decisions/`, `.oc_harness/`, runtime state, or generated evidence.
Before adopting or publishing, prove the bundle from an isolated temporary
copy:

```sh
npm run verify:adoption-bundle
```

That smoke check copies the declared source bundle, imports both
`opencode-harness/feedback` and `opencode-harness/quality` through package
exports, runs static and manifest validation, and runs the buffered
infrastructure self-test without a model, network, or live provider. The public
ESM boundary belongs to the unreleased `0.3.0` target; do not couple adapters to
private `lib/feedback/*` or `lib/quality/*` files or assume the tagged `v0.2.0`
package exports them.

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

## Verification

Run the template verifier before publishing or copying changes:

```sh
npm run verify
```

After installing into a live OpenCode configuration, verify the effective
runtime surface:

```sh
npm run verify:runtime
```

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

Use these layers in order:

1. Deterministic repository checks: `npm run verify`, including feedback
   persistence, corpus validation, infrastructure tracing without an LLM, and
   acceptance-engine self-tests. This layer needs no model, network, or live
   adapter, installed OpenCode runtime, or machine-local plugin API package.
2. Installed runtime permission checks: `npm run verify:runtime` against the
   copied profile. For acceptance evidence, bind each profile to its static
   source snapshot with `npm run verify:runtime -- --evidence-profile <id>
   --subject-evidence <static.json>`; fixture permission evidence is not
   trusted for acceptance.
3. Actual behavioural evidence: `npm run eval:live` with explicit
   baseline/candidate profiles, their installed permission artifacts, and a host
   adapter. Baseline/candidate copies are isolated and hidden checks/assertions
   remain runner-only.
4. Candidate assessment: `npm run assess:candidate` over immutable reports,
   first-party static evidence from `npm run evidence:static`, and installed
   permission snapshots. Only fully attested report generations participate;
   the canonical workspace corpus supplies required repetitions and scenario
   fingerprints.

Live evaluation is behavioural evidence, not a replacement for runtime
permission checks. Candidate assessment does not apply changes automatically.
Missing, incomplete, or content-mismatched mandatory evidence makes the whole
decision `inconclusive`.

## Host Adapter Boundary

The live runner executes `OPENCODE_LIVE_EVAL_ADAPTER` in a bounded Node IPC
process and passes a validated, quota-limited trace facade. The adapter is
responsible for invoking the host OpenCode profile and returning its content
attestation. The parent verifies ordinary process-tree teardown before hidden
staging; this boundary is not a full hostile-code OS sandbox. If the host has no
reliable adapter/runtime hook, stop at deterministic and installed-runtime
verification and document the gap. Do not
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

## Normal-session quality bridge

There are two supported runtime layouts.

Project-local:

- keep `.opencode/plugins/engineering-dossier.mjs` in the project;
- install or materialize the `opencode-harness` package so the wrapper can use
  `opencode-harness/quality-plugin`;
- keep `.opencode/quality/checks.json` and any
  `quality/architecture-policy.json` project-local.

Global:

- install the package where the OpenCode host can resolve it;
- copy the minimal wrapper from
  `quality/examples/global-quality-plugin.mjs` into the global OpenCode plugin
  directory;
- keep the check catalog and optional architecture policy in each project.

Runtime-only adoption does not require the evaluation corpus, harness
development fixtures, release documentation, or the complete `scripts/`
directory. The complete portable source bundle remains the supported path for
developing and verifying the harness itself.

Keep `.oc_harness/` ignored. The bridge stores only bounded, fingerprinted
session and registration state under `.oc_harness/quality/`. It does not persist
prompts, completions, raw logs, credentials, private absolute paths, or source
content. Content-sensitive workspace receipts retain relative changed paths and
hashes only. A stale short-lived control-operation lock is recovered only when
its recorded process owner is dead; ambiguous or corrupt locks fail closed. An
external-operation guard is never removed from bridge-PID evidence alone. After
a host crash, independently confirm that the command process tree stopped, then
remove `active-external.json` manually.

The bridge uses `chat.message` to register primary development sessions,
`tool.execute.before` to enforce `edit`, `write`, `apply_patch`, `task`, and
`bash`, `tool.execute.after` to reconcile workspace changes, and `event` for
child-session binding and failed-tool cleanup. `permission.ask` is a secondary
correlation check and never upgrades host policy. A configured architecture
policy and the project check catalog are fingerprint-bound at session start.

## Как работает quality gate

Every primary development session begins `unclassified`. The orchestrator must
call `quality_session_start` before mutation. `standard-lite` is a compact path
for a clean, bounded local task with declared behavior, preserved behavior,
local edge cases, ownership, and trusted checks. It still needs a passed gate,
one-shot mutation authority, post-change verification, and final attestation.
The runner synthesizes this compact dossier; callers must not replace or update
it with `quality_dossier_create` or `quality_dossier_update`.

`high` and `critical` require the full dossier, impact graph, invariants,
edge/failure mappings, baseline evidence, and both architect and reviewer
contributions. The plugin computes the gate. The agent cannot set status,
fingerprints, IDs, verification, attestation, or trusted timestamps.

## Что нужно настроить в проекте

- `.opencode/quality/checks.json` with argv-only real project commands;
- optional `quality/architecture-policy.json`;
- `WORKFLOW.md` for verification order and repository boundaries;
- project-local skills for specialized workflows.

The check runner uses argv-only execution with `shell: false`, bounded
time/output/run budgets, runner-owned before/after workspace observations, and
receipts without raw stdout or stderr. On Windows the command worker enters a
Job Object before it receives permission to spawn the check, and closing the job
kills detached descendants. Platforms without a proven containment controller
fail closed with `QUALITY_CHECK_CONTAINMENT_UNAVAILABLE`; the current POSIX path
does not execute trusted project checks. Durable receipts retain only status,
exit code, signal, duration, stdout/stderr byte counts, and command/evidence
fingerprints. Catalog drift fails the session closed.

## Что computationally enforced

The plugin enforces registration, classification, gate state, exact ownership,
one-shot edit/task capabilities, catalog and architecture drift, control
state tamper detection, post-mutation reconciliation, stale-verification
invalidation, trusted check receipts, and final attestation. Native Bash is
denied before and after classification because the host hook cannot prove
detached-descendant teardown; `quality_command_authorize` returns
`QUALITY_NATIVE_BASH_DISABLED`. Tests/build/lint/typecheck use trusted project
checks, while bounded edits and writable tasks keep one-shot capabilities.
Runner-owned Git observations use a fixed absolute system Git
executable with a minimal environment, disabled hooks/fsmonitor, and no inherited
`PATH` executable resolution.

The plugin binds the project-check catalog when it starts. After intentionally
editing `.opencode/quality/checks.json`, restart/reload the plugin before
classifying a new session; in-process catalog drift fails closed.

This remains process-level enforcement, not an OS sandbox. Project checks run as
the current user and must be trusted project-owned commands. `session.created` does not expose the
originating task call ID, so child binding is serialized and checked for one
child, not claimed as cryptographic causal proof.

Run the model-free checks first:

```powershell
npm run verify
npm run verify:session-classification
npm run verify:project-check-catalog
npm run verify:trusted-project-runner
npm run verify:bash-boundary
npm run verify:normal-session-quality-bridge
npm run verify:quality-verification-targets
npm run verify:runtime:quality-hooks:fixture
npm run verify:global-quality-plugin-export
```

Then, in the adopted live OpenCode configuration, run:

```powershell
npm run verify:runtime
npm run probe:runtime:quality-plugin-api
npm run verify:runtime:quality-hooks
```

`probe:runtime:quality-plugin-api` proves only installed API/factory
compatibility. `verify:runtime:quality-hooks` is the real host boundary and can
return `passed` only through an explicitly selected trusted adapter. The parent
creates the temporary Git workspace and nonce, independently checks the exact
authorized file effect, rejects forbidden mutation, and binds initial/final
workspace plus pre/post transitive source fingerprints. Host evidence must show
the complete standard-lite, one-shot mutation, after-hook reconciliation,
project-check, and final-attestation chain. A standalone evidence file is only
untrusted parser input and returns `blocked_external_state`; it cannot elevate
itself to `passed`. Missing host/provider/adapter also returns
`blocked_external_state`; no deterministic check fabricates host discovery or
callback invocation.
The API probe is therefore an explicit installed-runtime smoke and is not a
stage of the clean-checkout `npm run verify` chain.

Agent frontmatter is the only model configuration authority. Changing a
`model:` line does not require updating a generated catalog. Preserve the
agent's role prompt and permission block; treat `reasoningEffort` and
`textVerbosity` as optional provider-specific settings.
