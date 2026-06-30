# opencode-harness

[![Verify](https://github.com/Tah10n/opencode-harness/actions/workflows/verify.yml/badge.svg)](https://github.com/Tah10n/opencode-harness/actions/workflows/verify.yml)

Reproducible OpenCode orchestration profile.

This repository contains a reusable OpenCode behavior profile:

- primary orchestrator prompts;
- focused subagents;
- global safety rules;
- review and re-review ledger workflow;
- high-assurance quality gates for baseline, behavior contracts, edge/failure
  matrices, verification ladders, and final adversarial audit;
- trace, budget/termination, and shared subagent result-schema contracts;
- a strict read-only primary review orchestrator for diff and release review;
- recursive-context operating rules;
- static adversarial fixtures for prompt-injection, command-injection,
  secret-bait, and review-only traps;
- controlled memory and self-improvement policy;
- commands such as `learn`, `curate-learning`, `review-diff`, `workflow`, and
  `harness-release-review`.
- deterministic verification for static structure, contract/config scenarios,
  drift, and runtime parser fixtures;
- optional installed runtime permission checks and live A/B evaluation.

It is intentionally separate from plugin capabilities:

- [`opencode-recursive-context`](https://github.com/Tah10n/opencode-recursive-context) provides safe read-only `context_*` tools.
- [`opencode-learning-guard`](https://github.com/Tah10n/opencode-learning-guard) provides bounded `oc_learning_*` write tools.
- `opencode-harness` decides when and how agents should use those tools.

## Usage

Copy or adapt the profile files into an OpenCode configuration:

- `AGENTS.md`
- `opencode.json`
- `agents/`
- `commands/`
- `skills/`
- `docs/`

Keep personal memory entries, machine-specific plugin paths, local automation,
and project-specific workflow facts outside this repository.

Detailed adoption steps live in [docs/adoption.md](docs/adoption.md). The
control matrix lives in [docs/harness-map.md](docs/harness-map.md), and project
readiness guidance lives in [docs/harnessability.md](docs/harnessability.md).
Trace, budget, and subagent handoff contracts live in
[docs/trace-contract.md](docs/trace-contract.md),
[docs/budgets-and-termination.md](docs/budgets-and-termination.md), and
[docs/subagent-result-schema.md](docs/subagent-result-schema.md).

## Adoption

1. Install or configure the capability packages:
   - [`opencode-recursive-context`](https://github.com/Tah10n/opencode-recursive-context)
   - [`opencode-learning-guard`](https://github.com/Tah10n/opencode-learning-guard)
2. Copy or adapt this profile's `AGENTS.md`, `opencode.json`, `agents/`,
   `commands/`, `skills/`, and `docs/` into the target OpenCode configuration.
3. Keep machine-local plugin paths, personal memory entries, and project-specific
   workflow facts out of this template.
4. Run the local verifier:

   ```powershell
   npm run verify
   ```

5. In the live OpenCode configuration, confirm the effective runtime surface:

   ```powershell
   npm run verify:runtime
   ```

   Or run the underlying OpenCode checks manually:

   ```powershell
   opencode debug config
   opencode debug agent orchestrator
   opencode debug agent orchestrator-deep
   opencode debug agent review-orchestrator
   opencode debug agent reviewer
   opencode debug agent improver
   ```

Expected runtime result: the orchestrator and read-only agents expose the
minimal safe `context_*` surface (`context_outline`, `context_files`,
`context_search`, and `context_read`), while `oc_learning_*` write tools are
available only through the bounded self-improvement path. Advanced
recursive-context tools are host opt-ins.

## Local State Boundary

`skills/global-memory/SKILL.md` in this repository is a clean template. It
defines the memory shape and policy, but it should not contain private durable
memory entries.

## Verification

Run the local harness checks before copying or publishing template changes:

```powershell
npm run verify
```

Run the installed-profile runtime sensor after copying the profile into a live
OpenCode configuration:

```powershell
npm run verify:runtime
```

For local private-name checks, keep the marker list outside the repository
and pass it through the environment:

```powershell
$env:HARNESS_FORBIDDEN_MARKERS=$env:HARNESS_PRIVATE_MARKERS
npm run verify
```

After copying the profile into a live OpenCode configuration, also run the
runtime checks documented in `docs/recursive-context-mode.md` and
`docs/memory-and-self-improvement.md`.

The static evaluation scenarios are documented in
[docs/evaluation.md](docs/evaluation.md). Compatibility and release guidance
live in [docs/compatibility.md](docs/compatibility.md) and
[docs/release.md](docs/release.md). Optional live A/B evaluation is documented
in [docs/live-evaluation.md](docs/live-evaluation.md). Static adversarial
fixtures live under [fixtures/adversarial/](fixtures/adversarial/).

`npm run verify` is deterministic repository-side assurance. It does not prove
actual model behaviour. Use `npm run verify:runtime` for installed permission
exposure and optional live A/B evaluation scenarios when prompt or
orchestration changes need behavioural evidence.

## Repository layout

```text
AGENTS.md              global rules
opencode.json          permissions, default agent, command entries
agents/                primary and subagent prompts
skills/                reusable global skills and templates
commands/              command prompt files
docs/                  design notes and verification guidance
examples/              copyable examples for host profiles and projects
fixtures/              static evaluation fixtures
scripts/               local deterministic harness checks
```

## Why this is a harness

Plugins add tools. A harness defines the agent runtime behavior around those
tools: orchestration, safety, delegation, context gathering, review loops, and
verification discipline.

The design is informed by Martin Fowler's
[harness engineering for coding agents](https://martinfowler.com/articles/harness-engineering.html)
framing and by runtime practices from
[DenisSergeevitch/agents-best-practices](https://github.com/DenisSergeevitch/agents-best-practices).
