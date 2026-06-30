# Live Evaluation

Optional live evaluation measures actual agent behaviour. Deterministic
manifest validation and runner self-tests are part of repository verification;
actual live A/B runs are separate because they require model access, installed
OpenCode profiles, isolated repository copies, transcripts, and hidden checks.

## Commands

Validate manifests without running an agent:

```sh
npm run verify:live-eval
```

Run live evaluation only with an adapter:

```sh
OPENCODE_BASELINE_PROFILE=baseline-profile \
OPENCODE_HARNESS_PROFILE=harness-profile \
OPENCODE_LIVE_EVAL_ADAPTER=path/to/adapter.mjs npm run eval:live
```

The adapter must export:

```js
export async function runScenario(context) {
  // context: scenario, repetition, profileRole, profile, repo, timeout, signal
  // context.scenario includes only allowlisted public fields and never
  // hidden_checks, hidden_check_files, or unsupported manifest fields.
  return { passed: true };
}
```

If the local OpenCode CLI cannot be automated reliably, stop at manifest
validation and document the missing integration point. Do not create fake
success results.
Do not fake a model run.
Adapters must return explicit success, such as `true`, `passed: true`,
`ok: true`, `success: true`, `status: "passed"`, or `exitCode: 0`.
The runner enforces `timeout` around adapter execution and passes an
AbortSignal as `context.signal` for cooperative cancellation.

`npm run eval:live` exits nonzero when setup, visible, hidden, or adapter
success checks fail or time out. It still writes the latest report when a live
run produces evidence. Reports store command status/exit metadata and an
allowlisted adapter summary, not raw command stdout/stderr, transcripts, or
arbitrary adapter fields.

## A/B Protocol

Live A/B evaluation should:

- accept a baseline profile and harness profile;
- run the same scenario in separate isolated repository copies, one for the
  baseline profile and one for the harness profile;
- support multiple repetitions;
- hide `hidden_checks`, `hidden_check_files`, and unsupported manifest fields
  from the agent;
- copy `hidden_check_files` into the profile repo only after adapter execution;
- run visible and hidden checks after the agent finishes;
- collect task success, hidden-test pass rate, introduced regressions,
  unresolved defects, build/typecheck/lint results, patch size, duration,
  model/tool metadata when available, and human approvals/interventions;
- record latency and cost as analysis data, not as substitutes for quality;
- compute defect escape rate separately.

## Scenario Manifest

Scenario manifests live in `evals/scenarios/` and are validated by
`scripts/evaluate-live.mjs`.

Required fields:

- `id`;
- `description`;
- `risk_tags`;
- `repo_fixture`;
- `task`;
- `setup_commands`;
- `visible_checks`;
- `hidden_checks`;
- `hidden_check_files` for runner-owned files copied in only after adapter
  execution;
- `timeout`;
- `repetitions`;
- `expected_contracts`;
- `forbidden_regressions`.

Unsupported fields are rejected. Add a new field only after updating the schema,
runner validator, adapter public-field allowlist, and self-tests together.
`hidden_check_files` sources must be checked in outside `repo_fixture`; targets
must stay inside the isolated repo copy.

## Relationship To Other Checks

- `npm run verify` proves deterministic repository contracts only.
- `npm run verify:live-eval` validates scenario manifests and fixture
  path-boundary self-tests without running an agent.
- `npm run verify:runtime` checks the effective installed permission surface.
- `/harness-release-review` is inferential semantic review.
- Live A/B evaluation is behavioural evidence about real model/tool execution.
