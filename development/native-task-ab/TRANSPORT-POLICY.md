# Experimental upstream admission

`run-comparison.mjs` closes the current experimental series after an unknown
external request outcome. A client's retry, helper/title request or next slot
cannot create a new upstream submission after that closure. This policy does
not change the user's OpenCode configuration or the native sensitivity tool.

## Boundary and retained evidence

The launcher persists `scheduling-paused.json` immediately after receiving a
non-200 status, before waiting for the error body or delivering retryable headers.
503 and other unclassified non-200 responses are `unknown_submission`;
401/403/429 initially close admission as `provider_refusal`. A bounded, complete
quota body may refine that same refusal to `incomplete_quota`. Refinement never
reopens admission or replaces a different earlier pause.

Error capture is bounded to 8 KiB and one second. Metadata preserves the original
HTTP status, upstream request ID, relay request ID, request index, bounded body
as text and original bytes, interruption/truncation flags, and unknown usage.
The original error status and retained body are then delivered before local
shutdown. A later blocked request receives a separate local 409
`experiment_admission_closed`; it is recorded as not forwarded. The original
503 is never rewritten to 200 or an authorization error.

Admission is checked again immediately before the actual upstream `fetch`, after
authentication and body preparation. The check covers pause, local cancellation,
closed forwarding and the task deadline. It applies equally to work and title
requests. Already forwarded requests keep their identities and accounting;
local abort is not evidence of remote cancellation. Unknown execution at a hard
deadline now also pauses subsequent slots. A bound terminal response and its
usage survive a later delivery/AbortError, but do not imply native task success.
Late completions never clear an existing pause. Restart reads the saved pause
and refuses automatic continuation.

There is no body-hash deduplication, new registry, retry configuration, or changed
model/effort/budget. Two identical requests remain allowed when their preceding
outcomes are established and admission remains open.

## Historical retry path

The saved A requests 9 and 10 have identical bytes and SHA-256
`99b48664f5e88a3119b842d6b0650eed1458f4168184b3919872d3649fda25e4`.
Request 9 returned 503 without terminal response or usage. The launcher records
each incoming relay frame separately and performs one fetch per admitted frame.
`container-relay.mjs` forwards each incoming HTTP request once; neither it nor
`container-session.mjs` or the launcher has a retry loop. The outgoing client is
the host Node fetch implementation. No external relay's internal activity is
observable from these artifacts; it cannot explain the second incoming local
request frame.

The installed OpenCode 1.18.26 Linux arm64 binary has SHA-256
`096d32aa9778f98981390a0602c1f8af55ee5f1d6d5c58206f8fb2743c90eafe`.
Its bundled `SessionProcessor` invokes `SessionRetry.policy`; the retry classifier
includes 503 and upstream-reset errors. The bundled LLM stream also exposes an
SDK retry argument. Available historical artifacts do not uniquely identify
which internal OpenCode/SDK retry frame initiated request 10. We therefore locate
the repeat at the installed client process, without claiming an exact internal
initiator or inferring it from timing. The installed fixture observes a second
HTTP request from that process with the same body. It is not a new permitted
author action. The historical replay remains a policy violation.

## Local verification

Run the existing scheduler entry point with `--transport`. It uses real loopback
HTTP servers, fake authorization and the existing prepared bundle/toolchain from
`local/native-sensitivity/usage-20260914/freeze.json`. Containers retain their
network isolation. No real provider or model task is invoked.

```sh
node development/native-task-ab/verify-scheduler.mjs --sensitivity-usage
node development/native-task-ab/verify-scheduler.mjs --h00-transfer
SCHEDULER_TRANSPORT_OUTPUT=local/native-task-ab/transport-check-new \
  node development/native-task-ab/verify-scheduler.mjs --transport
```

Each output directory is new; previous evidence is never overwritten. The local
`results.json` and per-request/capture artifacts retain the assertions' evidence.
The `SCHEDULER_VERIFY_BASELINE=1` variant loads only the historical launcher from
65143259 and is expected to fail: the HTTP upstream receives **2 instead of 1**.
It does not rerun any historical model attempt.

The fixed transport scenarios establish:

| Case | Actual upstream requests | Admission/result |
| --- | ---: | --- |
| 503, delayed/non-ending 503, oversized body | 1 each | retry and helper blocked; next slot absent |
| Installed OpenCode 503 and delayed 503 | 1 each | native same-body retry blocked; partial patch captured |
| 200 in-progress then EOF/disconnect | 1 | unknown result; next slot absent |
| Completed then delivery error | 1 | bound usage retained; native success not inferred |
| Completed followed by a new unknown request | 2 | earlier completion cannot authorize continuation |
| 401 / 403 / 429 | 1 each | refusal / refusal / quota classification preserved |
| Concurrent requests already forwarded | 2 | both remain accounted, no subsequent slot |
| Late completion after another request paused | 2 | completion retained; pause stays closed |
| Pause during auth preparation | 0 | final fetch gate blocks pending dispatch |
| Cancellation before dispatch / in flight | 0 / 1 | no retry; sent unknown request pauses series |
| Identical successful requests | 2 | both allowed; no hash-based prohibition |
| Installed ordinary two-step tasks | 4 across two slots | native tool use and normal stop preserved |
| Installed cancellation / hard deadline | 1 each | partial output and verified local termination; no next slot |

For the installed 503 cases only, fixture cleanup is deliberately delayed five
seconds to let the real OpenCode client attempt its retry. The production stop
path has no such delay. Separate HTTP clients also force a retry and title
request while the 503 body is still pending. Native hard-deadline fixture time
is accelerated to 2.5 seconds; mock-clock checks exercise the unchanged
900-second scheduler deadline. Restart after each paused case admits no slot.

Targeted scheduler/transport checks, changed-source syntax and whitespace pass.
The required `npm run verify` remains unavailable with
`PROCESS_CONTAINMENT_UNAVAILABLE`; no containment assertion or automatic check
is bypassed. This is execution-policy evidence, not evidence of Luna quality.
The old A terminal patch, interrupted B patch, usage and assessments are intact.
