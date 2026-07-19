---
name: global-wide-deep-context
description: Build bounded, receipt-backed whole-system context before high or critical implementation. Use for broad, cross-module, public-contract, persistence, concurrency, lifecycle, migration, security, or compatibility changes that require direct and transitive impact analysis, deep critical-path reasoning, falsification, and final blast-radius reconciliation; keep genuinely local standard-lite work compact.
---

# Global Wide/Deep Context

## Preserve the authority boundary

Treat this skill as an analysis procedure, not a mutation gate. Let the runner
select the minimum strategy, create receipt identities, calculate sufficiency,
and authorize the existing Engineering Dossier gate. Never claim that prose,
file volume, a finalized report, or this skill itself permits an edit.

Use `global-quality-gates` for risk, behavior, compatibility, test, and
completion contracts. Do not restate or replace those contracts here.

## Follow the selected strategy

1. Read the runner-selected strategy and task profile.
2. For high or critical work, confirm that a provisional Engineering Dossier
   draft and provisional impact graph exist before any instrumented context
   operation.
3. Form narrow questions for the affected system instead of requesting a
   repository dump.
4. Collect bounded read-only evidence and retain only runner-owned receipt IDs.
   Instrumented context operations and read-only children are serialized: settle,
   bind, and incorporate one result before launching the next. Profile-only mode
   may optionally parallelize independent read-only work, but it provides no
   computational receipt-chain guarantee.
5. Refine the Dossier impact graph and linked report from the evidence, synthesize
   the wide pass, and analyze each critical impact path separately.
6. Finalize the report only after required categories, challenges, and
   falsification attempts are represented, then wait for runner-computed context
   sufficiency.
7. Ask architect and reviewer to challenge the current Dossier and current
   context report. Then finalize the Dossier, evaluate the existing gate, and
   request writable work only after a runner-owned passed gate.

Escalate when discovery reveals a stronger risk class or a boundary the current
strategy does not cover. Never request a weaker strategy than the runner chose.

## Run the wide pass

Represent or evidence-reasonably exclude the applicable surfaces:

- repository instructions and ownership;
- modules, services, entry points, callers, callees, and transitive consumers;
- public APIs, commands, schemas, shared types, serialization, and config;
- persistence, transactions, caches, events, queues, jobs, and dependencies;
- architecture layers and side-effect boundaries;
- relevant tests, fixtures, sibling implementations, and unknown paths;
- context-tool availability, fallback quality, truncation, and remaining budget.

Separate observed facts, inferred relationships, unresolved hypotheses, and
reasoned exclusions. Attach receipt IDs to non-inferred claims. Literal search
may locate candidates but does not prove complete semantic relations.

Use `explore` for narrow independent mapping questions under the active mode's
serialization contract. Ask `architect` to challenge
blast radius, ownership, and critical-path selection. Ask `reviewer` to
challenge counterexamples, edge cases, and test obligations. Keep each request
narrow and require evidence, uncertainty, and the decision unblocked.

## Analyze critical paths deeply

For each critical impact-graph path, trace ordered nodes and edges through the
applicable dimensions:

- inputs, outputs, preconditions, postconditions, and state transitions;
- transformations, side effects, and error propagation;
- retry, repeated invocation, idempotency, timeout, and cancellation;
- concurrency, ordering, transaction, rollback, and cleanup;
- cache/stale state, compatibility/version skew, authorization, and sensitive
  data boundaries;
- linked invariants, edge cases, failure modes, and test obligations.

Give every deep analysis and question a stable ID. Mark a dimension not
applicable only with a specific evidence-backed reason.

## Challenge hypotheses

Attempt to falsify at least one material assumption for every high or critical
path. For bug fixes, test whether the visible location is merely a symptom and
look for sibling variants. For refactors, require characterization evidence.
For new features, challenge negative paths and compatibility behavior.

Record the expected observation, actual observation, status, receipt IDs,
impact if wrong, and next action. A refuted hypothesis must update the impact
graph, deep analysis, or plan. Material uncertainty keeps sufficiency blocked.

## Use tools without widening permissions

Prefer the portable read-only tools `context_outline`, `context_files`,
`context_search`, and `context_read`. Use `context_map`, `context_batch_read`,
`context_symbols`, or `context_related` only when the host explicitly exposes
the optional read-only overlay. Do not add shell, network, write, or persistence
authority to obtain context.

Record unavailable or truncated semantic evidence honestly. Fall back to
bounded file discovery and literal search, state the reduced semantic coverage,
and keep any unsupported completeness claim blocked.

## Stop or escalate deliberately

Stop when required wide categories are represented or reasoned-excluded, every
critical path has applicable deep dimensions, no blocking unknown remains, and
every applicable risk maps to verification. Stop also when further reads are
duplicates or low-value; budgets are ceilings, not targets.

Escalate or remain incomplete when evidence is stale, truncated without
resolution, bound to another session/workspace, missing a direct or transitive
path, or unable to support a claimed relationship.

## Reconcile the final change

Before attestation, compare the final implementation with the planned context.
Confirm that changed paths remain within ownership and report coverage, public
contracts and dependency direction did not change unexpectedly, new state or
side-effect edges were analyzed, critical paths map to final verification, and
the diff contains no unrelated write.

Invalidate prior sufficiency when implementation introduces an unplanned
high-impact path. Revise the report, repeat architect/reviewer challenge as
needed, and let the runner re-evaluate the existing gate.

## Keep standard-lite local

For a runner-confirmed local task, collect only the bounded local evidence
needed to confirm behavior, ownership, nearby edge cases, and targeted checks.
Do not require a whole-system report, transitive graph, or broad fan-out.
Escalate if discovery finds a public contract, transitive consumer,
persistence, concurrency, security, migration, or multi-module impact.
