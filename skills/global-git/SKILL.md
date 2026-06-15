---
name: global-git
description: Use for git status/diff review, branch hygiene, commits, pushes, PR preparation, and avoiding destructive git surprises
license: MIT
compatibility: opencode
metadata:
  audience: everyone
  workflow: git
---
## Principles

- Prefer small, reviewable commits.
- Do not commit secrets (.env, credentials, private keys).
- Avoid destructive commands unless explicitly requested.
- Only stage, commit, push, or create PRs when the user explicitly requested that action.

## Minimal flow

1. Inspect: `git status`, `git diff`, `git log -n 10 --oneline`.
1. If the user did not explicitly request staging, committing, pushing, or PR creation, stop after inspection and propose next commands instead of mutating the repo.
1. Stage only relevant files; never stage unrelated dirty changes.
1. Commit message: short, present tense, explain the why.
1. For PRs: push with `-u`, then open PR with a clear summary + testing notes.

## Safety defaults

- Never `push --force` unless explicitly requested.
- Ask before `git clean`, `git reset`, `git restore`, `git checkout --`, branch deletion, or remote branch deletion.
- Prefer non-interactive git commands (no `-i`).
