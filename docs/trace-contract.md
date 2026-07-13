# Trace And Operational Run Contract

The feedback plane implements a machine-local operational run store. It is
runtime evidence for one run, not durable semantic memory and not reusable
template content. Durable semantic lessons still belong to the gated
`global-memory`/`improver` path; repository-specific facts belong in
`WORKFLOW.md` or project-local skills.

This implementation and its package exports belong to the unreleased `0.3.0`
development target. Tagged `v0.2.0` has no feedback-plane package exports.

Real operational artifacts live under the ignored `.oc_harness/` boundary:

```text
.oc_harness/
  runs/<run_id>/
    run.json
    events.jsonl
    context-receipts.jsonl
    verification.json
    outcome.json
    jobs/<task_id>/
      request.json
      status.json
      result.json
  evidence/
```

`.oc_harness/` is excluded by both `.gitignore` and the OpenCode watcher. Never
commit it. Reports and candidate decisions are separate ignored operational
artifacts under `evals/reports/` and `evals/decisions/`.
All real traces are machine-local artifacts.

## Lifecycle And API

The store creates an active run, appends validated events and context receipts,
records bounded delegated-job lifecycle state, writes immutable verification,
and then finalizes an immutable outcome. `status.json` is the deliberately
mutable job lifecycle file; job requests, results, verification, and outcomes
refuse conflicting overwrite. Writes use confined paths, temporary files,
flushes where practical, and atomic publication. Inspection validates stored
artifacts without mutating them.

Job status preserves a nullable `started_at`: it is set when a job enters
`running` and remains unchanged in the terminal status. A job that is blocked
or cancelled before running keeps `started_at: null`. This lets trace assertions
distinguish a real write-scope interval from a queued or never-started job.

Live evaluation uses the same validators through a bounded in-memory store.
The journal is materialized and batch-published only after adapter process-tree
teardown is confirmed; a failed teardown discards the journal without touching
the durable workspace. Direct `trace-run` and public API callers remain trusted
coordinator paths and may use the ordinary disk-backed store immediately.
The temporary materialization is removed before the final durable directory
rename, so cleanup failure cannot masquerade as a failed commit that actually
published a run.

Node ESM consumers use the public package boundary:

```js
import {
  ContractError,
  TRACE_SCHEMA_VERSION,
  createAdapterInstrumentation,
  createTraceStore,
} from "opencode-harness/feedback";
```

`opencode-harness/trace-store` is a compatibility export of the same public
entrypoint. Consumers do not need to import private implementation modules.

The small CLI covers run creation, v2 event emission, and inspection:

```sh
npm run trace -- create --json '{"risk":"standard"}'
npm run trace -- emit --run-id <id> --file event.json
npm run trace -- inspect --run-id <id>
```

`--workspace PATH` selects another workspace. Receipt, job, verification, and
finalization integration uses the public ESM API or the bounded adapter facade.

## Trace Schema Version 2

Writers emit schema version `2`. Every v2 event has all of these fields, using
`null`, empty arrays, or explicit truncation metadata when information is not
available:

- `schema_version`, `event_id`, monotonically increasing `sequence`, `run_id`;
- `task_id`, `parent_task_id`, `agent`, `event_type`, ISO-8601 `timestamp`;
- bounded `summary`, `tool_or_command`, and `permission_decision`;
- relative structured `files_read` and `files_written` summaries;
- structured `evidence_refs` and `verification`;
- `status`, `risk`, and `termination_reason` where applicable;
- causal fields `hypothesis`, `expected_observation`, `actual_observation`,
  `context_snapshot`, `verifier_codes`, and `strategy_id`;
- `finding`, which is `null` except for `review_finding`; a review finding
  carries a safe ID, P0-P3 severity, relative file, line range, and code;
- `truncation`, which records bounding and redaction metadata rather than
  silently pretending evidence is complete.

The v2 event types are `task_start`, `context_read`, `delegation`, `tool_call`,
`permission_request`, `edit`, `review_finding`, `verification`, `task_end`,
`fixture_preparation`, `setup_verification`, `adapter_invocation`,
`adapter_result`, `visible_check`, `hidden_staging`, `hidden_check`, and
`job_lifecycle`. `task_end` requires a termination reason from
[budgets-and-termination.md](budgets-and-termination.md).

`run.json` records optional parent/scenario/profile identifiers, harness
fingerprint, allowlisted model parameters, task class, strategy, risk, start and
completion times, final status, termination reason, lifecycle, and an explicit
`unavailable_metadata` list. Context receipts store an allowlisted
`source_kind`, bounded summary, relative paths, and snapshot fingerprint.

## Version 1 Read Compatibility

Readers accept the documented, exact schema-v1 event shape when it is valid and
safe. They do not reinterpret malformed legacy values, invent v2 causal fields,
or mix v2 appends into a legacy event stream. Legacy paths must still be
relative and confined. New writers always emit version 2.

