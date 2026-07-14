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
   adapter.
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

Copy `.opencode/plugins/engineering-dossier.mjs`, `lib/quality/`, and the
checked `quality/` contracts together. The bridge imports the installed
`@opencode-ai/plugin` tool factory at host load time; it is intentionally not
an npm dependency of this template.

Keep `.oc_harness/` ignored. The bridge stores only bounded, fingerprinted
session state under `.oc_harness/quality/sessions/`. It does not persist
prompts, completions, raw logs, credentials, private absolute paths, or source
content. Content-sensitive workspace receipts retain relative changed paths and
hashes only. Stale runner locks are recovered only when their recorded process
owner is dead; ambiguous or corrupt locks fail closed.

The authoritative mutation boundary is `tool.execute.before`, using the exact
OpenCode 1.17.20 argument shapes for `edit`, `write`, `apply_patch`, and `task`.
The declared `permission.ask` callback is not treated as authoritative because
that OpenCode version does not call it from the permission service. A configured
`quality/architecture-policy.json` is loaded, fingerprint-bound, and evaluated
runner-side during dossier finalization.

Run the model-free checks first:

```powershell
npm run verify
npm run verify:normal-session-quality-bridge
npm run verify:quality-verification-targets
npm run verify:runtime:quality-hooks:fixture
```

Then, in the adopted live OpenCode configuration, run:

```powershell
npm run verify:runtime
npm run verify:runtime:quality-hooks
```

The second command exits nonzero for both failed and incomplete enforcement.
Its model-free probe separates local API/factory compatibility from host
plugin discovery, callback invocation, and effective adopted permissions.
Those host facts remain incomplete without an end-to-end host session. The
shell-mutation boundary is also incomplete when the host provides only a
generic bash permission event rather than a structured repository-write
classification. Child task binding is serialized and cardinality-checked, but
the host event does not include the originating task call ID, so causal binding
also remains incomplete. The host supplies no independent high/critical label
before dossier creation; uninstrumented sessions stay open for lightweight
`standard-lite` work, while prompts require high/critical work to enter the
bridge first. Do not describe that profile as universally gated.

Agent frontmatter is the only model configuration authority. Changing a
`model:` line does not require updating a generated catalog. Preserve the
agent's role prompt and permission block; treat `reasoningEffort` and
`textVerbosity` as optional provider-specific settings.
