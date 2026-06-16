---
description: Review agent-created skills and persistent memory for duplicates, stale entries, and unsafe or low-value learning
agent: improver
subtask: true
---
Load the `global-self-improvement` skill and perform a curator pass.

Default to dry-run unless the user explicitly includes `apply` in the arguments.

Scope:
- Inspect `skills/global-memory/SKILL.md`.
- Inspect skills with `metadata.managed_by: oc_learning`.
- Do not mutate hand-authored skills, project-local skills, bundled skills, or unrelated configuration.
- Use only `oc_learning_*` tools for persistent writes.

Decision policy:
- Keep useful, current, non-duplicative skills.
- Patch small drift or unclear trigger descriptions.
- Archive narrow duplicates or stale skills rather than deleting.
- Remove memory entries only if obsolete, duplicate, sensitive, or too vague.

Return:
- proposed changes;
- applied changes, if any;
- backup locations reported by tools;
- items intentionally left untouched.

Arguments:
$ARGUMENTS
