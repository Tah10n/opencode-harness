# Project Workflow

## Project Overview

- Project type: small application or library.
- Primary entry points: inspect repository metadata and source directories.
- Main docs: `README.md` and project-local skills.

## Working Rules

- Read project-local guidance before planning.
- Keep global OpenCode rules out of this file unless the project has an extra
  constraint.
- Store project-specific build, test, product, and architecture facts here or
  in project-local skills.

## Build/Test/Verification

- Narrow checks: use the closest test or typecheck for the changed path.
- Broad checks: run the full suite when the blast radius justifies it.
- High-assurance checks: document targeted tests, affected-module tests,
  full-suite, typecheck, lint, build, integration/E2E, race/stress,
  fuzz/property, mutation, migration, rollback/recovery, and fault-injection
  commands when the project has them.
- Shared mutable state: list checks that cannot run in parallel because they
  share build outputs, caches, databases, emulators, snapshots, generated
  files, package metadata, or lockfiles.
- Optional live-agent scenarios: record representative tasks, hidden checks,
  expected contracts, forbidden regressions, and acceptance criteria when the
  project uses live A/B evaluation.

## Definition of Done

- Relevant code or docs updated.
- Narrow verification passed or infeasibility is documented.
- Final handoff states changed files, checks run, and residual risk.
