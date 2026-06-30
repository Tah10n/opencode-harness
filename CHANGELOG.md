# Changelog

## Unreleased

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
