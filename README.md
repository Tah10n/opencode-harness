# opencode-harness

[![Verify](https://github.com/Tah10n/opencode-harness/actions/workflows/verify.yml/badge.svg)](https://github.com/Tah10n/opencode-harness/actions/workflows/verify.yml)

Risk-adaptive OpenCode engineering profiles.

`core` is the small development default: project-aware inspect, edit, targeted
verification, and final-diff review without a quality lifecycle or mandatory
subagents. Install it from a clean tracked checkout with the deterministic
materializer:

```sh
npm run profile:materialize -- --profile core --output /path/to/profile
```

`deep` is currently an unpromoted development candidate for broad multi-module
work; do not use it as a product recommendation until medium-task evidence is
positive. Legacy `assurance` is retained only for historical research and
replay. Neither mode is silently activated by `core`.

| Profile | Status | Adds | Excludes |
| --- | --- | --- | --- |
| `plain` | Benchmark baseline | Built-in coding agent | Harness prompts and lifecycle |
| `core` | Unpromoted development default | Compact rules and host-owned verification gate | Recursive context, quality state, learning writes, lab |
| `deep` | Unpromoted development candidate | Host-owned bounded repository map experiment | Product recommendations and quality lifecycle |
| `assurance` | Deprecated research-only | Four-operation compatibility facade over v0.3 controls | Product recommendations and release claims |
| `lab` | Developer bundle, not an agent | Profile-transition experiments, fixtures, statistics, replay, traces | User runtime claims |

Materialize `deep`, or legacy `assurance` for research reproduction, by
changing `--profile`; add `--dry-run` to inspect the stable manifest and
fingerprint first. Existing output is refused unless it is an unchanged managed
bundle and `--force` is explicit.

The output is an OpenCode configuration directory, not a project workspace.
Run OpenCode in the target project and point `OPENCODE_CONFIG_DIR` at the
materialized directory. An assurance workspace keeps its project-owned
`.opencode/quality/checks.json` and `toolchains.json`; the config directory
keeps the host-owned `plugins/quality-toolchains.host.v1.json`. The materializer
never invents machine identities and preserves that reserved host file across
a verified `--force` replacement.

### Evidence status

The historical v0.3 `plain → instrumented` experiment found
`no_clear_difference` on primary functional correctness, while verification
omissions fell and duration/timeouts rose. It does not justify making the
heavy lifecycle the default. See
[the v0.3 research result](docs/research/v0.3-instrumented.md).

Proven model-free in v0.4: profile closure, prompt budget, effective
permissions, portable materialization, facade-only standard and high-risk
assurance lifecycles, structural child-assignment binding, legacy v2 reader compatibility,
byte-bound cumulative arm materialization, rendered medium/high topology,
runner-owned pair aggregation, receipt-recomputed observations, an in-process
standard-to-full authorization boundary, and frozen promotion thresholds. The installed
OpenCode probes additionally load P0-P5, invoke all four P4/P5 context tools,
confirm that P4 creates no quality state, and confirm one P5 receipt per context call. These checks do
not prove that `deep` or `assurance` improves model-backed outcomes. The vNext
contract requires paired smoke and standard runs before promotion; unavailable
runtime evidence remains `blocked-unproven` and is never scored.

### Migration from v0.3

The source default changes from `orchestrator` to `core`. Historical
`profile-only` and `instrumented` definitions and readers remain replay-only
compatibility surfaces. The former broad-context use case is now represented by
an unpromoted host-map experiment; the legacy high-risk lifecycle is retained
for research rather than recommended.
The old complete portable bundle remains documented below as the legacy/lab source closure;
new installations should use the v3 materializer.

Development status: this checkout targets unreleased `0.4.0`. The latest
tagged release remains `v0.2.0`; v0.3 is retained as a research contract rather
than a promoted release claim.

## Legacy v0.3 architecture and lab reference

The remainder of this document preserves exact v0.3 operational and report
contracts for existing verifiers and historical replay. They are not the v0.4
default workflow.

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
- a runner-selected wide/deep context strategy with bounded context receipts,
  a linked Whole-System Context Report, computational sufficiency, and final
  blast-radius reconciliation;
- an executable feedback plane: schema-v2 operational traces, immutable live
  reports, paired baseline/candidate assessment, and explicit decisions;
- an OpenCode-native quality bridge with bounded dossier tools and runner-owned
  `tool.execute.before` decisions for native edits and writable delegation;
- host-owned model selection with model-neutral core `agents/*.md`
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

Historical development status: this section described unreleased `0.3.0`. The latest
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
adoption
agents
benchmarks
commands
docs
evals
examples
fixtures
lib/benchmark
lib/feedback
lib/quality
native
opencode.json
package-lock.json
package.json
profiles
quality
scripts
skills
```
<!-- portable-adoption-bundle:end -->

The plugin is not a standalone file: it imports the `lib/quality/` boundary,
and the package smoke imports both `opencode-harness/feedback` and
`opencode-harness/quality`. The `adoption/`, `benchmarks/`, `profiles/`, and
`lib/benchmark/` entries are the executable synthetic-benchmark contract
closure. Do not replace the explicit plugin path with all of `.opencode/`, and
do not copy `.opencode/node_modules`,
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
[docs/subagent-result-schema.md](docs/subagent-result-schema.md). Model-neutral
host-selection guidance lives in
[docs/model-profiles.md](docs/model-profiles.md).

## Synthetic Ablation Benchmark

The separate synthetic benchmark compares the same host-selected model as
`plain`, `profile-only`, or `instrumented` without changing the existing
release acceptance contract. The model is never told its profile or arm;
`profile-only` and `instrumented` receive byte-identical agent/skill prompts.
Every arm sees the same neutral exact changed-path scope, and validation scans
the actual materialized tool/schema descriptions for evaluator labels. Run
report v5 binds that scope, semantic/trajectory identity, and the canonical
OpenCode executable while publishing bounded scope, control-lifecycle, and
polarity-aware semantic review-match audit evidence without raw model text or
hidden paths. Relational validation binds counts and outcomes to the canonical
instance; unexpected paths are exposed only as bounded SHA-256 identifiers.
Functional `task_correct` and end-to-end `whole_task_success` are reported
separately, including a separately labeled QuixBugs-derived source stratum.
Validate the model-free machinery and run any selected pair of distinct
profiles in the bounded eight-agent micro suite with:

```powershell
npm run bench:synthetic:validate
npm run bench:synthetic:self-test
npm run verify:benchmark:model-free
npm run bench:synthetic -- --suite micro --baseline plain --candidate instrumented --seed 20260728 --semantic-variants 1 --trajectory-repetitions 1
```

Either side may instead be `profile-only`; every two distinct profiles and
both directions are valid while the micro cost remains eight agent runs.

Configure `OPENCODE_BENCH_MODEL` in the host or add
`--model <host-selected-model>`. Missing model/runtime state returns
`blocked_external_state` with exit code 2; it never creates fake passing
evidence. A completed command means the comparison evidence is complete, not
that the candidate won. Model-free checks do not prove model quality. Paired
execution is deterministically balanced across the whole requested suite.
Standard and full execute as canonical family shards and produce a verdict only
after strict complete-universe merge. New single-profile replay artifacts use
source-bound replay report v4; replay v1-v3 remain readable only as historical
structure.
No-progress provider timeouts are external-state/incomplete evidence and are
excluded rather than scored as task failures. `task_correct` never depends on
treatment-trace completeness; that remains visible in `trace_policy` and
`whole_task_success`.

### Reference benchmark results

The result below is `plain` → `instrumented`, with the paired difference in
parentheses. It is a harness ablation within one model, not a model ranking.

| Model / evidence | Sample | Functional `task_correct` | `whole_task_success` | Held-out pass | Verification omission | Mean duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-5.6-luna`, `low` (current v5) | 160 pairs | 85.00% → 86.88% (+1.88 pp) | 10.63% → 75.00% (+64.38 pp) | 86.88% → 87.50% (+0.63 pp) | 57.50% → 11.25% (-46.25 pp) | 32.3 s → 166.2 s (+133.9 s) |

The current run completed on 2026-08-12 using OpenCode 1.18.16, a 300,000 ms
per-agent timeout, 16 families, five semantic variants, and two paired
trajectories per variant (320 fresh OpenCode sessions). Its seed was
`luna-low-full-20260812`.

The primary equal-family `task_correct` delta was +1.88 pp with a 95%
family/semantic/trajectory bootstrap interval of -13.13 to +18.13 pp and an
exact family sign-flip `p=0.8125`. The policy verdict was therefore
`no_clear_difference`: directional significance was not established, and the
new-canary-safety-regressions guardrail counted 12 regressions. The much larger
`whole_task_success` gain and lower verification-omission rate are useful
operational observations, not a substitute for the primary quality verdict.
The run had no incomplete pairs, no broker or containment failures, no scope
violations, and verified teardown for all sessions. Its canonical run ID is
`synthetic-merged-run-dbd0ee31-bae7-4c44-ab3e-cab3a2423fbc`.

The current run's timeout rate was 0.00% → 10.63% (+10.63 pp).

See [docs/synthetic-benchmark.md](docs/synthetic-benchmark.md) for the profile
contracts, 16 families, micro/smoke/standard/full commands, fairness and hidden-data
isolation, paired statistics, report privacy, replay, manual CI, and the strict
separation from `npm run assess:candidate`.

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
2. In a registered quality session, the orchestrator calls
   `quality_session_start` first, before native reads/globs, skill discovery,
   todo creation, shell checks, or delegation. It classifies from the visible
   request and allowed ownership paths, then executes only the first
   runner-recommended action and re-inspects after it settles.
3. A clean, bounded local task may use `standard-lite`: declared behavior,
   preserved behavior, local edge cases, ownership, and trusted checks. The
   runner synthesizes this compact dossier; callers do not replace or update it
   with `quality_dossier_create` or `quality_dossier_update`. A deterministic
   one-function async/cancellation repair can remain local; shared-state races,
   locks, durable persistence, security, migration, architecture changes, and
   intentional public-contract changes still require escalation. The narrow
   `user_visible_goal`, not a broader model-authored algorithm summary, is the
   authoritative requested behavior. Unmentioned initialization, return values,
   public shapes, and local boundary behavior remain preserved. A fresh
   standard-lite session exposes only one immediate context read; finalization
   is recommended only after that receipt is recorded.
4. For `high` and `critical`, the runner-selected strategy begins with a
   provisional Engineering Dossier draft, inferred partial impact graph, linked
   draft report, and explicit blocking unknown created by the runner during the
   start or monotonic escalation transition. Bounded context receipts must
   replace the provisional analysis before finalization; the seed is not gate
   evidence.
5. Actual bounded context operations create runner-owned context receipts through
   the runner observer or trusted normal-session host hook; live adapters cannot
   mint receipts from self-described output. Instrumented context operations and
   serialized read-only child tasks run one at a time so each result is settled,
   bound, and incorporated before the next launch.
6. Evidence refines the Dossier through `quality_dossier_update` and the linked
   report through `quality_context_report_update`. The agent then calls
   `quality_context_report_finalize`.
7. Wait for the current runner-owned sufficient context decision. Architect and
   reviewer then challenge the canonical current challenge subject: current
   Dossier analysis, selected strategy, finalized report analysis, exact
   sufficiency decision, and task-profile evidence. `quality_dossier_finalize`
   then evaluates the existing gate. Report
   finalization, context sufficiency, and Dossier finalization do not authorize
   mutation; only a runner-owned passed gate authorizes mutation. Native `bash`
   remains disabled in an instrumented quality session.
8. A passed gate issues one-shot authority for exact owned paths. Tests, lint,
   typecheck, and builds run only as runner-owned trusted project checks. A
   failed check first routes to a runner-assigned read-only `diagnose` child,
   which must inspect the current source plus visible tests/check definitions
   and identify a concrete contract mismatch (or bounded uncertainty). Only
   after that diagnosis can the runner issue a new bounded remediation edit
   before another verifier. `standard-lite` terminalizes after six linked
   verifier attempts so a weak model cannot turn a local repair into an
   unbounded edit/check loop;
   after trusted verification and a passed reviewer receipt, the final
   workspace is sealed and the only remaining path is reconciliation plus
   attestation. A reviewer receipt with blocked checks or unplanned items
   instead exposes one explicit bounded remediation action. Rejected speculative
   edits do not invalidate the passed verification or reopen mutation authority.
   High and critical lifecycles keep their separate budgets. The expanded
   normal-session bridge regression suite has one explicit reviewed 20-minute
   verifier budget; other ordinary deterministic stages retain the 10-minute
   default, so a valid long fixture is not mistaken for a failed check without
   making verification unbounded.
9. The runner compares the bounded source workspace before and after mutation:
   tracked changes, untracked non-ignored files, exact ownership, declared
   generated outputs, the Git index, and `HEAD`. Ordinary ignored dependency,
   cache, and build trees stay outside the source walk; `.oc_harness` has a
   separate control-state guard. Persistent index identity uses semantic staged
   entries, so a read-only Git stat-cache refresh is ignored, while raw index
   identity still guards races inside one atomic observation.
10. Project checks declare a logical `executable_id` in
   `.opencode/quality/checks.json`. `.opencode/quality/toolchains.json` maps it
   to an approved resolver family. The runner avoids ambient `PATH`, rechecks
   identity immediately before spawn, sanitizes the environment, and uses
   `shell: false`.
11. A `standard-lite` bug fix binds one catalog check as both the pre-fix
   reproducer and the integration regression. The runner records expected
   pre-fix failure, post-fix pass, unrelated outcome, or bounded unavailability
   with an explicit reason. Unexpected pass, unrelated evidence, and material
   uncertainty block the compact path. When exactly one trusted reproducer is
   available, the runner selects it even if the model omits or guesses an ID;
   model input can select only among multiple runner-listed checks.
12. A configured high/critical architecture policy accepts only a freshly
    created or rewritten runner-owned final graph from its integration check.
    Missing, stale, unavailable, failed, or policy-violating evidence cannot
    produce attestation.
13. Before attestation, the runner derives the exact final diff and resolves
    immutable reviewer evidence. A linked final reviewer must first create
    current `context_read` receipts for every retained changed source path; the
    model cannot pass review with an ungrounded compact outcome. A passed review
    must cover the runner's exact ordered clause IDs and bind every clause to a
    current source path, an exact snippet present in that file, and a distinct
    `input`/`observed`/`expected` execution trace. The raw snippets remain
    transient; durable evidence retains their contract fingerprint. The runner
    then reconciles that evidence with planned ownership,
    report coverage, public contracts, dependency and side-effect edges, and
    critical-path verification. Adapter-declared diff or reviewer claims are
    never trusted. An unplanned high-impact path invalidates prior sufficiency
    and requires re-analysis.
14. Final attestation is valid only for the current source workspace after all
    mandatory trusted checks, any required post-edit architecture review, and
    final context reconciliation.

The only in-session project-catalog drift exception is
`quality_project_catalog_rotate`. It is orchestrator-only and accepts one
restarted, passed owner session after exactly one settled same-session edit.
The caller must restart the plugin after changing the catalog and invoke this
tool before any ordinary quality operation. The runner reconstructs the
previous catalog from sorted timeout increases, proves both catalog epochs map
to the gate's unchanged engineering-check fingerprint, binds the exact mutation
call and workspace delta, then commits one fingerprinted receipt owner-first
and registry-second. Exact replay, owner-first recovery, and fully committed
replay are idempotent; registry-first or mismatched histories fail as split
brain. Every other catalog change still fails closed as
`QUALITY_CHECK_CATALOG_DRIFT`.

## How The Agent Understands A Change

For high or critical work, the agent builds understanding in a visible loop:

1. `chat.message` registers the task, and `quality_session_start` classifies its
   risk and selects the minimum context strategy.
2. The runner seeds a provisional Engineering Dossier draft, inferred partial
   impact graph, linked draft report, and blocking unknown during the typed
   start or monotonic escalation transition. Legacy explicit full-dossier flows
   may still use `quality_dossier_create`; the ordinary structured path does not
   require the model to invent a complete graph before it can collect evidence.
3. The agent reads one relevant area at a time. Each bounded operation produces a
   runner-owned context receipt; instrumented read-only children are serialized.
4. New evidence must replace or refine the provisional map. The agent applies
   those changes through `quality_dossier_update` rather than treating the
   runner seed as observed coverage.
5. `quality_context_report_update` records the wide affected-system view and the
   deep failure analysis for every critical path.
6. `quality_context_report_finalize` finalizes the Whole-System Context Report.
   Missing direct evidence or unresolved transitive impact produces a non-sufficient
   runner decision. A genuinely local path may instead prove that no transitive
   consumer exists, but only with complete runner-owned evidence; agent prose or
   a partial search is never enough.
7. Wait for the current runner-owned sufficient context decision. Architect and
   reviewer then challenge the canonical current challenge subject: current
   Dossier analysis, selected strategy, finalized report analysis, exact
   sufficiency decision, and task-profile evidence, including exclusions,
   counterexamples, edge cases, and test design. The runner also supplies the
   narrow goal and preservation contract, so a challenge cannot replace the
   requested delta with a speculative conventional design.
8. `quality_dossier_finalize` evaluates the existing Engineering Dossier gate.
   Neither report finalization, context sufficiency, nor Dossier finalization is
   mutation authority.
9. Only a runner-owned passed gate permits exact, one-shot writes.
10. After implementation, the final reviewer reads retained changed files and
    retained impact-graph source nodes, traces every explicit behavior, edge,
    preservation, and counterexample clause, and treats a targeted check as
    evidence only for its executed scenario. Independently declared edge cases
    remain separate review clauses and counterexamples rather than being folded
    into one generic fallback. Verification and exact-diff
    reconciliation compare the result with the current report and workspace,
    not an earlier plan or diff.

Genuinely local `standard-lite` work keeps a short local plan and bounded local
evidence. When that evidence discovers non-local impact, the runner returns one
typed monotonic escalation action and moves the session to high-path dossier
refinement instead of repeating local reads. See [Whole-System Context](docs/whole-system-context.md) for the exact
strategy, receipt, fallback, sufficiency, and reconciliation contracts.

Persisted quality run directories can be assessed without trusting an in-memory
outcome. `npm run assess:quality-bundles` revalidates every bundle and its paired
check catalog before applying the versioned policy. This is separate from the
general live-report command `npm run assess:candidate`:

```powershell
npm run assess:quality-bundles -- `
  --policy quality/acceptance/acceptance-policy.v3.json `
  --bundle <baseline-run-directory> --catalog <baseline-check-catalog.json> `
  --bundle <candidate-run-directory> --catalog <candidate-check-catalog.json>
```

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

Normal-session owner records are written as schema v6 and session-registry
records as schema v3. Strict owner v5 and registry v2 records remain readable
and retain their schema on ordinary writes; only a successful catalog rotation
upgrades that pair. Minimal child links remain an independent schema v5 for
active, closed, and quarantined states. Rotation history preserves the initial
catalog epoch for preimplementation receipts and the current epoch for
integration receipts. Registry writers use complete, atomically published
lease files: live, malformed, partial, or identity-substituted leases fail
closed, while an expired lease is reclaimed only after its recorded process is
confirmed dead. Competing reclaimers serialize through a no-clobber,
generation-bound claim; a crashed claimant can be superseded only by the next
immutable claim generation after the claimant is both expired and dead.

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

Synthetic benchmark model-free checks are also available directly:

```powershell
npm run bench:synthetic:validate
npm run bench:synthetic:self-test
npm run verify:benchmark:model-free
npm run verify:benchmark:ci
```

Milestones 2 and 3 model-free quality checks are also available individually:

```powershell
npm run verify:quality-contracts
npm run verify:engineering-dossier
npm run verify:architecture-policy
npm run verify:impact-graph
npm run verify:prompt-inventory
npm run verify:quality-live-coordinator
npm run verify:quality-live-runner
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
npm run verify:context-strategies
npm run verify:context-receipts
npm run verify:whole-system-context
npm run verify:context-sufficiency
npm run verify:context-reconciliation
npm run verify:context-tool-overlay
npm run verify:context-live-manifests
npm run verify:context-acceptance
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
cases, corpus structure, and evaluation logic. The prompt inventory covers 18 agent prompts and nine
skill entrypoints. These checks do not prove an installed model profile or
actual model behaviour.

Each ordinary deterministic stage owns exactly one outer containment scope.
The canonical model-free aggregate is the sole allowlisted control-plane exception:
it remains outside an outer workload scope so its fixed 11-check
inventory can acquire fresh production containment without prohibited nesting.
The coordinator strips model/provider/variant inputs, reintroduces only the
exact runner-owned Linux or macOS containment coordinates, and fails closed on
timeout, output overflow, launch failure, or unverified cleanup. Recursive
runner self-tests remain invalid project-catalog checks, and no other stage may
select coordinator execution. The dispatcher resolves and launches the
canonical aggregate Node entrypoint directly, so ambient npm lifecycle hooks
cannot add uncontained work. On failure only, the coordinator emits a bounded,
redacted and inertly framed diagnostic for the failed canonical check. The
outer launcher accepts only that privacy-validated framing and replaces any
raw or malformed stderr with a generic message; successful child stderr remains
hidden. Direct operational verification remains
separate and receives the host coordinates it needs.
Synthetic profile fixtures also create their temporary host-toolchain lease
with an explicit owner-only `0600` mode, independent of the runner's umask.
An instrumented benchmark adapter is itself a contained workload. Its OpenCode
quality plugin therefore requests catalog-bound trusted checks through a
private, per-turn authenticated channel to the top-level runner, which
revalidates the protected catalog, toolchains, worktree, and output scope and
creates the fresh independent check containment boundary. Linux hosts must
provide a second delegated root and fixed-destination helper through
`OPENCODE_QUALITY_CHECK_CGROUP_ROOT`,
`OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_MODE=sudo-helper-v2`, and
`OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_HELPER`; it must not reuse the adapter
root. Windows uses an independent Job Object. Instrumented model-backed
benchmark execution is intentionally unavailable on macOS because one
exclusive workload UID cannot safely hold both scopes concurrently. No containment coordinate or
arbitrary command crosses into the model process, the capability is removed
from shell environments, and protocol, timeout, or cleanup failure invalidates
the attempt. Brokered checks use the asynchronous runner-owned process-tree
controller and inherit the earlier of the model-turn and outer adapter
deadlines; cancellation completes and verifies the independent check teardown
before the attempt settles.

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
in [docs/live-evaluation.md](docs/live-evaluation.md). The wide/deep context
contract is documented in [docs/whole-system-context.md](docs/whole-system-context.md). Static adversarial
fixtures live under [fixtures/adversarial/](fixtures/adversarial/).

`npm run verify` is deterministic repository-side assurance. It requires no
model, credentials, network, live adapter, installed OpenCode runtime, or
machine-local plugin API package. Run `npm run probe:runtime:quality-plugin-api`
separately only in the installed target environment.

Profile-only mode is prompt guidance and may optionally parallelize independent
read-only work, but it cannot claim computational receipt-chain correlation.
Instrumented quality mode adds the session registry, Dossier/gate, workspace
binding, and mutation hooks described above; its context operations and child
tasks are serialized. Live-evaluation mode remains a separate isolated scenario
runner.
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

OpenCode is the only model-selection authority for the core profile. The core
`agents/*.md` frontmatter contains no model, provider, or generation-option
settings. Primary agents use the model selected by the user through OpenCode;
subagents inherit model selection according to the installed OpenCode host.

The core profile works with any OpenCode-supported model that can use the
required tools and follow the workflow. Different models can still produce
different coding quality, so model choice and any provider-specific tuning stay
with the user and the host.

The harness continues to enforce permissions, context gathering, Engineering
Dossier state, quality gates, trusted checks, verification, and final
reconciliation independently of that choice. Model identity is optional
observational metadata only. It never grants permission, passes a quality gate,
completes an Engineering Dossier, or satisfies acceptance.

The core harness does not implement model A/B testing, automatic model routing,
or automatic fallback. In particular, it never silently switches to a preferred
model. See [docs/model-profiles.md](docs/model-profiles.md) for adoption and
runtime-probe guidance.

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
