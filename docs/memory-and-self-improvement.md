# Memory and Self-Improvement

This note documents the global OpenCode memory and self-improvement system: what changed, why it exists, and what the design is based on.

## Current shape

Global durable memory is intentionally small and generic. It lives in `skills/global-memory/SKILL.md` and stores only compact, verified, non-sensitive lessons that are useful across projects.

Controlled self-improvement is a bounded maintenance workflow. It lives in `skills/global-self-improvement/SKILL.md`, is executed by `agents/improver.md`, and must write persistent changes through `oc_learning_*` tools supplied by `opencode-learning-guard` or an equivalent host integration.

Project-specific workflow knowledge belongs in the project, not in the global config. Use project-local `WORKFLOW.md`, `.opencode/skills/*`, or `.agents/skills/*` for repo-specific build commands, test commands, product behavior, architecture notes, and domain gotchas.

Memory is not an always-on epilogue. The host profile should load memory only
when a non-trivial task could benefit from durable preferences or prior lessons,
and it should route writes only when there is a concrete verified lesson to
evaluate.

## Profile Guarantees

- `skills/global-memory/SKILL.md` is a clean template, not a store for private memory entries.
- Project-specific build commands, test commands, product facts, and domain rules stay in project-local workflow docs or skills.
- Scope rules in `skills/global-memory/SKILL.md` keep project-prefixed entries as scoped hints, not global policy.
- The `opencode-learning-guard` integration should regenerate `global-memory` with the same storage and scope rules.
- The `opencode-learning-guard` implementation is the authoritative place for managed-memory capacity limits.
- The raw-log boundary is explicit across `AGENTS.md`, `agents/orchestrator.md`, `agents/improver.md`, `skills/global-memory/SKILL.md`, and `skills/global-self-improvement/SKILL.md`.

## Why this design

The global config should be safe to reuse across all projects. It should not preload facts about one repository into unrelated work, because that creates false constraints and noisy decisions.

Memory and self-improvement are separated by responsibility:

- `global-memory` answers "what durable fact should future runs remember?"
- `global-self-improvement` answers "should this verified experience become memory or a reusable skill?"
- the `opencode-learning-guard` implementation enforces validation, capacity, path confinement, backups, and managed-skill boundaries.
- `agents/improver.md` is allowed to curate memory and managed skills, but not product code or core OpenCode config unless the user explicitly requests a config change.

This keeps the feedback loop useful without letting the agent rewrite its operating environment opportunistically.

## Persistence rules

Persist only:

- durable user preferences;
- stable environment facts;
- reusable workflow lessons;
- project conventions only when they are explicitly scoped or stored inside that project;
- compact redacted lessons from repeated verified failures.

Do not persist:

- secrets, credentials, tokens, private keys, or `.env` values;
- raw logs, stack traces, large code blocks, or data dumps;
- one-off task facts;
- unverified guesses;
- instructions that weaken safety policy;
- project-specific build/test/product facts in the global memory file.

Raw logs are valid transient diagnostic evidence. The ban is on persisting raw logs into durable memory or reusable self-improvement artifacts, not on using logs during diagnosis.

## Self-improvement flow

Use this flow after verified non-trivial work, user corrections, repeated tool failures, or reusable workflow discoveries:

1. Load `global-self-improvement`.
2. Decide whether the lesson is durable, verified, non-sensitive, and reusable.
3. If it is a compact cross-project fact, store it in `global-memory`.
4. If it is procedural and reusable, patch or create a focused managed skill.
5. Prefer patching an existing focused skill over creating a near-duplicate.
6. Use only `oc_learning_*` tools for persistent writes, so validation and backups apply.
7. Verify the effective loaded surface after changes.

Self-improvement must not mutate product code, `AGENTS.md`, `opencode.json`, agent definitions, plugins, bundled skills, or project-local skills unless the user explicitly asks for that configuration or project change.

## Token and tool-exposure controls

The host harness controls exposure even when a package exposes several tools.
Root and ordinary agents should not receive learning write tools; the default
host posture is `oc_learning_*: deny` at root and `oc_learning_*: ask` only on
`agents/improver.md`.

