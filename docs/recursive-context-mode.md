# Recursive Context Mode

## Purpose

Recursive context mode is the default workflow for large OpenCode audits and research-heavy tasks. It is intended for broad code audits, production-readiness checks, repository or article study, long-log review, large-diff review, and multi-module or multi-service bug sweeps.

The goal is to keep the root orchestrator's context small and decision-focused while moving broad reading, search, and independent semantic checks into bounded read-only tools and focused subagents.

This is not a new slash command. The mode is selected automatically by the orchestrator when the task shape is large enough.

## What Changed

- `AGENTS.md` now tells the orchestrator to automatically enter recursive-context mode for broad audits and to skip it for small local tasks.
- `agents/orchestrator.md` and `agents/orchestrator-deep.md` define the automatic trigger, sequencing, and safety rules.
- The separate `opencode-recursive-context` capability package provides the
  minimal safe harness surface of four read-only tools:
  - `context_outline`: returns a compact worktree map and detected workflow/skill guidance.
  - `context_files`: returns a scoped file inventory.
  - `context_search`: performs literal text search inside the current worktree.
  - `context_read`: reads bounded line ranges from text files.
- If the installed capability package also exposes advanced tools such as
  `context_map`, `context_batch_read`, `context_symbols`, or `context_related`,
  those advanced tools are opt-in for host profiles. This template intentionally
  grants only the four-tool minimal safe harness surface by default.
- Read-only and diagnostic agents can use those tools: `explore`, `reviewer`, `architect`, `diagnose`, and `verifier`.
- Milestone 3 records actual bounded context operations as sanitized receipts,
  links wide/deep analysis to the Milestone 2 impact graph, and computes context
  sufficiency before the existing Engineering Dossier gate. The tools and
  report still do not authorize edits or declare either gate passed.

## Basis

The design is based on the Recursive Language Models idea from:

- https://github.com/alexzhang13/rlm
- https://alexzhang13.github.io/blog/2025/rlm/
- https://arxiv.org/abs/2512.24601

The useful idea from RLM is not the exact Python implementation. The useful idea is context decomposition: keep the root model from ingesting the full context, expose the context through a programmatic environment, and let the root model inspect, filter, split, delegate, and aggregate evidence.

For this OpenCode config, the implementation is deliberately OpenCode-native:

- Root orchestration stays in `orchestrator`.
- Semantic fan-out stays in existing subagents such as `@explore`, `@researcher`, `@reviewer`, `@diagnose`, and `@verifier`.
- Context access uses local plugin tools instead of a Python `exec` REPL.
- Existing OpenCode permissions remain the safety boundary.

## Safety Model

The tools are read-only and path-confined to the current worktree.

They skip common generated or high-noise directories, including `.git`, `node_modules`, build outputs, caches, virtual environments, IDE folders, and test caches.

The capability also excludes `.oc_harness` so runner receipts, reports, and
control state cannot feed back into repository inventory or fingerprints. For
this harness, configure the additive host policy with
`additionalIgnorePathPrefixes: ["evals/reports", "evals/decisions"]`; do not
use a broad prefix such as `reports`, which could hide legitimate source.

They refuse secret-like files and paths, including `.env`, `.env.*` except `.env.example`, private key names, cloud credential directories, common package-manager and build credential files such as `.npmrc`, `.netrc`, `.git-credentials`, `gradle.properties`, `local.properties`, `settings.xml`, and key/certificate extensions such as `.key`, `.pem`, `.p12`, and `.pfx`.

`context_search` returns bounded match excerpts rather than full arbitrarily long lines. When a line is shortened, the result marks `textTruncated: true` and increments `truncatedMatches`.

They do not provide shell execution, write access, package installation, network access, or permission escalation.

The `context_*` tools are the preferred bounded read path for broad audits, but
they are not an absolute security boundary when a profile also grants native
read or shell tools. This harness therefore verifies both guidance and
effective permissions where possible, and documents native shell/read exposure
as part of the agent permission surface.

## Capability Contract

The coordinated target is `opencode-recursive-context` 0.2.0 with output schema
v2, contract version 2.0, and policy version 1. Legacy schema-v2 envelopes
without producer metadata remain accepted; present metadata must identify the
known producer and a supported contract.

- `guidance` remains a path-only string array for legacy consumers.
  `guidanceEntries` adds bounded `kind`, `appliesTo`, and `source` metadata; the
  harness persists no guidance contents.
- Instrumented normal-session `context_read` calls execute with `format: "json"`
  and bind that actual format in their receipt. Direct capability calls retain
  the existing text default.
