# Changelog

## Unreleased (target: 0.3.0)

This section describes the development checkout. The latest tagged release is
still `v0.2.0`; its package metadata has no `exports` field and does not expose
the feedback-plane ESM subpaths documented for the `0.3.0` target.

- Implemented Milestone 2's versioned Engineering Dossier, runner-owned
  computational pre-implementation gate, immutable quality attestation, and
  public `opencode-harness/quality` boundary. High and critical instrumented
  work now fails closed on pre-gate edits or writable delegation, unresolved
  relevant unknowns, or incomplete invariant/edge/failure/test mappings.
- Added bounded direct/transitive impact graphs with explicit evidence,
  exclusions, and unknown-resolution plans, plus strict optional project
  architecture policies that are never guessed when absent. Configured policy
  runs now bind a separate trusted post-edit candidate evaluation to the
  dossier baseline and fail closed when that host evidence is unavailable.
- Added twelve non-cosmetic whole-system quality scenarios: six development,
  four held-out, and two critical canaries covering compatibility, persistence,
  migration, lifecycle, concurrency, retry/idempotency, parser, cache/version,
  dependency-failure, and architecture/invariant regressions.
- Added a versioned non-scalar quality acceptance contract with per-result
  dossier, prompt, verification, and quality-attestation identities. Missing
  or mismatched evidence is inconclusive; rejected candidates never mutate the
  active harness.
- Activated GPT-5.6 Sol for nine decision/execution roles and GPT-5.6 Terra for
  exploration and research. Active `agents/*.md` frontmatter is the sole model
  authority; model metadata is visible but never a dossier, verification,
  acceptance, or release gate.
- Restored Milestone 1 permission-surface comparison in quality acceptance v2:
  reports and decisions bind exact permission snapshot/profile fingerprints,
  key-set drift is inconclusive, and effective widening is rejected.
- Added deterministic Milestone 2 schema, dossier, architecture, impact,
  prompt-inventory, live-coordinator, quality-corpus, acceptance, canonical
  verification-target, normal-session bridge, committed-range whitespace, and
  definition-of-done checks to `npm run verify`; installed runtime and general
  live behavior remain separate evidence classes.
- Connected the dossier to ordinary OpenCode sessions through the installed
  pre-tool API: native edit/write/apply-patch and writable delegation consume
  runner-owned capabilities, child roles use minimal parent-bound links,
  repeated dirty-file edits are content-hashed, configured architecture policy
  is evaluated at finalization, and failed tools reconcile durable pending state.
- Removed the model-profile catalog, 96-cell model-comparison manifests,
  model-specific runtime evidence, paired-model promotion scripts, and their
  release gates. General baseline/candidate live regression evaluation remains
  model-neutral; agent frontmatter is the only active model source.
- Replaced worktree-only whitespace checking with a sealed verifier for local
  unstaged/staged state, pull-request merge-base ranges, push ranges, initial
  pushes, and clean-checkout current-commit fallback.
- Corrected the harness-engineering attribution to Birgitta Böckeler's article
  published on Martin Fowler's site and documented the non-autonomous
  propose/evaluate/accept boundary influenced by Lilian Weng's July 4, 2026
  self-improvement article.
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
- Added optional general live-evaluation manifests, validator, docs, npm
  scripts, isolated profile repo copies, adapter timeouts, hidden file staging,
  and sanitized reports outside the default deterministic verification gate.
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
