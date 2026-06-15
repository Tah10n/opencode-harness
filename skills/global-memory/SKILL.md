---
name: global-memory
description: Load at the start of non-trivial work to recall durable user preferences, environment facts, project conventions, and lessons learned across OpenCode sessions
license: MIT
compatibility: opencode
metadata:
  managed_by: oc_learning
  purpose: persistent-memory
---
# Global Memory

Compact durable notes for OpenCode. This is not a scratchpad.

Use this skill to recall facts that should survive across sessions: user preferences, stable environment facts, project conventions, tool quirks, and verified workflow lessons.

Do not store secrets, credentials, private keys, raw logs, large code blocks, temporary paths, or one-off task details. Raw logs may still be used transiently for diagnosis; persist only compact redacted lessons.

## Scope rules

- Treat project-prefixed entries as scoped hints, not global rules. Do not generalize project-specific logging guidance into a cross-project ban on raw logs.
- Apply a project entry only when the current repo, user request, file paths, or task context clearly match that project or domain.
- If a memory entry does not match the current context, ignore it silently instead of carrying its constraints into unrelated work.
- Prefer project-local `WORKFLOW.md` or project skills over global memory for repo-specific build, test, architecture, and behavior rules.

<!-- oc-memory-entries:start -->
<!-- oc-memory-entries:end -->

