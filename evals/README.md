# Live Evaluation

This directory contains optional live agent-evaluation scenarios. Deterministic
manifest validation and runner self-tests are part of `npm run verify`; actual
live A/B runs stay outside the default gate because they need installed
OpenCode profiles, isolated repository copies, model access, and task
transcripts.

Use deterministic manifest validation first:

```sh
npm run verify:live-eval
```

Run live A/B evaluation only when an adapter for the local OpenCode CLI/profile
is available:

```sh
OPENCODE_LIVE_EVAL_ADAPTER=path/to/adapter.mjs npm run eval:live
```

For real A/B runs, also set:

```sh
OPENCODE_BASELINE_PROFILE=baseline-profile
OPENCODE_HARNESS_PROFILE=harness-profile
```

The adapter boundary is intentionally explicit. The harness does not fake a
model run or expose hidden checks to the agent. Adapter `context.scenario`
includes visible checks, expected contracts, and forbidden regressions, but
`hidden_checks` and `hidden_check_files` stay runner-only.
The runner exposes only allowlisted public scenario fields to adapters and
rejects unsupported manifest fields.
It runs baseline and harness profiles in separate isolated repo copies, passes
`profileRole`, `profile`, `repo`, `timeout`, and `signal` to the adapter, and
stages `hidden_check_files` only after adapter execution.

`npm run eval:live` exits nonzero when setup, visible, hidden, or adapter
success checks fail or time out. Reports are still written when the run
produces evidence.
Adapters must return explicit success, such as `true`, `passed: true`,
`ok: true`, `success: true`, `status: "passed"`, or `exitCode: 0`.
Reports persist command status/exit metadata and an allowlisted adapter
summary, not raw command stdout/stderr, transcripts, or arbitrary adapter
output.

## Scenario Contract

Each scenario manifest includes:

- `id`;
- `description`;
- `risk_tags`;
- `repo_fixture`;
- `task`;
- `setup_commands`;
- `visible_checks`;
- `hidden_checks`;
- `hidden_check_files`;
- `timeout`;
- `repetitions`;
- `expected_contracts`;
- `forbidden_regressions`.

Live reports should capture task success, hidden-test pass rate, introduced
regressions, unresolved defects, build/typecheck/lint results, patch size,
duration, available model/tool metadata, human approvals/interventions, and
defect escape rate.
