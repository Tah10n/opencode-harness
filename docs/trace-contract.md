# Trace Contract

This document defines the minimal portable trace shape for future OpenCode
agent runs. It is a contract and documentation layer, not a tracing implementation,
and not a runtime dependency.

Local traces are machine-local artifacts. They may be useful during diagnosis,
release review, or live evaluation, but they are not reusable template content.
Example traces may live under `examples/` when they use fake data. Real traces
should not be committed.

## Why Traces Matter

Traces give the harness a compact record of what happened during an agent run:

- auditability for task decisions, delegation, and handoff;
- debugging for failed or partial runs;
- cost and budget review for long tasks;
- permission review for tool and command decisions;
- eval replay for scenario analysis;
- release confidence when prompt, agent, or permission contracts change.

## JSONL Event Shape

Use one JSON object per line. Producers may add extra fields, but consumers
should not require fields outside the contract below.

Required fields:

- `schema_version`: trace schema version, for example `1`.
- `run_id`: stable identifier for one top-level run.
- `task_id`: stable identifier for the task or subtask.
- `parent_task_id`: parent task identifier, or `null` for the root task.
- `agent`: agent name, for example `orchestrator`, `reviewer`, or `verifier`.
- `event_type`: event type from the allowed set.
- `timestamp`: ISO-8601 timestamp with timezone.
- `summary`: compact human-readable event summary.
- `tool_or_command`: tool name, command label, or `null`.
- `permission_decision`: `allowed`, `asked`, `denied`, `not_applicable`, or
  a more specific local value.
- `files_read`: array of paths or path summaries read for this event.
- `files_written`: array of paths written for this event.
- `evidence_refs`: array of file paths, line refs, command IDs, URLs, or trace
  event IDs that support the event.
- `verification`: verification command/result summary, or `null`.
- `token_or_cost_hint`: approximate token, step, time, or cost hint, or `null`.
- `status`: `completed`, `changed`, `no-op`, `no-findings`, `blocked`,
  `failed`, or `unsafe`.
- `termination_reason`: termination reason from
  [docs/budgets-and-termination.md](budgets-and-termination.md), or `null`
  before task end.
- `risk`: `standard`, `high`, `critical`, or a local risk label.

Allowed `event_type` values:

- `task_start`
- `context_read`
- `delegation`
- `tool_call`
- `permission_request`
- `edit`
- `review_finding`
- `verification`
- `task_end`

Termination reasons must align with
[docs/budgets-and-termination.md](budgets-and-termination.md): `done`,
`verified`, `partially_verified`, `blocked_missing_context`,
`blocked_user_decision`, `blocked_permission`, `blocked_external_state`,
`unsafe_without_permission`, `conflicting_write_scope`, `budget_exhausted`,
`verification_failed`, and `not_reproducible`.

## Privacy And Safety

Traces must not persist secrets, raw private logs, credentials, `.env` values,
private memory entries, full source dumps, private keys, tokens, or copied
third-party content that does not belong in the repository.

Use summaries, redacted snippets, stable evidence references, and fake example
data instead of raw sensitive content.

## Example JSONL

```jsonl
{"schema_version":1,"run_id":"run-demo-001","task_id":"task-root","parent_task_id":null,"agent":"orchestrator","event_type":"task_start","timestamp":"2026-06-29T10:00:00Z","summary":"Start static harness contract update.","tool_or_command":null,"permission_decision":"not_applicable","files_read":["C:/work/example/AGENTS.md"],"files_written":[],"evidence_refs":["docs/example-objective.md"],"verification":null,"token_or_cost_hint":"initial","status":"completed","termination_reason":null,"risk":"high"}
{"schema_version":1,"run_id":"run-demo-001","task_id":"task-docs","parent_task_id":"task-root","agent":"general","event_type":"edit","timestamp":"2026-06-29T10:08:00Z","summary":"Added fake trace contract documentation.","tool_or_command":"apply_patch","permission_decision":"allowed","files_read":["docs/harness-map.md"],"files_written":["docs/trace-contract.md"],"evidence_refs":["docs/trace-contract.md"],"verification":null,"token_or_cost_hint":"small","status":"changed","termination_reason":null,"risk":"high"}
{"schema_version":1,"run_id":"run-demo-001","task_id":"task-root","parent_task_id":null,"agent":"orchestrator","event_type":"task_end","timestamp":"2026-06-29T10:20:00Z","summary":"Static contract update verified.","tool_or_command":"npm run verify","permission_decision":"allowed","files_read":[],"files_written":[],"evidence_refs":["command:npm-run-verify"],"verification":"passed","token_or_cost_hint":"final","status":"completed","termination_reason":"verified","risk":"high"}
```
