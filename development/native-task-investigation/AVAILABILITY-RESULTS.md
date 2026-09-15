# One availability request; stopped by local admission defect

The single authorized Luna/high request returned **Okay**, a bound
`response.completed`, normal stream EOF and known usage: **18 input + 29 output =
47 tokens**. The 22 reasoning tokens are already included in output; cached tokens
are zero. The request lasted 9.117 seconds. No title or retry request was made.
This was observed provider availability, not an overload or unknown completion.

However, launcher `f16e60a8df804311e296b06104cdacee4b0eedbe` incorrectly looked for
text only in `response.completed.output`. The configured route supplied the completed
assistant message in `response.output_item.done`, with an empty final `output` array.
The launcher therefore recorded `availability_not_confirmed` and stopped before
any task-run. This is a preparation defect in the newly added probe, not a provider
failure. The local scripted fixtures and final diff review missed this response form.
The original probe record and its new pause remain unchanged; this report supplies
the separate evidence-based interpretation.

**No original slot 3–9 ran. The substantive P/R/H comparison remains incomplete.**
The explicit policy prohibits another continuation after a new pause; no pause was
removed, no launcher was restarted and no second probe was sent. There are no new
patches, author-selected investigator questions, child tests or integration outcomes.
No quality advantage can be inferred.

## Preserved nine-slot accounting

| Slot | Task | Arm | Execution period | Q | T | D | Observation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | QuickLRU take | P | Original | false | false | false | Historical overload/unknown execution; empty patch |
| 2 | QuickLRU take | R | First continuation | false | false | false | Historical protocol overload/unknown execution; empty patch |
| 3 | QuickLRU take | H | None; newly admitted range | — | — | — | Not started |
| 4 | Denque drain | R | None; newly admitted range | — | — | — | Not started |
| 5 | Denque drain | H | None; newly admitted range | — | — | — | Not started |
| 6 | Denque drain | P | None; newly admitted range | — | — | — | Not started |
| 7 | EventEmitter3 emitCollect | H | None; newly admitted range | — | — | — | Not started |
| 8 | EventEmitter3 emitCollect | P | None; newly admitted range | — | — | — | Not started |
| 9 | EventEmitter3 emitCollect | R | None; newly admitted range | — | — | — | Not started |

The availability-only third period adds one request and 47 known tokens to the
historical six requests and 6,418 known tokens. Combined: **seven requests, 6,465
known tokens, five requests with unknown usage**. The full total and monetary cost
remain unknown. Historical remote outcomes are not resolved by the new completed
request. Preparation, evaluator and developer work are separate; their cumulative
usage/time was not reliably measured. No new offline patch grading was needed.

## Preparation, verification and limits

The separate amendment authorizes one neutral request and, only after success,
original slots 3–9. Product candidate `9cd8ffb4dfcfd32f1a7a65ac9c3eaca44728d2e7`,
model, effort, tasks, rubric, permissions, budgets and bundles were unchanged.
Checks matched 22,712 source/dependency files, 6,250 bundle files and the frozen
non-launcher files. Both prior pauses and 41 historical evidence files were verified
unchanged again after the probe. The prior task containers/processes were absent.

Final targeted checks: 14 loopback HTTP admission scenarios, including actual
upstream counts, and 11 legacy integration-continuation scenarios passed; syntax
checks and `git diff --check` passed. The successful fixture begins at slot 3;
failed/empty probes start no tasks; historical or already-created runs and new
pauses block re-entry. **These fixtures missed the actual output-item response
shape**, so they do not establish correct real-route text extraction.

The probe process exited 0; its handler ended, stream closed, and active handler
count is zero. No task container was created. The separate full verifier limitation
`PROCESS_CONTAINMENT_UNAVAILABLE` remains; targeted checks are not a full CI pass.
No manual Actions or full platform matrix was run.

[Machine-readable results and validation](availability-results.json) preserve the
admission version and evidence hashes. [Earlier results](CONTINUATION-RESULTS.md),
old patches, freeze and both historical pauses are unchanged. Raw SSE, sessions and
private identifiers stay local. No further campaign or automatic continuation is
scheduled.
