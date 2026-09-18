# Original nine-slot comparison after the launcher amendment

The SSE admission fix is committed as `2a3eb14c`. The product candidate remains
`9cd8ffb4dfcfd32f1a7a65ac9c3eaca44728d2e7`. The [explicit amendment](continuation-amendment.json)
was saved before any continuation provider call. It authorized only original slots
2–9; the original freeze, pause, slot 1 and its accounting were preserved.
See [policy and admission checks](TRANSPORT-AMENDMENT.md).

## Execution result

Only slot 2, QuickLRU/R, started in the amended period. Its title request received
HTTP 200 followed by a structured protocol `error` with `server_is_overloaded`.
The launcher persisted the protocol error and closed admission before client
notification, without waiting for EOF. No bound terminal response had arrived, so
that request's server completion remains **unknown**, rather than being relabeled
as a known `failed`. In the historical replay fixture, a later bound `failed` in
the same received chunk is retained separately from the earlier protocol pause.

One author request had already been forwarded before admission closed. It was
locally aborted with no confirmed remote result. No request was forwarded after
closure; no retry, smoke, replacement task or next slot ran. The native process
exited 137 without normal completion. Local termination, capture, zero active
provider handlers, closed forwarding and container removal are verified. These
facts do not prove remote cancellation.

| Slot | Task | Arm | Period | Q | T | D | Observation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | QuickLRU take | P | Original | false | false | false | Historical overload/unknown execution; empty patch |
| 2 | QuickLRU take | R | Amended | false | false | false | Protocol overload/unknown execution; empty patch |
| 3 | QuickLRU take | H | Amended | — | — | — | Not started |
| 4 | Denque drain | R | Amended | — | — | — | Not started |
| 5 | Denque drain | H | Amended | — | — | — | Not started |
| 6 | Denque drain | P | Amended | — | — | — | Not started |
| 7 | EventEmitter3 emitCollect | H | Amended | — | — | — | Not started |
| 8 | EventEmitter3 emitCollect | P | Amended | — | — | — | Not started |
| 9 | EventEmitter3 emitCollect | R | Amended | — | — | — | Not started |

The new capture matches all 16 original non-dependency project files byte-for-byte
and preserves executable modes. The [R patch](patches/quick-lru-take-R.patch) is
intentionally empty. Offline evaluation against the unchanged rubric passes the
ordinary npm suite and fails the public contract because `take` is absent. Q=false;
no normal native stop gives T=false and D=false. The earlier
[P result](results.json) and [empty P patch](patches/quick-lru-take-P.patch) are unchanged.

No H task started. There is no author-selected investigator question, child work,
accepted test patch or integration outcome to attribute. Neither interrupted
QuickLRU attempt is evidence of model weakness or investigator advantage. Denque
and EventEmitter3 provide no P/R/H observations. The requested substantive
comparison remains incomplete; no lift or practical quality advantage is claimed.
This is a development comparison with an execution amendment, not a confirmatory
assessment of one unchanged environment.

## Validation and resources

[Transport validation](transport-validation.json) records 35 local HTTP/SSE
scenarios, including installed OpenCode 1.18.26, plus 11 continuation-admission
cases, legacy continuation and scheduler regressions. One read-only integration
review found no confirmed defect. The previous launcher allowed three actual
upstream requests in the focused failed/retry/helper fixture; the fixed launcher
allows one. Installed failed fixtures attempted two other native requests, both
blocked; neither was an identical retry. A separate intentional retry client
checks that boundary. No local verification used the real provider.

| Period | Forwarded requests | Known token subtotal | Requests with unknown usage | Native execution | Native cleanup |
| --- | --- | --- | --- | --- | --- |
| Original | 4 | 6,418 | 3 | 8.490 s | 0.055 s |
| Amended | 2 | Unknown | 2 | 2.491 s | 0.057 s |
| Combined | 6 | At least 6,418 | 5 | 10.981 s | 0.112 s |

The original known subtotal is 6,242 input + 176 output, with 24 reasoning tokens
already included in output and zero cached tokens. The full token total is unknown.
Amended pre-native preparation was 4.803 seconds; its two overlapping request
intervals sum to 2.038 seconds. There were zero diagnostic calls, investigator
invocations and R additional passes in the amended attempt. The original auxiliary
retry remains recorded as one; the amended period has none. No task-run was retried.

Developer work, preparation, scripted fixtures/review and offline grading are
separate from native execution; their cumulative wall time was not reliably
measured. Offline grading made zero provider calls. No monetary cost is inferred
from OAuth usage. Machine-readable [combined results](continuation-results.json)
retain all nine assigned rows and the separate periods.

The existing full-verifier `PROCESS_CONTAINMENT_UNAVAILABLE` limitation remains;
targeted checks do not constitute a full CI pass. Both pauses remain saved. No
further continuation or campaign is scheduled.
