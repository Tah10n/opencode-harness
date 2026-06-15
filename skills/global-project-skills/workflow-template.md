# WORKFLOW.md Template

Use this as a compact baseline for project-root `WORKFLOW.md` files. Keep only sections that add project-specific value.

```markdown
# Project Workflow

## Project Overview

- Project type:
- Primary entry points:
- Main docs:

## Working Rules

- Read project-local guidance before planning.
- Prefer the smallest correct change that satisfies the task.
- Preserve unrelated dirty worktree changes.
- Keep implementation aligned with existing project conventions.

## Agent Delegation

- `@explore`: use for read-only repo mapping, symbol tracing, command discovery, and test location discovery.
- `@architect`: use before broad features, multi-module refactors, shared contracts, migrations, or parallel implementation.
- `@general`: use for scoped implementation slices with disjoint write ownership.
- `@reviewer`: use for non-trivial diffs, risky changes, and explicit review requests.
- `@diagnose`: use to reproduce failures, gather logs, and isolate root cause without edits.
- `@researcher`: use only for current external docs, unstable APIs, release notes, or vendor behavior.

## Build/Test/Verification

- Narrow checks:
  - `verify before use`
- Broader checks:
  - `verify before use`
- Avoid running broad/shared-state checks in parallel.

## Safety Notes

- High-side-effect commands:
- Required environment or credentials:
- Generated files or lockfiles:

## Definition of Done

- Relevant code/docs updated.
- Narrow verification passed or infeasibility documented.
- Broader verification run when the blast radius justifies it.
- Final handoff states changed files, checks run, and residual risk.
```
