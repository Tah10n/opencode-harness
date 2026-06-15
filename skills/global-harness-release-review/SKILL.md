---
name: global-harness-release-review
description: Use for read-only semantic release review of harness coherence before tagging or publishing
license: MIT
compatibility: opencode
metadata:
  workflow: release-review
---
## Purpose

Use this skill before a minor or major harness release. It is an inferential
feedback sensor: it checks whether guides, permissions, docs, fixtures, and
deterministic sensors still form one coherent control system.
The primary review target is guide/sensor coherence.

## Rules

- Stay read-only unless the user explicitly asks for fixes.
- Do not stage, commit, tag, push, publish, or change files during the review.
- Prefer concrete release blockers over broad commentary.
- Treat deterministic verifier failures as blockers.
- Treat guide/sensor contradictions as blockers when they can cause unsafe or
  misleading agent behaviour.

## Review Scope

Check these surfaces together:

- `AGENTS.md` and primary orchestrator prompts;
- `opencode.json` commands and root permissions;
- `agents/` frontmatter and agent instructions;
- `skills/` workflow skills;
- `docs/harness-map.md`, `docs/evaluation.md`, `docs/adoption.md`,
  `docs/compatibility.md`, and `docs/release.md`;
- `scripts/verify-harness.mjs`, `scripts/evaluate-harness.mjs`,
  `scripts/verify-drift.mjs`, and `scripts/verify-runtime.mjs`;
- examples and fixtures that prove project-local workflow, runtime debug, or
  behaviour contracts.

## Questions

- Does every important guide have a deterministic or documented sensor?
- Does every sensor point back to a real guide or contract?
- Are fast checks included in `npm run verify`?
- Are installed-runtime checks documented separately from CI-only checks?
- Are read-only agents still read-only at the permission layer?
- Is web research still isolated to `researcher`?
- Are `oc_learning_*` writes still denied at root and bounded to `improver`?
- Are public links, repository names, package names, and compatibility notes
  current?
- Are private memory, local paths, credentials, raw logs, or project-specific
  facts excluded from the reusable template?
- Are release notes and compatibility docs aligned with the intended release?

## Output

Return:

- `release_blockers`: high/medium issues that should block release, with
  file/line evidence and the minimal fix;
- `non_blocking_risks`: low-priority or follow-up notes;
- `verification`: commands checked or recommended;
- `coverage`: scopes reviewed and any scope intentionally skipped.
