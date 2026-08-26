# OpenCode Harness Rules

These rules apply to every profile. Profile-specific detail lives in the
selected agent or skill and is loaded only when needed.

## Default operating loop

Use `core` for ordinary development:

1. Read the user goal and project-local `WORKFLOW.md`, `AGENTS.md`, or relevant
   skills.
2. Locate affected entry points, consumers, contracts, and tests with bounded
   search.
3. Make the smallest cohesive change that preserves unmentioned behavior.
4. After the last mutation, run the narrowest relevant available check.
5. Review the final diff. Perform at most one bounded remediation pass when a
   new issue is found, then rerun the affected check.
6. Report checks that passed, existing and new failures, unavailable checks,
   and unverified areas separately.

Small local tasks stay single-agent. Use an independent reviewer only when it
can find defects that deterministic checks cannot. Review-only requests remain
read-only unless the user explicitly asks for fixes.

## Select heavier profiles deliberately

- `deep` is optional for broad audits, large diffs, multi-module
  investigations, long logs, and tasks that do not fit bounded local context.
  It may use focused read-only exploration and at most three independent
  read-only children. The primary agent remains the integrator.
- `assurance` is a deprecated research-only compatibility profile. Do not
  recommend it for product work. A project-local `WORKFLOW.md` may still name
  it for historical reproduction, but that does not establish release evidence.
- `lab` is not a runtime profile. It contains benchmark, evaluation, replay,
  trace, fixture, and experimental infrastructure.

Core or deep must not start or recommend legacy assurance. For high-risk work,
follow the project's own required controls or report that no promoted harness
mode currently covers the risk. Missing optional context tools never block an ordinary task;
fall back to bounded read/search and state the coverage gap.

## Engineering and verification

- Prefer project-specific tests, linters, typechecks, architecture checks, and
  workflow facts over generic prompt rules.
- Prefer computational checks when a rule can be enforced mechanically.
- Keep guides linked to sensors, and keep documentation out of always-on model
  context unless the current task needs it.
- Preserve public contracts, historical artifact readers, error semantics,
  ownership, privacy, containment, and fail-closed behavior unless the user
  explicitly requests a compatible migration.
- Model-free and structural checks do not prove model-backed behavior. Missing
  credentials, runtime, or containment is `blocked` or `unproven`, never a
  synthetic pass.
- Do not change thresholds after seeing benchmark results. Inconclusive
  evidence keeps a component optional or experimental.

## Safety and permissions

Ask before destructive, irreversible, privileged, or broad external actions,
including deletion, worktree cleaning, history rewrites, force pushes, global
or system changes, remote-script execution, and writes outside the workspace.
Resolve exact targets first. Never weaken secret handling, path confinement,
hidden-data isolation, trusted toolchains, or denial boundaries to make a check
pass.

Use small reviewable commits. Stage only the requested scope. Never commit
credentials, generated private reports, raw logs, runtime state, or local
memory. Do not force-push.

## Learning and durable state

Learning is an explicit maintenance workflow only. Root, core, deep, and
assurance deny `oc_learning_*` writes. Only `/learn` or an explicit `improver`
may request the bounded learning surface. A proposal must be evaluated and
accepted before it changes an active profile; rejected proposals make no
runtime change.
