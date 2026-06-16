# Recursive Context Mode

## Purpose

Recursive context mode is the default workflow for large OpenCode audits and research-heavy tasks. It is intended for broad code audits, production-readiness checks, repository or article study, long-log review, large-diff review, and multi-module or multi-service bug sweeps.

The goal is to keep the root orchestrator's context small and decision-focused while moving broad reading, search, and independent semantic checks into bounded read-only tools and focused subagents.

This is not a new slash command. The mode is selected automatically by the orchestrator when the task shape is large enough.

## What Changed

- `AGENTS.md` now tells the orchestrator to automatically enter recursive-context mode for broad audits and to skip it for small local tasks.
- `agents/orchestrator.md` and `agents/orchestrator-deep.md` define the automatic trigger, sequencing, and safety rules.
- The separate `opencode-recursive-context` capability package provides the
  minimal safe harness surface of four read-only tools:
  - `context_outline`: returns a compact worktree map and detected workflow/skill guidance.
  - `context_files`: returns a scoped file inventory.
  - `context_search`: performs literal text search inside the current worktree.
  - `context_read`: reads bounded line ranges from text files.
- If the installed capability package also exposes advanced tools such as
  `context_map`, `context_batch_read`, `context_symbols`, or `context_related`,
  those advanced tools are opt-in for host profiles. This template intentionally
  grants only the four-tool minimal safe harness surface by default.
- Read-only and diagnostic agents can use those tools: `explore`, `reviewer`, `architect`, `diagnose`, and `verifier`.

## Basis

The design is based on the Recursive Language Models idea from:

- https://github.com/alexzhang13/rlm
- https://alexzhang13.github.io/blog/2025/rlm/
- https://arxiv.org/abs/2512.24601

The useful idea from RLM is not the exact Python implementation. The useful idea is context decomposition: keep the root model from ingesting the full context, expose the context through a programmatic environment, and let the root model inspect, filter, split, delegate, and aggregate evidence.

For this OpenCode config, the implementation is deliberately OpenCode-native:

- Root orchestration stays in `orchestrator`.
- Semantic fan-out stays in existing subagents such as `@explore`, `@researcher`, `@reviewer`, `@diagnose`, and `@verifier`.
- Context access uses local plugin tools instead of a Python `exec` REPL.
- Existing OpenCode permissions remain the safety boundary.

## Safety Model

The tools are read-only and path-confined to the current worktree.

They skip common generated or high-noise directories, including `.git`, `node_modules`, build outputs, caches, virtual environments, IDE folders, and test caches.

They refuse secret-like files and paths, including `.env`, `.env.*` except `.env.example`, private key names, cloud credential directories, common package-manager and build credential files such as `.npmrc`, `.netrc`, `.git-credentials`, `gradle.properties`, `local.properties`, `settings.xml`, and key/certificate extensions such as `.key`, `.pem`, `.p12`, and `.pfx`.

`context_search` returns bounded match excerpts rather than full arbitrarily long lines. When a line is shortened, the result marks `textTruncated: true` and increments `truncatedMatches`.

They do not provide shell execution, write access, package installation, network access, or permission escalation.

## Operating Rules

Use recursive-context mode automatically when a task is broad enough that direct reading would pollute the root context or miss important surfaces.

Recommended sequence:

1. Start with `context_outline` or repo workflow guidance.
2. Use `context_files` and `context_search` to identify likely entry points, tests, contracts, and docs.
3. Use `context_read` for bounded file ranges instead of dumping whole files.
4. Fan out independent semantic checks to focused subagents.
5. Aggregate compact evidence with file and line references.
6. Only then decide whether to implement, review, diagnose, or verify.

Skip this mode for direct, small, single-file, or obviously local tasks.

## Verification

The expected validation commands are:

- `opencode debug config`
- `opencode debug agent orchestrator`
- `opencode debug agent explore`
- `opencode debug agent reviewer`

The key expected result is that the live OpenCode config includes the external
recursive-context capability configured by the host, and the relevant agents
show `context_outline`, `context_files`, `context_read`, and `context_search`
as enabled tools. Additional `context_*` tools may be installed, but this
profile does not require or grant them unless the host opts in.
