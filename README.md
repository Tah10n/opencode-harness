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
7. Plugin сравнивает bounded source workspace до и после изменения: tracked
   changes, untracked non-ignored files, explicit ownership, explicit generated
   outputs, Git index и `HEAD`. Обычные ignored trees (`node_modules`, `.env`,
   coverage/build output и подобные) не обходятся целиком. Generated outputs
   наблюдаются отдельно и не маскируют изменения source workspace. Изменение
   `.oc_harness` также обнаруживается отдельным control-state guard.
8. Project checks объявляют логический `executable_id` в
   `.opencode/quality/checks.json`. `.opencode/quality/toolchains.json` связывает
   его с разрешённым resolver family; runner не ищет executable через ambient
   `PATH`, повторно проверяет identity непосредственно перед spawn, передаёт
   очищенный environment и всегда использует `shell: false`.
9. Для bug-fix в `standard-lite` один reproducer запускается до изменения и как
   integration regression после него. Runner различает ожидаемое падение,
   последующий pass, unrelated result и bounded unavailable с явной причиной;
   существенная неопределённость блокирует компактный путь.
10. При настроенной architecture policy high/critical session принимает только
    freshly created или rewritten runner-owned final graph из выделенного
    integration check (не ранее существовавший неизменённый артефакт), заново оценивает
    итоговую архитектуру и не выдаёт attestation при отсутствующем, stale,
    unavailable или failed evidence. Любое новое source-изменение делает старую
    verification stale.
11. Финальная attestation возможна только для текущего source workspace после
    всех обязательных trusted checks и, когда требуется, post-edit architecture
    evaluation.

Native `bash` не имеет allowlist ни до, ни после классификации;
`quality_command_authorize` возвращает `QUALITY_NATIVE_BASH_DISABLED`.
Внутренние read-only Git
наблюдения runner выполняет только через абсолютный executable из фиксированного
system install location и с минимальным очищенным environment.

## Что нужно настроить в проекте

- `.opencode/quality/checks.json` с реальными unit, lint, typecheck, build или
  integration commands;
- `.opencode/quality/toolchains.json` с логическими executable IDs и только
  реально используемыми resolver families;
- опциональный `quality/architecture-policy.json`;
- `WORKFLOW.md` с порядком локальной проверки и operational boundaries;
- project-local skills для специализированных workflows.

Project-local режим использует `.opencode/plugins/engineering-dossier.mjs` в
полном source bundle. Global режим устанавливает пакет, кладёт минимальный
wrapper из `quality/examples/global-quality-plugin.mjs` в global OpenCode plugin
directory и всё равно читает project-local checks и architecture policy. Для
runtime-only adoption не нужны eval corpus, harness fixtures, release docs и
весь `scripts/`; полный bundle остаётся путём разработки самого harness.

Project-local `toolchains.json` содержит только logical IDs и resolver families,
никогда host paths. `node` и `npm` по умолчанию разрешаются из canonical Node
installation вместе с fixed-location identity-bound Git. Для `python`,
`pytest`, `go`, `cargo`, `java`, `maven` и `gradle` host должен положить
`quality-toolchains.host.v1.json` рядом с global wrapper; wrapper передаёт свой
`import.meta.url` как host-owned anchor. Файл валидируется по
`quality/schemas/toolchain-host-configuration.schema.json`, должен находиться
вне workspace и задаёт trusted code roots, отдельные writable state roots,
fixed candidates и auxiliary Git. Project-local wrapper намеренно не может
выдать project-файл за host configuration.

Resolver запускает Python/Go/Cargo/Java напрямую, pytest как fixed
`python -I -m pytest`, npm через identity-bound CLI, а Maven/Gradle через прямые
Java entry points с fingerprint-bound distribution manifest. Maven получает
изолированный JVM `user.home`; Gradle получает fixed
`--gradle-user-home`, `--project-cache-dir`, JVM/state properties и
`--no-daemon`, поэтому project argv не может переназначить resolver-owned state.
Java/Maven/Gradle `@argfile` запрещён. Maven запускается с четырьмя
identity-bound empty settings/toolchains controls; автоматические user settings,
toolchains и extensions в writable state root, а также project extensions fail
closed. `.mvn/maven.config`, все `gradle.properties` от фактического check cwd
до workspace root, user properties и installation properties проходят bounded
validation и identity binding. Gradle installation `init.d` входит в distribution
manifest, а автоматические init scripts в writable state root fail closed. Shell scripts на
POSIX допускаются только с одним absolute shebang interpreter; Windows
`.cmd`/`.bat` launchers, symlinks, hard links, неизвестные distribution layouts
и project-local substitutions fail closed. Mutable cache/state roots отделены
от trusted code и workspace и не считаются code evidence. Фактический cwd
identity проверяется до sync worker, после containment и в contained child прямо
перед spawn. Внутренний sync worker запускается не через ambient host
`process.execPath`, а через отдельный identity-bound Node из fixed host config;
это сохраняет тот же containment contract внутри bundled Bun/OpenCode host и
для non-Node project checks. Receipt отдельно связывает host-config, resolution-policy,
runtime-metadata/config-inventory и sanitized-environment fingerprints; policy
`trusted-toolchain-resolution-v4` не принимает старые v3 receipts.

## Что computationally enforced

- регистрация и lifecycle session;
- запрет mutation до classification и gate;
- bounded ownership, one-shot edit/task capabilities и replay denial;
- immutable architecture-policy/catalog/toolchain-map fingerprints и drift
  detection;
