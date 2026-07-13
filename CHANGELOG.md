# Changelog

## Unreleased (target: 0.3.0)

This section describes the development checkout. The latest tagged release is
still `v0.2.0`; its package metadata has no `exports` field and does not expose
the feedback-plane ESM subpaths documented for the `0.3.0` target.

- Implemented Milestone 1, the measurable feedback plane: a confined
  `.oc_harness/` operational run store, trace schema v2 with strict v1 reads,
  bounded adapter instrumentation, privacy/redaction limits, and public ESM and
  trace CLI boundaries.
- Added immutable live-evaluation JSON/Markdown history with completion markers,
  latest convenience files, separate baseline/candidate operational runs, and
  honest failed/timeout/incomplete evidence.
- Added a versioned development/held-out/canary/infrastructure split with twelve
  distinct behavioural scenarios, runner-only hidden checks and declarative
  trace assertions, plus deterministic no-LLM runner coverage.
- Added a versioned non-scalar candidate acceptance policy, first-party static
  and installed-permission evidence capture, immutable decision artifacts, and
  deterministic accepted/rejected/inconclusive self-tests.
- Hardened the feedback plane with quoted/bearer/provider-token redaction,
  physical symlink/junction confinement, deadline-safe trace handling, complete
  permission-surface evidence, and content-bound cross-evidence identity.
- Hardened the Milestone 1 review surface with process-tree teardown before hidden
  staging, producer/receiver adapter quotas, store quotas, structured review findings, final persistence
  scanning, consistent trace finalization, JSON/Markdown history attestations,
  canonical pair-universe binding, mode-aware runtime inventory, and immutable
  external static-verification snapshots.
- Buffered live trace operations in memory and batch-publish them only after
  verified adapter process-tree teardown; unverified teardown now leaves no
  durable trace or report-history artifact.
- Added `global-quality-gates` for high/critical risk classification,
  behavior contracts, quality ledgers, baselines, verification ladders,
  specialized checks, final adversarial audit, and strict completion status.
- Added a strict read-only `review-orchestrator` primary and routed review
  commands through it.
- Added optional live A/B evaluation manifests, validator, docs, npm scripts,
  isolated profile repo copies, adapter timeouts, hidden file staging, and
  sanitized reports outside the default deterministic verification gate.
- Added trace contract, budget/termination policy, shared subagent result
  schema, static adversarial fixtures, and deterministic scenario coverage for
  those controls.
- Expanded static, evaluation, runtime-fixture, docs, and examples coverage for
  high-assurance workflows and permission boundaries.
- Added a harness control map and harnessability checklist.
- Added deterministic drift, runtime, and positive/negative runtime-fixture
  verification scripts.
- Expanded behaviour contract evaluation and structural permission checks.
- Allowed primary orchestrators to use safe `context_*` tools directly.
- Added a read-only semantic harness release review command and skill.

## 0.2.0 - 2026-06-15

- Added fixture-backed static harness evaluation checks.
- Added installation, compatibility, release, and evaluation documentation.
- Added examples for minimal OpenCode config, agent tool grants, and project
  workflow guidance.
- Documented the `opencode-learning-guard` capability package and stable
  `oc_learning_*` tool-prefix boundary.
- Added repository governance files: `CONTRIBUTING.md`, `SECURITY.md`, and
  `CODEOWNERS`.
- Expanded CI verification to cover docs, examples, compatibility links, and
  prompt policy invariants.

## 0.1.0 - 2026-06-15

- Published the initial reusable OpenCode harness template.
- Added local deterministic verification.
- Added GitHub Actions verification workflow.
- Documented the relationship between `opencode-harness`,
  `opencode-recursive-context`, and `opencode-learning-guard`.
