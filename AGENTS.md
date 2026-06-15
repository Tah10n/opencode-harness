# Global OpenCode Rules

These rules apply to all projects.

## Orchestration (Subagents)

- Prefer the single-agent loop for small, local, single-file, or directly answerable tasks.
- Delegate focused work only when it materially reduces context load, risk, or wall-clock time: broad audits, large diffs, long logs, multi-module sweeps, independent read-only discovery, or disjoint implementation slices after ownership is explicit.
- Use `@explore` for repo exploration (read-only search, file discovery).
- Use `@architect` before broad or parallel implementation to define explicit write ownership.
- Use `@general` for multi-step execution or when parallel work helps.
- Use `@reviewer` for code reviews (no edits).
- Use `@diagnose` to reproduce issues and collect logs (no edits).
- Use `@researcher` for web research (no edits).
- Use `@verifier` after integration for targeted tests, typechecks, lint, and regression checks (no edits).
- Before writing or fixing code, build a context inventory for the affected blast radius: user goal, current worktree/diff, relevant instructions/skills/workflow docs, affected entry points and call paths, contracts/data shapes, invariants, existing patterns, edge cases, failure modes, and verification path. If any required context is missing, use `@explore` and/or `@architect` first.
- Treat implementation quality as part of the task, not a follow-up: prefer the smallest cohesive design, follow local conventions, avoid unnecessary duplication, avoid speculative abstractions, preserve module boundaries, and check error handling and edge cases.
- Do not assign `@general` a coding task unless the handoff includes the write scope, expected behavior, affected entry points/call paths, relevant contracts/invariants, known edge cases/failure modes, and narrow verification boundary.
- Parallelize independent read-only discovery for broad tasks; keep immediate blockers and small local work in the root loop.
- Parallelize implementation only after `@architect` has produced explicit disjoint write ownership.
- If slices share files, shared contracts, generated outputs, lockfiles, migrations, package metadata, snapshots, or formatter output, serialize them.
- The orchestrator remains the sole integrator of worker results.
- For broad audits, production-readiness checks, repo/article study, long logs, large diffs, or multi-module bug sweeps, automatically use recursive-context mode: keep the root context small, use safe read-only context tools when available (`context_outline`, `context_files`, `context_search`, `context_read`), fan out focused `@explore`/`@researcher`/`@reviewer` tasks, and aggregate compact evidence before deciding or editing.
- Do not use recursive-context mode for small, local, single-file, or directly answerable tasks.
- See `docs/recursive-context-mode.md` for the rationale, safety model, tool behavior, and validation commands.
- When the user asks for review, keep the task read-only: do not edit files, stage changes, commit, or run fix commands unless the user explicitly asks for fixes.
- For review or review-fix loops, load the `global-review-ledger` skill.
- For review requests, use up to ten `@reviewer` subagents only when distinct scopes are useful enough to justify fan-out. Pick scopes based on the repository and diff, and prefer separating correctness, tests/coverage, API/contracts, security/privacy, performance/concurrency/resource lifecycle, and UX/i18n/docs/build-release concerns when applicable.
- Each `@reviewer` must stay read-only and return concrete findings with severity, file/line evidence, impact, and recommended fix. Avoid duplicate scopes; if the change is small, use fewer reviewers with clearly distinct scopes.
- Follow the skill's finding ledger, re-review, and stop-condition rules before fixing or re-reviewing findings.

## Safety (Dangerous Commands)

- Ask for explicit user permission *before* running any command that is destructive/irreversible or could have significant side effects.
- This includes (non-exhaustive): deleting files/folders (`rm`, `del`, `rmdir`, `Remove-Item -Recurse`), cleaning working trees (`git clean -fdx`), rewriting history (`git reset --hard`, `git rebase`, `git push --force`), changing global/system settings (package managers, services, registry), requiring elevated privileges (admin/sudo), downloading/executing remote scripts, or writing outside the workspace.
- If unsure whether a command is “dangerous”, treat it as dangerous and ask first.

## Skills

- Always check available skills (via the `skill` tool) early in a task.
- If project-local skills exist, load the ones relevant to the user request.

Recommended project skill conventions (put these in a repo):

- `.opencode/skills/project/SKILL.md`: project overview, build/test commands, conventions
- `.opencode/skills/tests/SKILL.md`: test strategy and commands
- `.opencode/skills/release/SKILL.md`: release steps, versioning, changelog rules

Also supported (agent-compatible):

- `.agents/skills/<name>/SKILL.md`

## Controlled Self-Improvement

- Treat `global-memory` as a gated context source, not always-on prompt ballast. Load it near the start of non-trivial work only when durable preferences, project conventions, or previous workflow lessons may plausibly affect decisions; skip it for simple, self-contained, or directly answerable tasks.
- After verified non-trivial work, user corrections, repeated tool failures, or newly discovered reusable workflows, consider `/learn` or `@improver` only when there is a durable lesson to evaluate. Do not invoke self-improvement just because a task completed.
- Save only compact, verified, non-sensitive learning. Do not persist secrets, raw logs, large code blocks, temporary task facts, or unverified guesses.
- Raw logs are valid transient diagnostic evidence. Do not treat raw logs as a cross-project defect or something to "fix" unless a project-local policy, exposed secret/PII, excessive verbosity, or production behavior makes them unsafe.
- Prefer patching an existing focused skill over creating a near-duplicate.
- Keep `oc_learning_*` write tools out of the root profile and ordinary agents. Self-improvement must route through `improver` and use `oc_learning_*` tools so validation, path confinement, and backups apply.
- Do not let the self-improvement loop modify product code, `AGENTS.md`, `opencode.json`, agent definitions, or plugins unless the user explicitly requests a configuration change.
- See `docs/memory-and-self-improvement.md` for the current memory/self-improvement architecture, scope boundaries, basis, and verification commands.

## Output

- Respond in the user's language.
- Be direct and pragmatic.
- Prefer the smallest correct change; verify with the most relevant test/build command when feasible.
