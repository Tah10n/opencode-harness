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

1. Install or configure the capability packages:
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

Expected runtime result: the orchestrator and read-only agents expose the
minimal safe `context_*` surface (`context_outline`, `context_files`,
`context_search`, and `context_read`), while `oc_learning_*` write tools are
available only through the bounded self-improvement path. Advanced
recursive-context tools are host opt-ins.

## Как работает quality gate

1. `chat.message` регистрирует каждую primary development session как
   `unclassified`.
2. До записи orchestrator вызывает `quality_session_start` и указывает риск,
   цель, ownership и trusted project checks.
3. Маленькая локальная задача проходит компактный `standard-lite`: behavior
   expectation, preserved behavior, локальные edge cases и bounded scope. Полный
   impact graph для неё не нужен. Dossier синтезирует runner; агент не вызывает
   для него `quality_dossier_create` или `quality_dossier_update`.
4. `high` и `critical` требуют полный Engineering Dossier, impact graph,
   invariants, edge/failure mappings, baseline evidence и независимые
   contributions от architect и reviewer.
5. Gate оценивает plugin/runner, а не агент. До runner-owned `passed` edit,
   write, patch и writable `task.general` запрещены. Native `bash` остаётся
   запрещённым и после gate, потому что host hook не доказывает teardown всех
   detached descendants.
6. После gate выдаётся одноразовое разрешение на точные файлы для bounded edit
   или writable task. Tests, lint, typecheck и build запускаются только как
   runner-owned project checks.
7. Plugin сравнивает workspace до и после изменения и блокирует выход за
   ownership. Изменение `.oc_harness` также обнаруживается отдельным control-state
   guard. Если host аварийно завершился во время project check, durable guard
   остаётся fail-closed до подтверждённого восстановления control state.
8. Project checks запускаются только из `.opencode/quality/checks.json` через
   argv и `shell: false`. Любое новое изменение делает старую verification stale.
9. Финальная attestation возможна только для текущего workspace после всех
   обязательных trusted checks.

Native `bash` не имеет allowlist ни до, ни после классификации;
`quality_command_authorize` возвращает `QUALITY_NATIVE_BASH_DISABLED`.
Внутренние read-only Git
наблюдения runner выполняет только через абсолютный executable из фиксированного
system install location и с минимальным очищенным environment.

## Что нужно настроить в проекте

- `.opencode/quality/checks.json` с реальными unit, lint, typecheck, build или
  integration commands;
- опциональный `quality/architecture-policy.json`;
- `WORKFLOW.md` с порядком локальной проверки и operational boundaries;
- project-local skills для специализированных workflows.

Project-local режим использует `.opencode/plugins/engineering-dossier.mjs` в
полном source bundle. Global режим устанавливает пакет, кладёт минимальный
wrapper из `quality/examples/global-quality-plugin.mjs` в global OpenCode plugin
directory и всё равно читает project-local checks и architecture policy. Для
runtime-only adoption не нужны eval corpus, harness fixtures, release docs и
весь `scripts/`; полный bundle остаётся путём разработки самого harness.

## Что computationally enforced

- регистрация и lifecycle session;
- запрет mutation до classification и gate;
- bounded ownership, one-shot edit/task capabilities и replay denial;
- immutable architecture-policy/catalog fingerprints и drift detection;
- runner-owned check execution, before/after workspace binding, receipt limits
  и отсутствие raw stdout/stderr в state. Durable receipt хранит только status,
  exit code, signal, duration, stdout/stderr byte counts и command/evidence
  fingerprints;
- invalidation verification после любого изменения и runner-owned attestation.

Реальное host wiring нельзя доказать одним factory import. Команда
`probe:runtime:quality-plugin-api` проверяет только API/factory. Отдельная
`verify:runtime:quality-hooks` требует явно выбранный доверенный host adapter.
Verifier сам создаёт временный Git workspace и nonce, независимо наблюдает
разрешённый file effect и повторно связывает transitive source fingerprint.
Standalone evidence-файл проверяется только как недоверенный parser input и не
может дать `passed`. Успех требует полной цепочки standard-lite → one-shot
capability → authorized mutation → after-hook reconciliation → project check →
final attestation. Если host/model/provider или adapter недоступен, команда
честно возвращает `blocked_external_state`.
`tool.execute.before` остаётся authoritative mutation boundary;
`permission.ask` только сверяет host permission и никогда не повышает `ask` или
`deny`. Это не OS sandbox: project checks выполняются с правами текущего
пользователя. На Windows runner помещает worker и всех descendants в Job Object
с `KILL_ON_JOB_CLOSE`; без доказуемого controller (включая текущий POSIX path)
execution fail-closed с `QUALITY_CHECK_CONTAINMENT_UNAVAILABLE`. Даже Windows
containment не является изоляцией hostile code от сети или доступных пользователю
файлов, поэтому catalog должен содержать только доверенные project-owned checks.

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
`npm run verify` is the runner-owned sequential aggregator. It emits bounded
in-memory receipts for every deterministic DoD check and exits as `verified`
when those mandatory checks pass. Installed-runtime evidence and general live
evidence are optional external inputs. In particular,
`probe:runtime:quality-plugin-api` is intentionally excluded from this default
chain because it resolves a machine-local `@opencode-ai/plugin` installation.
These commands validate contracts, schemas, failure
cases, corpus structure, and evaluation logic. The prompt inventory covers 11 agent prompts and eight
skill entrypoints. These checks do not prove an installed model profile or
actual model behaviour.

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
