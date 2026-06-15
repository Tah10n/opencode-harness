---
name: global-project-skills
description: Use when creating, auditing, or loading project-local OpenCode skills and repository guidance files
license: MIT
compatibility: opencode
metadata:
  workflow: skills
---
## Repo workflow guidance

Use a project-root `WORKFLOW.md` when a repo needs a lightweight operational contract for agents. It should describe how work is done in that project, not duplicate global OpenCode rules.

Good `WORKFLOW.md` content:

- project overview and primary entry points
- narrow build, test, lint, and verification commands
- agent delegation preferences for `@explore`, `@architect`, `@general`, `@reviewer`, `@diagnose`, and `@researcher`
- project-specific safety notes and high-side-effect operations
- branch, PR, ticket, or release handoff expectations
- definition of done

Keep `WORKFLOW.md` short enough that agents will actually read it at the start of a task. Do not use it as a daemon config, polling spec, or background scheduler.

Use `workflow-prompt.md` in this skill directory as the reusable prompt for generating a project-specific `WORKFLOW.md`. Use `workflow-template.md` as the compact baseline shape when drafting one manually.

## WORKFLOW.md authoring rules

- Prefer evidence from the repo over assumptions.
- Keep commands exact and copy-pasteable.
- Mark uncertain commands as `verify before use`.
- Put narrow checks before broad checks.
- Keep global safety rules out of the file unless the project has an extra constraint.
- Avoid local absolute paths, secrets, credentials, and user-specific machine details.

## Where to put project skills

Place skills in your repo:

- `.opencode/skills/<name>/SKILL.md`
- `.agents/skills/<name>/SKILL.md` (agent-compatible)
- `.claude/skills/<name>/SKILL.md` (Claude-compatible)

OpenCode discovers skills by walking up from the current directory to the git worktree root.

## Recommended skill names

- `project`: overview, architecture, key constraints, dev commands
- `tests`: how to run tests, common flakes, required env
- `release`: versioning and release steps
- `deps`: dependency policies, upgrade procedures

## Authoring rules

- Keep each skill focused on one workflow.
- Put trigger conditions in the frontmatter `description`; the agent sees that before loading the body.
- Prefer copy-pasteable commands and exact file paths.
- Include gotchas and non-obvious constraints.
- Keep the body lean. Move long reference material into linked files only when needed.
