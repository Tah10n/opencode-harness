# Adoption Guide

Use this guide when copying or adapting `opencode-harness` into an OpenCode
configuration.

## Harnessability

Before adoption, use [docs/harnessability.md](harnessability.md) to check
whether the target project has enough local workflow, verification, and
boundary information for the harness to regulate agent work effectively.

## Prerequisites

- OpenCode installed in the target environment.
- Node.js available for local verification.
- Capability packages configured where the host profile can load them:
  - [`opencode-recursive-context`](https://github.com/Tah10n/opencode-recursive-context)
  - [`opencode-learning-guard`](https://github.com/Tah10n/opencode-learning-guard)

## Files To Copy

Copy or adapt these paths into the target OpenCode configuration:

- `AGENTS.md`
- `opencode.json`
- `agents/`
- `commands/`
- `skills/`
- `docs/`

Do not copy repo-local development files such as `.github/`, `fixtures/`, or
`scripts/` into a personal OpenCode config unless you intentionally want the
template development checks there.

Do not copy machine-local traces into the template. `docs/trace-contract.md`
defines a portable event shape, but real trace files remain local artifacts.

## Local State Boundary

Keep these outside this template:

- private memory entries;
- machine-local plugin paths;
- project-specific build, test, product, or architecture facts;
- raw logs and credentials;
- real traces or task transcripts that contain private context;
- local automation that only applies to one machine.

Use project-local `WORKFLOW.md`, `.opencode/skills/*`, or `.agents/skills/*`
for repository-specific operating rules.

## Verification

Run the template verifier before publishing or copying changes:

```sh
npm run verify
```

After installing into a live OpenCode configuration, verify the effective
runtime surface:

```sh
npm run verify:runtime
```

If you prefer to run the underlying OpenCode checks manually:

```sh
opencode debug config
opencode debug agent orchestrator
opencode debug agent orchestrator-deep
opencode debug agent review-orchestrator
opencode debug agent reviewer
opencode debug agent improver
```

Expected result:

- orchestrator/orchestrator-deep/review-orchestrator/reviewer/explore/architect/diagnose/verifier
  expose `context_outline`, `context_files`, `context_search`, and
  `context_read`;
- additional recursive-context tools are treated as host opt-ins, not required
  harness defaults;
- root config denies `oc_learning_*`;
- only `improver` has bounded `oc_learning_*` write tools;
- review requests remain read-only unless fixes are explicitly requested.
- delegated agents report the shared schema from
  `docs/subagent-result-schema.md`, including `files_changed` and
  `termination_reason`.

## Post-Adoption Confidence Levels

Use these layers in order:

1. Deterministic repository checks: `npm run verify`, including live-eval
   manifest validation and runner self-tests when those files are present.
2. Installed runtime permission checks: `npm run verify:runtime` against the
   copied profile.
3. Optional live smoke or A/B tasks in the host profile for orchestration,
   delegation, review-loop, or high-assurance behavior changes.

Live A/B evaluation is behavioural evidence, not a replacement for runtime
permission checks.

Adversarial fixtures under `fixtures/adversarial/` are repository-side static
contracts. Do not execute them or copy them into host projects as runtime
payloads.

## Project-Level Verification Guidance

Host projects should document commands in `WORKFLOW.md` or project-local
skills for:

- targeted tests;
- affected-module or package tests;
- full-suite checks;
- typecheck;
- lint;
- production build;
- integration or E2E;
- race or stress;
- fuzz or property;
- mutation;
- migration;
- rollback or recovery;
- fault injection.

Workflow files describe commands and order only. They do not grant permissions;
OpenCode config remains the permission source of truth.