- Excerpt shortening and range boundaries are informational. They may remain in
  `truncation_codes`, but do not make complete stable coverage partial. File,
  byte, line, match, symbol, relationship, deadline, and snapshot ceilings do.
- A successful `context_batch_read` contributes the same content-backed ranges
  as individual reads. A mixed batch preserves only successful path-local
  ranges and typed item failures; it remains partial and cannot establish
  complete requested-scope coverage.
- `context_files` pagination is bound to the full inventory snapshot through a
  canonical cursor and expected fingerprint. Individual paginated pages remain
  partial, non-authorizing evidence until a complete continuation-chain shape is
  represented by the receipt contract. `context_map.workspaces` is bounded,
  path-only repository evidence derived without executing manifests.

## Operating Rules

Use recursive-context mode automatically when a task is broad enough that direct reading would pollute the root context or miss important surfaces.

Recommended sequence for high or critical instrumented work:

1. After classification, create the provisional Engineering Dossier draft and
   provisional impact graph.
2. Start with `context_outline` or repo workflow guidance.
3. Use `context_files`, `context_search`, and bounded `context_read` ranges to
   identify likely entry points, tests, contracts, and docs.
   If a targeted `context_symbols` call is planned, use
   `context_map(includeSymbols: false)`. `context_map(includeSymbols: true)` is
   a compact initial sample only when no separate symbol scan is needed; repeat
   broad symbol scans only with a new query, kind, or narrower scope.
4. Run instrumented context operations and focused read-only children one at a
   time; settle, bind, and incorporate each result before the next launch.
5. Aggregate compact evidence with file and line references, then refine the
   Dossier and Whole-System Context Report.
6. Only after report finalization, runner-computed sufficiency, current plan
   challenges, Dossier finalization, and a passed gate may implementation begin.

Profile-only mode may optionally parallelize independent semantic checks, but it
cannot claim computational receipt-chain correlation. Instrumented mode is
serialized even when the questions themselves are independent.

Skip this mode for direct, small, single-file, or obviously local tasks.

## Relationship To The Engineering Gate

Recursive context supplies bounded evidence; it is not the gate itself. For a
high or critical instrumented task, the provisional impact graph exists first
and actual operations then produce runner-owned receipt IDs. Discovery should
identify direct and
transitive entry points, consumers, contracts, schemas/configuration,
tests/fixtures, public compatibility surfaces, persistence/lifecycle edges,
excluded siblings, and relevant unknown paths. Those facts are recorded as
stable wide-report items linked to nodes, edges, paths, exclusions, and
unknown-resolution plans in the existing Engineering Dossier impact graph.
Each critical impact path also receives a separate deep analysis. The runner
checks current receipt bindings, required coverage, falsification, deep
dimensions, unknowns, truncation, and verification mappings before allowing
the dossier gate to finalize.

When semantic `context_*` tools are unavailable, the context report records that fact,
the bounded fallback tools used, and reduced semantic coverage. It must not
pretend that literal search proved semantic completeness. For high/critical
work, skipping semantic discovery without that explicit fallback blocks the
gate.

This is also the prompt-maintainability boundary: context and evidence belong
in structured artifacts and inspectable subagent jobs, not in ever-growing
copies of global policy inside each role prompt. The plan/execute/observe/improve
workflow and explicit job/evidence shape are informed by Lilian Weng's
[Harness Engineering for Self-Improvement](https://lilianweng.github.io/posts/2026-07-04-harness/),
but this repository does not implement every system described there and does
not add an autonomous prompt-mutation loop.

Read-only discovery before a high/critical gate remains allowed. An edit or
writable delegated job is not: only the parent runner can validate the
finalized context report, compute sufficiency, validate the finalized dossier,
append the causal gate event, and enable implementation. Before attestation it
also reconciles the exact final diff with the planned context.

## Verification

The expected validation commands are:

- `opencode debug config`
- `opencode debug agent orchestrator`
- `opencode debug agent review-orchestrator`
- `opencode debug agent explore`
- `opencode debug agent reviewer`
- `npm run verify:recursive-context-contract -- --capability-root ../opencode-recursive-context`

The key expected result is that the live OpenCode config includes the external
recursive-context capability configured by the host, and the relevant agents
show `context_outline`, `context_files`, `context_read`, and `context_search`
as enabled tools. Additional `context_*` tools may be installed, but this
profile does not require or grant them unless the host opts in.

For prompt-level behaviour changes, optional live validation can run the same
broad-audit prompt against baseline and candidate profiles, then score bounded
context-tool use, subagent fan-out, evidence quality, and no-write behaviour.
