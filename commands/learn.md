---
description: Save durable learning from the current task into bounded memory or an agent-created skill
agent: improver
subtask: true
---
Load the `global-self-improvement` skill. Review the current task context and decide whether anything durable should be saved.

Rules:
- Save nothing if the lesson is trivial, task-local, already documented, unverified, or sensitive.
- Prefer one compact memory entry for a durable fact.
- Prefer patching an existing skill over creating a duplicate skill.
- Use only `oc_learning_*` tools for persistent writes.
- Return a concise report: saved | skipped | proposed-only, target, reason, and residual risk.

User/task context:
$ARGUMENTS