Bounded non-sensitive local v1 permission and risk labels remain readable;
strict v2 writers still use the current enums.

## Privacy, Redaction, And Bounds

Persisted objects use strict field allowlists. Unknown adapter fields are
rejected rather than copied. Defaults bound strings to 1,000 characters,
summaries to 500, arrays and object keys to 50, and nested objects to depth 4;
artifacts expose truncation metadata.

The store rejects unsafe relative paths and prevents traversal, symlink escape,
Windows reserved-name ambiguity, and writes outside `.oc_harness/`. It redacts
quoted or unquoted secret assignments, authorization bearer values, common
provider-token forms, private-key markers, sensitive markers, and absolute
Windows/POSIX paths. Redaction replaces the whole value and records only a
stable reason in truncation metadata. Traces must not persist secrets, raw prompts, completions,
stdout, stderr, transcripts, raw private logs, full source dumps, `.env`
contents, credentials, tokens, private keys, private memory entries, or
arbitrary adapter returns.

Use compact summaries, structured evidence references, relative file
summaries, and sanitized metadata. Operational memory is deliberately bounded
and disposable; it is not a semantic index or an autonomous learning system.
Per-run limits cover event, receipt, job and active-job counts, per-record
bytes, and total serialized bytes. Finalization requires nonempty internally
consistent verification, no truncated mandatory checks reported as passed,
terminal jobs, and a matching final root `task_end`.

Persistence IDs are portable: Windows device names such as `CON`, `NUL.txt`,
and `COM1`, plus trailing-dot or trailing-space names, are rejected on every
platform. Total-byte accounting includes stale `.tmp` remnants, so interrupted
atomic-write files cannot sit outside the run-store quota.

Physical path validation protects against unsafe input and linked components
present at validation. Supported Node APIs publish by pathname rather than a
portable directory handle, so this is not an OS sandbox against arbitrary
same-user concurrent mutation. Live evaluation closes its untrusted window by
keeping the trace in memory until verified adapter teardown; stronger ambient
same-user protection requires a privilege-separated storage broker.

## Host Adapter Boundary

The package does not claim universal interception of arbitrary OpenCode
sessions. A host adapter or real runtime hook must call the public trace API.
Live evaluation supplies a frozen, validated instrumentation facade to its IPC
adapter process; adapters cannot submit arbitrary stored blobs or override run
IDs, event IDs, sequence numbers, or timestamps. The transport adds request,
queue, payload, cumulative-byte, and terminal-result quotas. Producer-side
checks run before a trace payload or result crosses IPC, and receiver-side
checks remain as defense in depth before the store is called.
Acceptance-eligible live adapters also return the content-derived profile
fingerprint from their bound installed-runtime evidence; profile labels or
paths are not evidence identities.

## Fake Relative-Path Example

This fake event uses only repository-relative paths. Real machine paths do not
belong in examples or committed traces.

```jsonl
{"schema_version":2,"event_id":"event-3","sequence":1,"run_id":"run-demo-001","task_id":"task-root","parent_task_id":null,"agent":"orchestrator","event_type":"task_start","timestamp":"2026-07-10T10:00:00.000Z","summary":"Start bounded local change.","tool_or_command":null,"permission_decision":"not_applicable","files_read":[{"path":"src/app.js","summary":"Relevant module."}],"files_written":[],"evidence_refs":[{"kind":"file","value":"src/app.js"}],"verification":null,"status":"completed","risk":"standard","termination_reason":null,"hypothesis":"A local edit is sufficient.","expected_observation":"Targeted test passes without delegation.","actual_observation":null,"context_snapshot":null,"verifier_codes":[],"strategy_id":"single-agent","finding":null,"truncation":{"summary":{"truncated":false,"original_length":27,"stored_length":27,"redactions":[]},"tool_or_command":{"truncated":false,"original_length":0,"stored_length":0,"redactions":[]},"files_read":{"truncated":false,"original_length":1,"stored_length":1,"items":[{"truncated":false,"original_length":16,"stored_length":16,"redactions":[]}]},"files_written":{"truncated":false,"original_length":0,"stored_length":0,"items":[]},"evidence_refs":{"truncated":false,"original_length":1,"stored_length":1,"items":[{"truncated":false,"original_length":10,"stored_length":10,"redactions":[]}]},"verification":{"truncated":false},"hypothesis":{"truncated":false,"original_length":27,"stored_length":27,"redactions":[]},"expected_observation":{"truncated":false,"original_length":40,"stored_length":40,"redactions":[]},"actual_observation":{"truncated":false,"original_length":0,"stored_length":0,"redactions":[]},"context_snapshot":{"truncated":false},"verifier_codes":{"truncated":false,"original_length":0,"stored_length":0,"items":[]}}}
```
