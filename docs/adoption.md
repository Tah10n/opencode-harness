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

## Local State Boundary

Keep these outside this template:

- private memory entries;
- machine-local plugin paths;
- project-specific build, test, product, or architecture facts;
- raw logs and credentials;
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
opencode debug agent reviewer
opencode debug agent improver
```

Expected result:

- orchestrator/orchestrator-deep/reviewer/explore/architect/diagnose/verifier expose
  `context_outline`, `context_files`, `context_search`, and `context_read`;
- root config denies `oc_learning_*`;
- only `improver` has bounded `oc_learning_*` write tools;
- review requests remain read-only unless fixes are explicitly requested.
