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
  `docs/compatibility.md`, `docs/live-evaluation.md`, and
  `docs/release.md`;
- `.github/workflows/verify.yml`, `quality/milestone-2-dod.v3.json`, receipt
  schemas under `quality/`, `lib/quality/milestone-dod.mjs`, and
  `lib/quality/milestone-run-context.mjs`;
- `scripts/verify-harness.mjs`, `scripts/evaluate-harness.mjs`,
  `scripts/evaluate-live.mjs`, `scripts/verify-drift.mjs`, and
  `scripts/verify-runtime.mjs`;
- `scripts/verify-all.mjs`, `scripts/run-milestone-2-operational.mjs`, and
  `scripts/assess-milestone-2-receipts.mjs` as one producer/aggregate contract;
- examples and fixtures that prove project-local workflow, runtime debug, or
  behaviour contracts.

## Questions

- Does every important guide have a deterministic or documented sensor?
- Does every sensor point back to a real guide or contract?
- Are fast checks included in `npm run verify`?
- Are installed-runtime checks documented separately from CI-only checks?
- Do deterministic, Linux, Windows, and macOS producers remain mandatory inputs
  to the final `Milestone 2 receipt aggregation` check?
- Do all receipt bundles and optional installed-host evidence enforce the same
  provider, run ID, attempt, repository, HEAD, and source attestation?
- Are read-only agents still read-only at the permission layer?
- Are review commands routed through the read-only `review-orchestrator`
  primary?
- Is web research still isolated to `researcher`?
- Are `oc_learning_*` writes still denied at root and bounded to `improver`?
- Do high/critical quality gates have matching static, runtime, live-eval, or
  inferential review coverage?
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
