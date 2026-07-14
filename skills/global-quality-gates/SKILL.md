---
name: global-quality-gates
description: Use for high-assurance implementation, refactoring, migration, production-readiness, and critical verification gates
license: MIT
compatibility: opencode
metadata:
  workflow: quality-gates
---
# Global Quality Gates

## Purpose and triggers

Load this skill before work whose blast radius is too large or risky for a
single local patch. It is mandatory for:

- multi-file changes;
- broad refactoring;
- public API, schema, command, permission, or workflow changes;
- auth, permissions, security, privacy, credentials, or sensitive data;
- persistence, transactions, migrations, recovery, or rollback;
- concurrency, async execution, cancellation, or resource lifecycle;
- distributed, network, retry, timeout, or partial-availability behaviour;
- caching, invalidation, stale reads, or consistency-sensitive paths;
- data-loss-sensitive paths;
- changes spanning multiple modules, packages, services, or agents;
- fixes that affect non-obvious callers or callees;
- production-readiness work.

Small local tasks may stay on the standard single-agent path, but the
orchestrator still owns ordinary tests and self-review.

## Risk classification

Classify the task before implementation.

The computational Engineering Dossier risk classes are exactly
`standard-lite`, `high`, and `critical`. They are separate from the operational trace
contract's legacy `standard` risk label; trace compatibility does not change
the dossier schema.

`standard-lite`:

- local, low-blast-radius changes;
- no public contract, persistence, security, concurrency, or compatibility
  impact;
- targeted verification can prove the intended behaviour.

`high` includes any of:

- cross-module or cross-package change;
- public contracts, schemas, command surfaces, or config contracts;
- persistence or durable state;
- concurrency, async ordering, cancellation, or resource lifecycle;
- distributed calls, retry, timeout, or external dependency behaviour;
- backward compatibility or version skew;
- substantial behaviour-preserving refactor.

`critical` includes any of:

- authorization or security boundaries;
- credentials, privacy, sensitive data, tenant isolation, or secret handling;
- irreversible migration;
- data corruption or data loss;
- payment, billing, financial, or quota behaviour;
- consistency-critical concurrency;
- destructive operations;
- recovery, rollback, disaster-recovery, or restore paths.

The risk class determines the mandatory verification gates. Escalate rather
than downclassify when the evidence is incomplete.

## Quality ledger

The orchestrator maintains a compact quality ledger in task context. It is a
working artifact for the current task, not a required repository file.

Required fields:

- `risk_class`;
- `user_goal`;
- `behavior_contract`;
- `affected_entry_points`;
- `affected_call_paths`;
- `public_contracts`;
- `data_shapes`;
- `invariants`;
- `compatibility_requirements`;
- `edge_case_matrix`;
- `failure_mode_matrix`;
- `baseline`;
- `implementation_slices`;
- `test_obligations`;
- `specialized_checks`;
- `verification_results`;
- `review_ledger_status`;
- `unverified_areas`;
- `completion_status`.

Keep the ledger compact, evidence-backed, and updated when the plan changes.

## Pre-change baseline

For `high` and `critical` tasks, baseline is mandatory before edits.

Baseline should include:

- current worktree status and diff;
- existing failing checks;
- targeted tests for the behaviour being changed;
- tests for affected modules or packages;
- typecheck, lint, and build when applicable;
- full test suite when available and reproducible;
- runtime or toolchain versions when they affect the result.

For behaviour-preserving refactors, first create or confirm characterization
tests that would catch accidental behaviour changes. Use characterization tests
when no existing test already proves the behavior contract.

After implementation, verifier output must compare against baseline and
separate:

- existing failures;
- fixed existing failures;
- newly introduced failures;
- unavailable, timed-out, not-permitted, or not-applicable checks.

Do not treat an unavailable command as a pass.

## Behavior contract

Before broad or high-risk implementation, record:

- what must change;
- what must remain unchanged;
- observable behaviour;
- error semantics;
- side effects;
- ordering guarantees;
- idempotency requirements;
- timeout and cancellation behaviour;
- compatibility expectations;
- rollback expectations;
- data integrity requirements.

Do not start broad or high-risk implementation from only a general feature
description. Narrow the contract first or mark the task blocked.

## Edge-case and failure-mode matrix

For each relevant category, classify it as one of:

- applicable and tested;
- applicable but verified at another level;
- not applicable with reason;
- blocked or unverified.

Check applicability for:

- null, missing, and empty inputs;
- invalid and malformed inputs;
- minimum, maximum, and boundary values;
- duplicates;
- ordering;
- retry and repeated invocation;
- idempotency;
- partial success;
- partial failure;
- timeout;
- cancellation;
- concurrency and races;
- resource cleanup;
- transaction rollback;
- stale state;
- cache invalidation;
- schema or version skew;
- backward compatibility;
- authorization denial;
- cross-tenant isolation;
- injection and unsafe encoding;
- sensitive-data leakage;
- unavailable external dependency;
- degraded mode;
- restart and recovery;
- migration rollback;
- locale, timezone, and date boundaries;
- large input and resource exhaustion.

Do not require tests for categories that are truly irrelevant, but require a
reason for every skipped applicable category.

## Verification ladder

For `standard-lite`:

1. Targeted tests.
2. Affected module or package tests.
3. Typecheck, lint, or build when applicable.

For `high`:

1. Pre-change baseline.
2. Targeted tests.
3. Tests for every affected module or package.
4. Contract or integration tests.
5. Full test suite.
6. Typecheck.
7. Lint.
8. Production build.
9. Adversarial review.
10. Final regression verification.

For `critical`:

- all `high` gates;
- applicable specialized checks;
- negative-path checks;
- recovery, rollback, or restore-path verification where relevant.

If a mandatory `high` or `critical` gate is missing, failed, timed out, or not
permitted, the task cannot be reported as `complete`. Use `blocked` or
`incomplete-with-critical-verification-gap`.

## Specialized verification applicability

The architect must select applicable specialized methods from project-owned
tools. The harness does not mandate a library. If a project lacks a tool, record
the gap and the recommended check.

- parsers, serializers, transformations: property-based testing and fuzzing;
- concurrency: race detector, stress tests, ordering tests, cancellation tests;
- persistence: transaction, rollback, retry, idempotency, restart, recovery;
- migrations: forward migration, backward compatibility, rollback,
  mixed-version behaviour;
- network or distributed behaviour: timeout, retry, duplicate delivery,
  partial availability, fault injection;
- auth or security: negative authorization, privilege boundaries, tenant
  isolation, injection, sensitive-data handling;
- resource lifecycle: leak checks, cleanup, cancellation, repeated
  initialization and shutdown;
- public API or schema: contract tests, compatibility tests, version skew;
- caching: invalidation, stale reads, concurrency, fallback;
- UI: loading, error, empty states, accessibility, i18n, timezone, interaction
  regressions;
- test quality: mutation testing when critical behaviour appears covered only
  by weak tests.

## Completion statuses

Use only these final statuses:

- `complete`;
- `complete-with-noncritical-gaps`;
- `blocked`;
- `incomplete-with-critical-verification-gap`.

`complete` is allowed only when:

- all high and medium review findings are resolved;
- mandatory checks passed;
- no new high or medium regression is found;
- the orchestrator has reviewed the final diff directly;
- residual risks are listed explicitly;
- unrelated changes are absent from the final diff.

For `critical` tasks, `complete-with-noncritical-gaps` is allowed only for
genuinely noncritical gaps. Missing mandatory verification remains
`incomplete-with-critical-verification-gap` or `blocked`.
