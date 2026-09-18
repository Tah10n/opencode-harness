# Launcher-only continuation of the original comparison

The user authorized slots **2–9 of the original nine-slot plan**, not a new
campaign or a retry of QuickLRU/P. The original `freeze.json`, pause, request
records, empty patch, Q=false/T=false/D=false and initial accounting remain intact.
Product candidate `9cd8ffb4dfcfd32f1a7a65ac9c3eaca44728d2e7`, installed bundles,
three task texts, dependencies, P/R/H instructions, rubric and order are unchanged.
All remaining slots use OpenCode 1.18.26, Luna/high, 900 seconds per whole task and
180 seconds of shared diagnostics. There are no smokes or replacement attempts.

Only the external launcher changes. Its SSE observer persists provider knowledge
and closes admission before forwarding a retryable event. Bound `response.failed`
and `response.incomplete` remain known statuses; both stop this series. Structured
protocol errors, binding violations and malformed events close admission with a
protocol-error reason; an otherwise unterminated response remains unknown. HTTP
401/403/429 and non-200 handling retain their existing refusal/quota/unknown reasons.
Error codes, partial streams and available usage are preserved. Ordinary text does
not determine admission. Completed steps may proceed and do not certify native
completion. This is not a global retry-policy change in user OpenCode.

Requests already forwarded at closure may retain unknown remote outcomes. Local
abort is not evidence of remote cancellation. Late events never reopen admission.
Every request kind, including title and investigator work, passes the same final
pre-fetch gate. Duplicate-body hashes are not an admission rule.

The existing explicit continuation mechanism now admits only slots 2–9 for this
experiment. It checks the original freeze/pause identities, preserved historical
artifacts and stop facts, absent old container, absence of any remaining-slot run
records, launcher-only changes, and the exact loaded runtime manifests. Results go
to `continuation-2-9`; a pre-existing continuation directory cannot be resumed.
The exact amendment and launcher hashes are recorded in
[continuation-amendment.json](continuation-amendment.json) before provider calls.

Local HTTP/SSE checks cover failed chunks, hanging streams, usage, incomplete,
protocol errors, incorrect IDs, malformed packets, completed then delivery abort,
completed then a new unknown response, concurrent/waiting helpers, normal multiple
steps, non-200 refusals, cancellation, hard deadlines and persisted pause. The
historical SSE is replayed locally, including its protocol `error` before `failed`.
Installed OpenCode is exercised with title generation enabled in the new failed
fixtures. A separate intentional HTTP retry client proves actual upstream counts
when the native client does not retry. The pre-fix fixture sends three requests;
the fixed failed fixture sends one. No local fixture uses a real provider.

The two execution periods must be reported separately. The historical P transport
failure remains a system failure and does not show model weakness or investigator
benefit. This is a development comparison with an execution amendment, not a
confirmatory evaluation of one unchanged environment. The full verifier's existing
`PROCESS_CONTAINMENT_UNAVAILABLE` limitation is not replaced by targeted checks.
