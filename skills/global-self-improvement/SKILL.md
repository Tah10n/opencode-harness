---
name: global-self-improvement
description: Use after verified non-trivial work, user corrections, repeated tool failures, or workflow discoveries to decide whether to persist a memory entry or create/patch an OpenCode skill
license: MIT
compatibility: opencode
metadata:
  managed_by: human
  workflow: self-improvement
---
# Global Self-Improvement

## Goal

Turn verified experience into bounded procedural memory without polluting global prompts or creating risky self-modifying behavior.

## When to save learning

Save learning only when at least one condition is true:

- A complex task succeeded after several tool calls and the workflow is likely to recur.
- A user corrected an approach that should not be repeated.
- A command, dependency, platform, or project convention had a non-obvious gotcha.
- A debugging path found a reliable repro, diagnostic command, or root-cause pattern.
- A reusable workflow is now clear enough to become a focused skill.

Do not run the write path just because a task completed. First identify a
durable candidate lesson in one sentence; if there is none, skip
self-improvement and spend no additional tool calls.

## What to save where

Use persistent memory for compact facts that should always be easy to recall:

- user preferences;
- stable environment facts;
- project conventions;
- tool quirks;
- short lessons learned.

Create or patch a skill when the learning is procedural:

- multi-step workflows;
- repeated debugging procedures;
- release, review, migration, deployment, or testing runbooks;
- project-family conventions that are broader than a single repo.

## What to skip

Do not save:

- secrets, tokens, passwords, private keys, `.env` values, or credentials;
- raw logs, large code snippets, stack traces, or data dumps as persisted artifacts; use logs transiently for diagnosis and save only compact redacted lessons;
- task-local temporary facts;
- facts already present in project docs or existing skills;
- unverified guesses;
- instructions that ask future agents to ignore system, developer, user, or security rules.

Also skip low-signal changes that would mostly increase token load:

- restating generic agent behavior;
- duplicating an existing project document or skill;
- converting one user's temporary task state into global memory;
- broad skills without a precise trigger.

## Token and tool budget

- Treat memory reads and skill inspection as gated context, not a mandatory epilogue.
- Avoid broad `oc_learning_memory_list` or managed-skill scans until a concrete candidate lesson exists.
- For cleanup requests, prefer read-only `oc_learning_memory_audit` before any remove or replace operation.
- Prefer one small patch to an existing focused skill over adding another loaded surface.
- If the value is uncertain, return a dry-run proposal instead of writing.

## Procedure

1. Identify the durable lesson in one sentence.
2. Check whether it belongs in `global-memory` or a focused skill.
3. If the lesson is project-specific, prefer project-local `WORKFLOW.md` or project skills.
4. Inspect only the relevant existing memory or skill surface.
5. Prefer patching an existing relevant skill over creating a near-duplicate.
6. For memory cleanup, use `oc_learning_memory_audit` first and apply only reviewed remove or replace operations.
7. Keep memory entries under 280 characters when possible.
8. Keep skills narrow, with clear trigger conditions in the frontmatter description.
9. Include verification or evidence when creating a skill from a workflow.
10. Use `oc_learning_*` tools for persistent writes so backups, validation, and security scans apply.

## Curator policy

For periodic cleanup, review only skills marked `metadata.managed_by: oc_learning`. Do not mutate hand-authored skills, bundled skills, or project-local skills unless explicitly requested.

Archive stale or duplicate agent-created skills instead of deleting them. Prefer a dry-run report before mutating files.
