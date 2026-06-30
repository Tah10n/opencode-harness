# Budgets And Termination

This policy prevents runaway delegation, infinite review loops, uncontrolled
diagnosis, and vague "keep going" behavior. It defines when the orchestrator
should continue, stop, ask, or hand off partial results.

## Task Classes

`small/local/direct`: Prefer the root loop. Do not delegate unless a specific
blocker exists and a focused side task can unblock the next local action.

`broad read-only audit`: Recursive-context mode is allowed. Delegate only
independent context scopes with narrow evidence requests and no edits.

`review`: Use only distinct reviewer scopes. Preserve the existing "up to ten
reviewers only when useful" policy and keep review read-only.

`review-fix-re-review`: Fix only ledger-backed findings. Re-review is
ledger-bounded; do not start a fresh broad review after each fix pass.

`implementation`: Use `@architect` before parallel write work. Use `@general`
workers only for disjoint slices with explicit ownership, test obligations, and
verification boundaries.

`diagnosis`: Stop once repro status, strongest evidence, likely root cause, and
next verification step are known.

`research`: Use primary sources for unstable external facts. Stop once the
decision, caveats, and next implementation or verification step are clear.

`self-improvement`: Do not run just because a task completed. Run only for a
durable, verified, non-sensitive lesson that belongs in memory or a managed
skill.

## Default Budget Guidance

- Small/local/direct tasks: prefer the root loop; no delegation unless a
  specific blocker exists.
- Broad read-only tasks: recursive-context mode is allowed; delegate only
  independent context scopes.
- Reviews: use only distinct reviewer scopes; preserve the "up to ten
  reviewers only when useful" policy.
- Implementation: use `@architect` before parallel write work; `@general`
  workers only for disjoint slices.
- Re-review: ledger-bounded re-review only; do not start a fresh broad review
  after each fix pass.
- Diagnosis: stop once repro status, strongest evidence, likely root cause, and
  next verification step are known.
- Research: stop when the current primary-source evidence is enough to make or
  defer the decision.
- Self-improvement: do not run just because a task completed.

## Termination Reasons

Use these values in traces, subagent handoffs, verifier output, and final
quality ledgers:

- `done`
- `verified`
- `partially_verified`
- `blocked_missing_context`
- `blocked_user_decision`
- `blocked_permission`
- `blocked_external_state`
- `unsafe_without_permission`
- `conflicting_write_scope`
- `budget_exhausted`
- `verification_failed`
- `not_reproducible`

## Stop Conditions

Stop, ask, or hand off partial results when any of these conditions is true:

- no remaining high-value independent work exists;
- the next action would require destructive or high-side-effect permission;
- required external state, credential, or user decision is missing;
- the verification boundary has been reached;
- the re-review ledger is resolved;
- worker output is weak after one narrowing or redirection pass;
- continuing would exceed the useful task budget without changing the decision;
- write ownership conflicts with another slice or user change;
- the task is unsafe without explicit permission.

## Orchestrator Checklist

Before continuing a non-trivial task:

- classify the task class and risk;
- decide the immediate local next step;
- identify any independent context or verification work that can run in
  parallel without blocking the local step;
- set the evidence needed to stop or proceed;
- pass explicit ownership and verification boundaries to workers;
- require subagent results to include `termination_reason` and
  `decision_unblocked`;
- aggregate results by evidence, uncertainty, termination reason, and decision
  unblocked;
- stop with `blocked_*`, `unsafe_without_permission`, `verification_failed`, or
  `partially_verified` instead of vague continuation when the boundary is hit;
- report unresolved gaps and residual risks in the final handoff.
