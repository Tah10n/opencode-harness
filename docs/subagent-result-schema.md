# Subagent Result Schema

Subagent outputs should be compact, decision-ready, and easy for the
orchestrator to aggregate, compare, trace, and evaluate. Agent-specific output
sections may remain, but each subagent should use or map onto the common
header/footer shape below.

## Common Fields

Required common fields:

- `status`: one of `completed`, `changed`, `no-op`, `no-findings`, `blocked`,
  `failed`, or `unsafe`.
- `assigned_scope`: what this subagent was asked to own.
- `summary`: decision-ready result in 1-3 sentences.
- `evidence`: paths and lines, commands, source URLs, or observations that
  support the result.
- `files_changed`: exact paths changed; use `[]` for read-only agents.
- `verification`: commands or checks run and result, or why not run.
- `decision_unblocked`: what decision this result enables for the orchestrator.
- `uncertainty`: what remains unknown.
- `risks`: concrete residual risks.
- `next_step`: recommended next local or delegated step.
- `termination_reason`: value from
  [docs/budgets-and-termination.md](budgets-and-termination.md).

Read-only agents must explicitly report `files_changed: []`. Implementation
workers must report exact changed paths.

## Agent-Specific Extensions

`@explore`: include ranked locations, symbols, call paths, and ownership hints.

`@architect`: keep `decision`, `context_gate`, `slices`, `sequence`, `risks`,
and `verification`; add the common fields.

`@general`: keep changed/no-op/blocked implementation handoff details,
including tests and integration notes; add the common fields if missing.

`@reviewer`: keep severity findings and re-review classifications; add the
common fields and make `files_changed: []`.

`@diagnose`: include repro status, evidence, likely root cause, and next fix or
verification step.

`@researcher`: include primary sources, facts versus inference, date or version
caveats, and next implementation or verification step.

`@verifier`: include exact command results, failure cause, next check, and
residual risk.

`@improver`: keep its existing `status`, `target`, `change`, `reason`,
`skipped`, and `risk` shape, but align with common fields where practical. Do
not weaken the self-improvement boundary.

## Aggregation Rules

The orchestrator should aggregate subagent results by:

- evidence;
- uncertainty;
- termination reason;
- decision unblocked;
- residual risks;
- exact files changed or explicit `files_changed: []`.

The orchestrator should not paste raw subagent output as the final answer. It
should synthesize the results into the decision, implementation, verification
evidence, unresolved gaps, and residual risks.
