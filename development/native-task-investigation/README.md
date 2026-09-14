# Optional test investigation: implementation and admission status

The runtime candidate is frozen at `9cd8ffb4dfcfd32f1a7a65ac9c3eaca44728d2e7`.
The [frozen manifest](frozen-inputs.json) records the three new tasks, nine slots,
input hashes and 900/180-second budgets. See [PLAN.md](PLAN.md) for the unchanged
P/R/H comparison and Q/T/D rubric, and [installation and usage](../../docs/native-task/INVESTIGATION.md).

## What is verified

- The nested-worktree dependency fix preserves npm's ordered local/ancestor
  resolution, independent writable dependency copies and ordinary lifecycle
  commands. The quick-lru regression reproduces the old cache-only selection
  failure and verifies the installed ordinary-suite → cache → sense baseline →
  engine/variant → new assertion → replay → applicable terminal-patch chain.
  [Dependency evidence](dependencies.json).
- The optional direct-mode investigator receives the original task and current
  snapshot, uses the author's model and shared deadline/diagnostic budget,
  returns only project tests, and cannot recursively delegate. Acceptance checks
  the exact author snapshot. Default behavior remains unchanged.
- Installed scripted H, R and default paths, real-child cancellation and verified
  termination passed. Dependency tampering found by the single integration review
  is rejected by the final implementation. The targeted dependency, sensitivity,
  investigation, template, task, scheduler and transport checks passed.
- All three original project suites passed. Offline calibration accepted the
  reference and an alternative implementation for each task and rejected all six
  substantive wrong implementations. This is evaluator calibration, not model
  delivery evidence. [Compact validation](validation.json).

The full verifier remains failed with `PROCESS_CONTAINMENT_UNAVAILABLE`; its
mandatory stages are unavailable. The separately verified container path does not
turn that aggregate verifier green.

## Model comparison: not started

On 2026-09-14, execution approval was rejected before process creation, including
a second review supplied with the exact task permission and destination evidence.
The approval service required trusted direct user confirmation for sending the
public source/task/test material, variant instructions, each attempt's own patches
and actual tool results to `https://chatgpt.com/backend-api/codex/responses`.
This is an execution-approval blocker, not an observed provider/auth/quota failure.
No rejection was bypassed.

Completed task-runs: **0/9**. Real provider requests: **0**. No slot was consumed,
no model result exists, and no model quality, Q/T/D or integration contribution can
be assigned. Model token usage is zero because no request began; developer,
scripted-fixture and evaluator work are separate and are not model-campaign costs.
No monetary cost is inferred. No historical campaign was resumed.

The prepared candidate remains experimental. The intended full-task comparison and
its final patches, attribution and resource report remain outstanding, pending
execution approval. The frozen inputs and order must be preserved on continuation;
there are still no retries, replacement tasks or additional real smokes authorized.