- bounded source/output workspace observation, ignored-tree exclusion и
  index/`HEAD` binding; меж-job receipt provenance использует отдельный
  portable source attestation без inode/mtime, тогда как local snapshot сохраняет
  строгую filesystem identity;
- runner-owned check execution, pre-spawn executable identity revalidation,
  before/after workspace binding, containment receipts, receipt limits
  и отсутствие raw stdout/stderr в state. Durable receipt хранит только status,
  exit code, signal, duration, stdout/stderr byte counts и command/evidence
  fingerprints;
- honest standard-lite pre-fix/integration reproducer outcomes;
- runner-owned post-edit architecture evidence для configured high/critical
  policy;
- invalidation verification после любого изменения и runner-owned attestation.

Реальное host wiring нельзя доказать одним factory import. Команда
`probe:runtime:quality-plugin-api` проверяет только API/factory. Отдельная
`verify:runtime:quality-hooks` требует явно выбранный доверенный host adapter.
Verifier сам создаёт временный Git workspace и nonce, независимо наблюдает
разрешённый file effect и повторно связывает transitive source fingerprint.
Standalone evidence-файл проверяется только как недоверенный parser input и не
может дать `passed`. Детерминированный fixture проверяет десять структурированных
сценариев, включая disabled Bash, one-shot capability/replay denial, forbidden
mutation, reconciliation, trusted check и final attestation, но не выдаёт себя
за установленный host. Реальный успех требует той же полной цепочки через
host-active callbacks. Если host/model/provider или adapter недоступен, команда
честно возвращает `blocked_external_state`.
`tool.execute.before` остаётся authoritative mutation boundary;
`permission.ask` только сверяет host permission и никогда не повышает `ask` или
`deny`. Это не OS sandbox: project checks выполняются с правами текущего
пользователя. На Windows runner помещает worker и всех descendants в Job Object
с `KILL_ON_JOB_CLOSE`; на Linux использует только заранее делегированный writable
cgroup v2 root. Coordinator и watchdog остаются за пределами root; idle worker
первично присоединяется к фиксированному leaf через root-owned
`sudo-helper-v1`, который принимает только PID из отдельного workload UID и
имеет единственное фиксированное назначение. Sudo policy разрешает только этот
helper, а запись в guard отдельно проверяется как запрещённая. Workload может
перемещаться между root и своими sibling-cgroups, но
root-level `cgroup.kill` всё равно охватывает их; teardown требует
`cgroup.events: populated 0` и удаления всех descendants с сохранением самого
делегированного root. Linux workload principal не должен иметь более широких
`sudo`/root capabilities. Process group никогда не считается доказательством
containment.

macOS не является Linux и не предоставляет cgroup/Job Object API. На macOS
harness использует `macos-exclusive-uid-v1`: весь coordinator запускается под
отдельным non-root/non-admin real UID, а root-owned controller устанавливается
вне workspace с mode `0555` под полностью root-owned/non-writable canonical
path ancestry. Host дополнительно создаёт root-owned marker с точным содержимым
`opencode-quality-exclusive-uid-v1:<uid>\n` и соседний `<marker>.lease`, который
принадлежит workload UID и имеет точный mode `0600`. Marker явно подтверждает,
что UID выделен для harness; controller берёт inode lease до любых сигналов.
Controller связывает coordinator ancestors по PID + start time; каждый другой
живой процесс с этим real UID входит в workload boundary даже после
fork/exec/`setsid`/reparenting. Teardown сначала останавливает boundary до fixed
point, затем посылает `SIGKILL` и требует два пустых UID-scan без zombies.
Закрытие stdin после смерти coordinator запускает тот же teardown; concurrent
scope отклоняется занятым lease. Перед `READY` controller под тем же lease
удаляет автоматически запущенные macOS per-user agents и доказывает пустой
boundary, сохраняя только identity-bound ancestors и текущий worker. Нужны
`OPENCODE_QUALITY_MACOS_CONTROLLER` и
`OPENCODE_QUALITY_MACOS_WORKLOAD_UID`, а также
`OPENCODE_QUALITY_MACOS_UID_MARKER`; путь lease выводится как
`<marker>.lease`. Обычный login account без host marker не принимается даже
если в момент проверки он пуст. Workload principal не должен иметь `sudo`,
setuid или иной путь смены UID. Поскольку trusted-toolchain contract не следует
за symlink/shim Git, host также устанавливает singly linked root-owned копию
реального Git binary в `/usr/local/libexec/opencode-quality-git/bin/git`; канонический
CI provisioning проверяет её от workload UID.

Binary root-owned, но не setuid: watchdog выполняется как workload UID. Поэтому
это полная lifecycle-поддержка для доверенных project-owned checks, а не защита
от намеренного same-UID кода, который атакует сам watchdog. Неожиданный выход
controller всегда делает receipt failed/unverified, но не превращает механизм в
adversarial sandbox.

Такая изоляция не защищает от privilege escalation, сети или других доступных
пользователю файлов, поэтому catalog должен содержать только доверенные
project-owned checks.

Containment setup имеет отдельный bounded deadline; execution timeout начинается
только после readiness. Adapter cwd повторно identity-checkится до/после spawn,
после containment и внутри worker перед импортом project module.

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
`--fixture-contract` is explicitly unable to create that bundle. GitHub Actions
uploads deterministic, Windows, Linux, and macOS bundles and reports the absent
installed adapter as bounded external state; it cannot claim milestone-wide
`verified` until a `trusted_adapter` host bundle from the same HEAD/run exists.

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
