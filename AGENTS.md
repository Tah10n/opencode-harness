# OpenCode Harness Rules

The maintained product is the native materializer and runtime. Use the current
README and docs/USAGE.md; archived profile generations are not supported modes.
Keep changes in a short branch from main, verify the PR, merge and delete its
branch. Research results belong in the results index, not permanent branches.

## Default operating loop

For ordinary development:

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

## Verification and broader investigations

Run `npm ci --ignore-scripts`, install the pinned sensitivity dependencies with
`npm ci --ignore-scripts --prefix profiles/native/sensitivity`, then `npm run verify`.
`OPENCODE_BIN=/absolute/path/to/opencode npm run verify:installed` exercises
OpenCode 1.18.26 with a local provider. CI also tests actual container boundaries.
These checks do not authorize real model calls. Full evaluation is separately
explicit and follows evaluation/polybench/README.md.

For broad audits, at most three focused read-only children may help inspect
independent surfaces; the primary agent remains the integrator. Archived
assurance, quality and verified-change generations must not be recommended as
current product modes. Missing optional context tools do not block ordinary
work: use bounded read/search and state the coverage gap.

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
