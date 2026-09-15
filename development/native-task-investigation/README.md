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

## Model comparison: stopped after first admission

On 2026-09-14, execution approval was rejected before process creation, including
a second review supplied with the exact task permission and destination evidence.
The approval service required trusted direct user confirmation for sending the
public source/task/test material, variant instructions, each attempt's own patches
and actual tool results to `https://chatgpt.com/backend-api/codex/responses`.
No rejection was bypassed. The user supplied direct confirmation on 2026-09-15,
resolving execution and publication approval. The frozen launcher then admitted
only slot 1, QuickLRU/P. [Machine-readable results](results.json).

| Task | P | R | H |
| --- | --- | --- | --- |
| QuickLRU take | Q=false, T=false, D=false; interrupted | Not started | Not started |
| Denque drain | Not started | Not started | Not started |
| EventEmitter3 emitCollect | Not started | Not started | Not started |

Four requests reached the provider. The first title request returned HTTP 200 with
`response.failed` / `server_is_overloaded`; one author request completed and only
created a todo list. Two later requests have unknown server completion. The
existing scheduler persisted `unknown_submission`, closed admission and stopped
the native process. The local process exited 137 after 8.490 seconds, without a
normal native stop. Termination, capture, closed forwarding, zero active provider
handlers and container removal are verified. The server outcomes remain unknown;
local termination does not prove remote cancellation. Eight slots never started.

There is also a concrete protocol deviation: OpenCode automatically retried the
identical title payload after the first `response.failed`. The frozen transport
treated this as a known terminal response and allowed that auxiliary retry. There
were zero repeated task-runs, but **one auxiliary request retry**, so the full
no-retry requirement is not demonstrated. This limitation was not covered by the
passing non-200 transport fixtures. Runtime, prompts and rubric were not changed
after the first outcome, and neither the paused series nor the failed slot was
resumed. No further model request is authorized by this report.

The [captured patch](patches/quick-lru-take-P.patch) is intentionally empty: source,
tests, types and documentation remained unchanged. Offline grading applies that
empty diff, passes the ordinary suite and fails the fixed public-API contract
because `take` does not exist. Thus Q=false; absence of autonomous completion gives
T=false and D=false. This interrupted P observation cannot support an inference
about model quality or a P/R/H balance. No H investigator ran, so there is no chosen
question, intermediate investigator patch, acceptance decision or integration
benefit to attribute. No such artifact is fabricated for unstarted slots.

## Resources and conclusion

Known usage is 6,242 input + 176 output = **6,418 tokens** for one request. Output
already includes 24 reasoning tokens; cache tokens are zero. Usage for three
requests is unknown, so the campaign total is unknown. The four overlapping request
intervals sum to 11.710 seconds; native execution was 8.490 seconds plus 0.055 seconds
cleanup. Preparation before native execution was 5.219 seconds. Diagnostics,
investigator calls and R attention passes were all zero in the measured slot.

Preparation, developer work, scripted checks and offline evaluator work are
separate from native execution. Their cumulative time was not reliably measured
and is reported as unavailable, not zero. Offline grading made zero provider calls.
No monetary cost is inferred. Historical outcomes and pauses are unchanged.

The dependency fix and installed optional investigator have local evidence. The
intended full comparison remains incomplete due to unknown provider execution;
there is no evidence of a complete-delivery advantage and no basis to promote the
extra mechanism. It remains experimental. No follow-on series is scheduled.
