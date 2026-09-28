# Historical deadline boundary (read-only reconstruction)

Only nine selected JSON records were restored from the previously verified archive
`local/investigation-inspect-full-task-evidence.tar.gz`. Their hashes were checked
against its saved index. No full project/source/request archive was restored or
revalidated. Original REPORT.md, timing.json, M and child patch remain unchanged.

All historical durations below are **Date.now wall-clock differences**, not
monotonic measurements. This distinction prevents a conclusion about clock steps
or host suspension from arithmetic alone.

| Event | UTC / duration | Source and clock |
| --- | --- | --- |
| Slot preparation starts | 11:42:40.223 | `batch/runs/account-switch-ledger-I1/started.json.at`, wall |
| External native-run starts | 11:42:41.998 | `session/finished.json.completedAt - executionElapsedMs`, computed from wall values |
| Plugin armed / workflow budget | approximately 11:42:43.233 / 3,600 s | `investigation-result.json`: child start + elapsed + remainingTaskMs - configured budget; computed, not a recorded hook timestamp |
| Investigator starts | 11:44:17.778 | `investigation-result.json.startedAt`, wall |
| Investigator finishes | approximately 11:58:56.066 | start + 878,288 ms, computed wall |
| Last request dispatched | 12:18:25.682 | request 130 `provider-metadata.json.forwardedAt`, wall |
| Remaining request allowance | 1,456,316 ms | request 130 `maxDurationMs`, scheduler wall subtraction before send |
| Nominal scheduler/native deadline | approximately 12:42:41.998 | last forwardedAt + allowance; agrees with reconstructed native start + budget |
| Plugin deadline | approximately 12:42:43.233 | child start + elapsed + remainingTaskMs; ~1.235 s later, not 487 s |
| Timer callback actually fires | **not recorded** | no callback-entry wall or monotonic stamp |
| Cancellation requested | **not recorded separately** | deadline flag proves callback eventually ran, not when |
| Abort processed / request catch-finally finishes | 12:50:49.141 | request 130 `finishedAt`; this is **not** a timestamp of the initial abort request |
| Host docker-exec close | 12:50:49.143 | `session/finished.json.completedAt`, wall |
| stopWorkload / runner report | bounded by approximately 12:50:49.194 | runner `cleanupElapsedMs=51`; calculated end, no separate workload-stop start stamp |
| Forwarding closure / capture / removal | exact starts absent; complete by 12:50:49.956 | `stop-verification.json` facts, `completed.json.at`; capture follows runner and handler settlement in source |

The recorded runner duration remains **4,087.196 s**, execution 4,087.145 s,
runner cleanup 0.051 s. The roughly 487 s overrun cannot be relabelled cleanup or
subtracted from historical usage. Request 130 has 43,985 partial response bytes,
HTTP 200, no EOF, no associated terminal response or usage; known requests 1–129
remain known. No later upstream dispatch is present.

| Candidate explanation | What retained evidence permits |
| --- | --- |
| Different starts | ~1.235 s plugin offset is reproducible by arithmetic; cannot explain 487 s |
| Full budget reassigned to child | Current and archived flow inherit the author's budget/start; saved remaining time includes child duration. No evidence of child reset |
| Delayed callback | Possible; no callback-entry timestamp or event-loop delay trace |
| Blocking operation | Synchronous operations exist; aggregate archival IO/hash was 3.109384 s. No interval trace identifies a blocking operation spanning the late period |
| Waiting for close / abort after signal | Possible; old runner waited for close before stopWorkload. No separately recorded signal-send or abort-ack timestamps distinguish this from late callback |
| Host suspension / wall-clock change | Neither established nor excluded: no monotonic paired timestamps, suspend record or clock-adjustment record |
| Measurement error | Arithmetic is consistent with recorded wall values. Their wall/monotonic discrepancy cannot be evaluated retrospectively |

Missing observation: paired wall/monotonic timestamps at timer entry, signal/abort
request, abort handling, host close and in-container workload stop, plus host
suspend/clock evidence. New local reproductions establish defects of the current
launcher, **not the cause of the old 487 s**. Historical Q=false, T=false, D=false,
208/208 project checks, 19/23 behavioral probes, privacy 3/3, invalid-cursor and
decline remain exactly the historical assessment.
