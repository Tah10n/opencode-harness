# opencode-harness

Reproducible OpenCode orchestration profile.

This repository contains a reusable OpenCode behavior profile:

- primary orchestrator prompts;
- focused subagents;
- global safety rules;
- review and re-review ledger workflow;
- recursive-context operating rules;
- controlled memory and self-improvement policy;
- commands such as `learn`, `curate-learning`, `review-diff`, and `workflow`.

It is intentionally separate from plugin capabilities:

- `opencode-recursive-context` provides safe read-only `context_*` tools.
- `opencode-learning-guard` provides bounded `oc_learning_*` write tools.
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

## Local State Boundary

`skills/global-memory/SKILL.md` in this repository is a clean template. It
defines the memory shape and policy, but it should not contain private durable
memory entries.

## Repository layout

```text
AGENTS.md              global rules
opencode.json          permissions, default agent, command entries
agents/                primary and subagent prompts
skills/                reusable global skills and templates
commands/              command prompt files
docs/                  design notes and verification guidance
```

## Why this is a harness

Plugins add tools. A harness defines the agent runtime behavior around those
tools: orchestration, safety, delegation, context gathering, review loops, and
verification discipline.
