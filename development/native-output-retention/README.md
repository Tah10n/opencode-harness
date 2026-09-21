# Native output retention (development only)

Preserve native OpenCode spill files before deleting an isolated experimental
container. This is evidence collection, with no change to author context,
provider bodies, nudge, checks, scoring, or product runtime.

Run the small model-free reproduction and installed controls from the repository
worktree (Docker and the existing OpenCode 1.18.26 toolchain must be available):

```sh
node development/native-output-retention/verify.mjs
```

The fixture uses the existing pinned image
`sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`,
`../verified-change-harness/local/template-toolchain-20260908/package/bin/opencode`,
and `local/native-task-integrated/plain-dependencies`. No host authorization is
read or mounted. Docker has no external network, and the in-container loopback
relay receives only locally constructed scripted responses. The tiny synthetic
project exercises the existing scheduler's preflight-shaped manifest; its three
slot labels are compatibility fields, not benchmark arms or model evaluations.
All three execute plain native OpenCode. No historical freeze is read or updated.

## Scope and verification

Only direct ordinary `tool_*` files inside the fresh container's configured
`XDG_DATA_HOME=/work/data` → `/work/data/opencode/tool-output` are eligible.
Container ID, network isolation, tmpfs configuration and each directory component
are checked. Traversal, symlinks, multiply linked files, FIFO, socket, devices and
non-native names are refused. Printed receipt paths do not expand this scope.

Structured `part.data.state.metadata.outputPath` binds files to native
`session_id`, `callID` and part ID. Repeated references share one byte copy and
keep all links. Unreferenced files in this isolated directory are explicitly
`unlinked`; no filename/time heuristic supplies missing call IDs. Missing or
invalid references are errors. Missing metadata still permits the bounded file
export, but leaves overall evidence incomplete. Plain runs without harness task
artifacts are supported.

Each destination uses a SHA-256-derived safe name in a private `native-output`
directory (0700; new files 0600). Copying streams directly to a temporary file;
source size/hash and local size/hash must agree before rename. Export stderr is
separate from bytes. Existing verified output and `model.patch` bytes are never
replaced with different content. Per-attempt manifests preserve export failures;
`manifest.json` describes the latest extraction. Private results remain under
ignored `local/native-output-retention/`.

Bounds: 64 MiB per file, 256 MiB total, 128 entries and 30 seconds for output
export. These leave half the smallest 512 MiB work tmpfs outside output copying;
64 MiB is also the existing relay response cap. The real fixture file is only
353,899 bytes, comfortably above the observed ~51 KiB receipt threshold.
Inventory and copy commands have bounded timeouts, and an over-budget result is
incomplete. Patch/task archive operations retain their existing independent
bounds. No oversized output is silently marked complete.

`archiveComplete` means all bytes of the available native file were verified.
`sourceCompleteness` remains conservatively `unknown`: an exit code by itself
cannot exclude native internal output limits. Native tool state and exit are
recorded separately. The deterministic fixture additionally verifies its known
complete output; an interrupted command's unseen tail is never reconstructed.
Output is native combined tool output, not separately proven stdout and stderr.

Receipts, database records and actual outgoing provider requests remain separate
artifacts. A researcher receiving the complete file does not mean the author saw
it. The installed assertion checks that the hidden middle marker is absent from
the receipt and subsequent request, while present in the exported bytes.

## Stop, capture, delete

The shared scheduler closes forwarding under its existing policy, confirms
workload termination with the existing `stopWorkload`, extracts native accounting,
and independently attempts patch/task and output capture. Accounting or Git
failure cannot skip all output capture. Capture failure uses the existing pause
path, reports `evidence_incomplete`, and prevents the next slot. Provider outcomes
and the first stop reason remain separate facts.

The collector's `requiresOutputRetention` capability protects the source before
execution. `session.close()` deletes only after successful capture; for failed
capture it reuses `stopWorkload`, SIGSTOPs the known relay PID and verifies its
stopped process state. The **container remains running**, with init alive and
its tmpfs retained. Host forwarding is closed; the author is terminated. There
is no background continuation or restart. Close returns 2 for a retained source,
not “cleanup complete”. If workload/relay stop cannot be confirmed, the existing
forced removal remains the safety fallback and possible data loss is recorded.

Only `polybench-pilot/capture.mjs` opts into this contract. The two existing
production-research entry points importing it are `polybench-pilot/run.mjs` and
`preservation-nudge/model-pair/run.mjs`; both use the shared `runComparison`
completion/finally. Their earlier setup failure closes happen before author
execution. Legacy collectors and unrelated runners retain their contracts.

For a retained resource, `session/retained-resource.json` identifies the container
and actual state. After fixing the local destination/copy problem, run:

```sh
node development/native-output-retention/recover.mjs /absolute/path/to/run-result
```

Recovery checks the same container ID and suspended relay, copies existing data
using the same collector, verifies it, and removes that one container. It never
runs OpenCode, tools, or another provider request. It preserves saved patch bytes;
missing accounting is read from the existing database. If identity or extraction
is uncertain it refuses deletion. Keep the Docker daemon running until recovery:
this is a live tmpfs retention state, not durable storage across host restarts.

The historical six missing files remain lost. These logs confer no trusted-check
status, task-completion proof or repair authority.
