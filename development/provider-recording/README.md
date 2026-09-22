# Complete provider recording for admitted research runs

`development/native-task-ab/run-comparison.mjs` selects one `research-full-v1`
evidence requirement before starting a slot. Every admitted request has a client
object record, exact upstream body, raw response archive and recording status.
The choice is made by this research entry point, once, independently of
`experimentKind` and tools/title role. No user runtime flag or ordinary-session
recording is added. A new admitted label cannot select only half of the profile.
The existing schedule/budget checks remain, with an explicit rejection of unknown
experiment kinds before the legacy primary-schedule fallback.

Previously, two independent experiment-name lists controlled request and SSE
writes. `assertion-review-pair` was in the first only. The historical runner's
real loopback reproduction received completed SSE and saved requests but no raw
response files. [Safe receipts and all attempts](result.json) preserve this fact.
No historical freeze, pause, stream, model result or expense is rewritten.

## Evidence boundaries

Files remain in each existing private run directory (0700; files 0600):

- `request-N.json`: JSON serialization of the object received from the native
  relay. The relay already parsed HTTP, so these are not original client bytes.
- `upstream-request-N.json`: exact UTF-8 body supplied to fetch, including the
  existing `store:false` transport transformation. No request behavior changes.
- `response-N.sse`: unchanged bytes read from fetch `response.body`, including
  unknown events and original line endings. This is not a network-packet capture.
- `recording-N.json` and `provider-metadata.json`: sizes, SHA-256, EOF/partial/error
  state, run/slot/request/relay/provider IDs, safe status/content type and separate
  terminal/usage facts. Relay-forwarded byte count/hash is distinct from raw
  bytes and is not an acknowledgement from the native client.

Preparation saves the profile, creates both request files and opens the raw file
before fetch. A preparation failure sends nothing upstream. Writes stream through
bounded chunks; data-file IO plus hash verification has a 30-second cumulative
budget per slot, 16 MiB per request body, 64 MiB per response, 256 MiB per slot and
1024 requests. Storage time checks are cooperative between synchronous filesystem
operations, not a guarantee of interrupting a blocked kernel syscall. Small final
status persistence is best effort outside that data-file budget. The original
request/task deadlines and cancellation take precedence over further capture.

Paths come only from host-selected run directories and numeric request indices.
Exclusive creation prevents request overwrite. Directory/file type, link count,
permissions, size and hashes are checked; corruption or limits cannot certify
complete evidence. Authorization, cookies and full headers are not recorded.
The existing private JSON/hash helpers are reused; there is no second native
output collector or general telemetry service.

A failed raw write closes new admission, but the already-received chunk still
reaches the unchanged response observer. A known completed/usage event therefore
survives an incomplete archive. No request is retried for capture. Conversely,
EOF may produce a complete archive while provider state remains unknown.
Non-200 admission closes before reading its body; the existing 8192-byte / one-second
error-body interpretation limit is retained. Raw storage records actual chunks
read, which can be larger than the interpreted prefix. Missing EOF remains explicit.

Provider metadata persistence is atomic and guarded so a disk exception cannot
be misinterpreted by the SSE parser. Failure immediately closes admission. Native
patch/output capture still runs independently; if metadata cannot be retained,
the existing evidence-required cleanup/recovery mechanism protects the source.
A raw write error alone does not invalidate successfully exported other artifacts.

## Local verification

Run with a fresh private output directory; never resume these fixture directories:

```sh
node development/provider-recording/reproduce.mjs local/provider-recording/reproduction-new
node development/provider-recording/verify.mjs local/provider-recording/controls-new
node development/provider-recording/installed.mjs local/provider-recording/installed-new
```

The installed fixture reuses the existing pinned OpenCode 1.18.26, dependencies,
network-none container, native launcher, terminal patch collector and cleanup.
No dependency installation, host OAuth read or real provider request occurs.
It exercises one small numeric/rejection task in the existing two-slot local
schedule, not the ledger scenario. Scripted authors measure transport, not Luna.

Final results: 17 recorder controls, 16 scheduler controls, seven selected real
HTTP lifecycle/refusal scenarios, continuation guards, AR0 prompt/materialization,
ordinary template and separate-review checks pass. The full controller suite,
platform matrix and `pnpm verify` were not rerun or installed for this change.
Syntax, scoped whitespace and final diff review pass. Remote CI is separate.

The final installed execution takes 11.279 seconds across two slots and 14 local
requests (eight author, four parent, two title). Both have exactly one author
implementation stage and zero repair. Terminal patches match external captures,
apply unchanged in ordinary Git copies, and pass both project tests and a separate
public-call/rejection check. Native `node --test` exits 0; its unchanged observer
adapter does not interpret that command form, so workflow status remains
`incomplete`. This is not relabelled as a product-quality success.

After container removal, 19,407 response bytes and 770,660 bytes across the client
and upstream request files remain available. Measured data-file IO/hash work is
86.566 ms total; this excludes some metadata/serialization and is not a measured
net latency difference against an unrecorded run. No monetary cost is inferred.

All attempts, including fixture errors, are counted in `result.json`: 113 actual
loopback HTTP requests (48 installed) plus 39 mock scheduler dispatches; zero real
provider calls. Eight fixture containers were removed after independent artifact
capture. Failed fixture expectations/injections and setup attempts remain recorded.
Developing-agent work is not added to historical Luna usage. Historical AR0/AR1
scores, patches, costs and missing SSE remain unchanged.