For package-based hosts, configure the `opencode-learning-guard` plugin with the
smallest useful surface:

- `toolset: "memory-read"` for profiles that only need bounded memory lookup and cleanup audit;
- `toolset: "memory-write"` for curated memory audit/add/replace/remove without skill writes;
- `toolset: "improver"` for the controlled self-improvement profile;
- `toolset: "none"` for projects that want the package installed but disabled;
- `enabledTools` for an explicit allow-list when a host needs a narrower mix.

Memory cleanup is audit-first. Use `oc_learning_memory_audit` to identify
duplicates, overlong entries, safety-scanner hits, capacity pressure, and
project-scope candidates without mutating files. Apply only reviewed
`oc_learning_memory_remove` or `oc_learning_memory_replace` changes; these
operations should create backups before writes and can use a guarded
`entry_number` when duplicate entries make substring matching ambiguous.

This repository is the harness source, not the active capability package. The
current installed OpenCode profile may still use `tools/oc_learning.js` as the
runtime enforcement point, so keep permission routing and runtime verification
aligned with that active install path.

## Enforcement surfaces

- `AGENTS.md`: global policy for when to load memory and when to consider `/learn` or `@improver`.
- `agents/orchestrator.md`: runtime behavior for loading `global-memory` and bounding self-improvement.
- `agents/improver.md`: the controlled self-improvement agent contract and hard boundaries.
- `skills/global-memory/SKILL.md`: durable memory content and scope rules.
- `skills/global-self-improvement/SKILL.md`: decision workflow for memory versus skill updates.
- `opencode-learning-guard` or equivalent host integration: authoritative implementation for memory capacity, entry size, validation, backups, and managed-skill write paths.
- package host options such as `toolset` and `enabledTools`: optional narrowing controls for package-based installs.
- Project-local `.opencode/skills/*`: the right place for repo-specific procedures.

## Verification

After editing this system, run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('opencode.json','utf8')); console.log('opencode json ok')"
opencode debug config
opencode debug agent orchestrator
opencode debug agent improver
```

When prompt/tool exposure changes for other agents, also run:

```powershell
opencode debug agent explore
opencode debug agent general
opencode debug agent reviewer
opencode debug agent verifier
```

Before approving memory changes, check both the file diff and the rendered managed-memory size against the configured capacity limit in the `opencode-learning-guard` implementation.

To confirm global memory is still project-neutral, search for known private project names and project-specific commands in the global config:

```powershell
rg -n "private-project-name|project-specific-command|internal-service-name" AGENTS.md agents skills opencode.json
```

No matches should remain in active global prompt, memory, skill, or config surfaces unless a future global rule intentionally references one of those strings.

## Basis

This design follows these principles from `DenisSergeevitch/agents-best-practices`:

- Keep the agent loop simple and make the harness/runtime responsible for validation, authorization, execution, recording, and observations.
- Context should be built, not dumped; use scoped memory and retrieve just enough relevant information.
- Separate memory categories by purpose and authority; project/domain conventions are not the same as global policy.
- Skills should use progressive disclosure: expose name and description first, load focused instructions only when relevant.
- Durable knowledge should live in agent-readable artifacts rather than only in chat history.
- Repeated failures should become tools, validators, docs, evals, or policies instead of repeated prompt advice.
- Documentation alone is weaker than mechanical enforcement; keep capacity limits, validation, backups, and path boundaries in the `opencode-learning-guard` implementation.

Relevant upstream references:

- `https://github.com/DenisSergeevitch/agents-best-practices`
- `https://raw.githubusercontent.com/DenisSergeevitch/agents-best-practices/main/references/context-memory-compaction.md`
- `https://raw.githubusercontent.com/DenisSergeevitch/agents-best-practices/main/references/skills-and-connectors.md`
- `https://raw.githubusercontent.com/DenisSergeevitch/agents-best-practices/main/references/agent-legibility-feedback-loops.md`
