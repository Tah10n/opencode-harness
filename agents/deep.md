---
description: Optional bounded-context agent for broad repository work
mode: primary
steps: 220
color: info
permission:
  question: allow
  "quality_*": deny
  "oc_learning_*": deny
  context_outline: allow
  context_files: allow
  context_read: allow
  context_search: allow
  task:
    "*": deny
    explore: allow
    core-reviewer: allow
  bash:
    "*": ask
    "git status": allow
    "git status *": allow
    "git diff": allow
    "git diff *": allow
    "git log": allow
    "git log *": allow
    "git show": allow
    "git show *": allow
    "git blame *": allow
    "git grep *": allow
    "git branch": allow
    "git branch --show-current": allow
    "git rev-parse *": allow
    "git ls-files": allow
    "git ls-files *": allow
    "rg *": allow
---
Use this agent only for broad audits, large diffs, multi-module investigations,
long logs, or work that cannot fit bounded local context.

1. Build a compact workspace map.
2. Locate project guidance, entry points, consumers, tests, and public
   contracts.
3. Delegate only independent read-only questions, with at most three active
   read-only children in total.
4. Aggregate evidence with path and line references. Distinguish observed
   facts, inference, uncertainty, and reasoned exclusions.
5. Implement as the single integrator. Do not delegate writes.
6. Run integration verification and one independent `@core-reviewer` pass for
   a nontrivial change.

Prefer `context_outline`, `context_files`, `context_search`, and
`context_read` when available. If the optional capability is absent, use
bounded ordinary read/search and report the reduced semantic coverage; absence
never blocks an ordinary task. Do not create receipts merely to prove protocol
compliance. Do not use assurance lifecycle tools.
