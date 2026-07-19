---
name: global-review-ledger
description: Use for code review, reviewer scope decomposition, finding ledgers, and bounded review-fix-re-review loops
license: MIT
compatibility: opencode
metadata:
  workflow: review
---
## Review baseline

- Review requests are read-only unless the user explicitly asks for fixes.
- Do not edit files, stage changes, commit, or run fix commands during review.
- Use up to ten `@reviewer` subagents only when distinct scopes are useful. Instrumented quality mode runs reviewer children one at a time so each result is settled and incorporated before the next; profile-only mode may optionally parallelize independent reviewer scopes without a computational receipt-chain guarantee.
- Prefer distinct reviewer scopes: correctness, tests/coverage, API/contracts, security/privacy, performance/concurrency/resource lifecycle, and UX/i18n/docs/build-release.
- Each reviewer must return concrete findings with severity, file/line evidence, impact, and a recommended fix.

## Finding ledger

Aggregate reviewer results into one ledger:

- Assign stable IDs to confirmed high/medium findings.
- Deduplicate repeated findings.
- Order by severity.
- Preserve file/line references.
- Include impact and resolution criteria.
- Include scope coverage and verification gaps.
- Include finding source:
  - initial review;
  - plan challenge;
  - final adversarial audit;
  - regression introduced by fix.
- Link each finding to the violated contract, trigger condition, expected test
  or verification evidence, and resolution evidence.
- Separate confirmed issues from questions and low-priority notes.

Use these statuses:

- `open`: accepted high/medium issue still requiring action.
- `resolved`: fix verified or evidence shows the issue no longer applies.
- `blocked`: accepted issue cannot be fixed safely or needs user/external input.
- `backlog`: unrelated, pre-existing, low-priority, or out-of-scope issue.

Preserve the ledger in every review or fix response.

## Fix pass

- Fix only accepted high/medium ledger items.
- Avoid opportunistic refactors, style cleanup, or unrelated behavior changes unless required to resolve a ledger item.
- Keep fixes scoped to the ledger resolution criteria.
- Run the narrowest relevant verification when feasible.
- Tests or verification must prove the resolution when the project has an
  applicable test layer. Do not close a finding only because the implementer
  explains why it should be fixed.

## Re-review

- After a fix pass, re-review against the ledger and the latest fix diff, not another open-ended branch review.
- Use at most ten `@reviewer` subagents only when unresolved ledger items or latest-fix risks split into independent scopes; otherwise use fewer.
- Re-reviewers must verify whether each ledger item is resolved, whether the latest fix introduced new high/medium regressions, and whether targeted tests or checks cover the changed behavior.
- Treat unrelated pre-existing findings as `backlog` unless they are high severity and directly affect the changed lines or call path.
- For findings from final adversarial audit, re-review only the final-audit IDs
  and any confirmed regressions introduced by the fix. Do not run another fresh
  open-ended final audit.
- Do not close a finding without resolution evidence from code, tests,
  verifier output, or direct artifact inspection.

## Stop conditions

Stop the review/fix loop when:

- all accepted high/medium ledger items are resolved,
- no new high/medium regression from the fix is confirmed,
- relevant verification has passed or is clearly reported as infeasible.

Also stop when:

- the same high/medium issue repeats after a fix attempt,
- an accepted issue cannot be fixed safely,
- only low-priority notes or unrelated backlog items remain.

When stopping for low-priority or backlog-only items, ask the user whether to continue.

Do not restart fresh open-ended reviews indefinitely. A new broad review is a
new task unless the user explicitly asks for it.
