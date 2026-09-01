# Core versus plain oracle-validated measurement methodology

This measurement estimates the paired change in
`oracle_validated_task_success` for the already-published materialized `core`
profile. It is not a safety certification, promotion authority, new benchmark
epoch, or model-independent evaluation.

## Frozen surfaces

- Product source: `89f1f7f1980a829d7da162fcd737d0c52613225d`.
- Candidate bundle fingerprint:
  `sha256:688ddc642bf694d7ab110915d5a101722b13ba6eeebde1b0788814575e3e8d21`.
- Model binding: `openai/gpt-5.6-luna`, variant `low`.
- Primary data: the existing 60 validation families, balanced 20/20/20 across
  small, medium, and high.
- Real-repository pilot: the exact 29 independent epoch-2 identities, with
  repository counts 8/1/12/8 and strata counts 10/10/9.
- Development sensitivity is excluded before model calls because this bounded
  campaign uses validation primary plus the real-repository pilot.
- One deterministic counterbalanced schedule is frozen independently within
  each dataset and stratum.

The versioned contract is
`research/measurements/core-public-ab-v1/measurement-contract.v1.json`. The
immutable manifest binds its fingerprint, the runner commit and bytes,
published benchmark inputs, candidate, OpenCode executable, runtimes, exact
tasks, pilot controls, schedule, timeout, retry policy, evaluator, statistics,
and call budget before the first model call.

Freeze also executes the exact OpenCode binary under the provider-only
Seatbelt profile with a non-networking `--version` probe. The profile grants
read-only access to the macOS timezone database required by the embedded Bun
runtime. Core trusted checks use an owner-private, content-bound copy of the
measurement Node executable so that Homebrew's group-writable package-store
ancestry cannot invalidate the trusted executable identity. Neither preflight
submits a provider request.

After freeze and its exact-head CI, one unscored full-path acceptance probe is
run for plain and one for core. Each uses the exact OpenCode executable,
configuration, provider-proxy plugin, Seatbelt profile, and core wrapper, but a
deterministic local proxy response makes zero external provider submissions and
zero model calls. A content-bound receipt for both arms is mandatory before the
official campaign can create its first model-process ledger event.

## Metric and safety observability

For both arms, `oracle_validated_task_success` is true only when authentic
terminal completion, no timeout, intact process containment, no surviving
descendants, valid mutation scope, successful syntax verification, at least one
changed allowed path, no hidden-data leakage, and the task-specific hidden
semantic oracle all hold. Core additionally requires an authentic current
passing post-mutation verification receipt. A failed, stale, unavailable, or
unauthentic core verification is a scored candidate failure. Plain has no core
verification gate. The hidden semantic
oracle is applied identically after both arms finish.

The runner does not compute `regression_free_task_success`. The frozen public
controls have `defect_severity: unclassified`, and the 29 pilot identities have
no independent severity oracle. Consequently the report fixes these fields:

- `severe_regression_oracle.status = not_available`;
- `high_medium_critical_regressions.status = not_observable`;
- `high_medium_critical_regressions.count = null`;
- `high_medium_critical_regressions.rate = null`;
- `regression_free_task_success.status = not_computed` with reason
  `no_frozen_independent_severity_oracle`.

Unclassified severity is never converted to no-defect evidence and does not
block the oracle-validated measurement.

## Arm equivalence and isolation

Both arms receive identical task bytes, prompt, model, provider, variant,
OpenCode executable, model-execution timeout, evaluator, attempt environment,
and hidden oracle. The plain arm receives an empty standard configuration. The
core arm receives only the exact materialized core configuration.

Shell, web, delegation, external-directory access, and question tools are
denied in both arms. Provider traffic is mediated by a host-side proxy over one
attempt-private Unix-domain socket. The model sandbox has no TCP, UDP, DNS, or
other Internet egress. OAuth material remains in the host process; the model
receives only a single-use proxy capability, consumed from an owner-private
file and erased before task execution.

Hidden tests, reference repairs, paired-arm output, evaluator results, and
provenance history are never placed in the model-visible workspace. After the
model process group is terminated and verified absent, the model workspace is
copied to a fresh random oracle workspace that was never present in the model
sandbox profile. The original workspace and provider proxy are removed before
hidden controls are staged. The oracle runs without network access.

Before every model process, the runner directly checks that every frozen hidden
path is absent, that no model-visible workspace file has a hidden-control
content hash, and that the visible prompt does not contain hidden-control
bytes. The content-bound preflight fingerprint is retained in the private
outcome receipt and is required for the published zero-leakage guardrail.

## Attempts, resume, and evidence

Every attempt has a content-bound start event and terminal event in a durable
hash-chained append-only ledger. Receipts bind the frozen manifest, pilot
manifest, task, arm, attempt index, and retry predecessor. Reporting recomputes
receipt fingerprints and requires exact agreement with the ledger receipt
hashes. An owner-bound exclusive lease prevents concurrent resume.

There are exactly 178 scored task-arm calls: 120 primary and 58 pilot. At most
18 additional calls are permitted for explicit infrastructure failures with no
scored outcome and an established provider-submission disposition. The hard
maximum is 196. A task-arm can have at most one such retry. Timeouts, bad code,
failed semantic oracles, verification blocks, protocol failures, and already
scored outcomes are not retried. Ambiguous provider submission or an interrupted
response body remains reconciliation-owned. A timeout is still a scored,
non-retryable task failure, but an ambiguous provider disposition is durably
recorded and stops continuation until reconciled.

An HTTP 5xx received after the physical provider submission boundary is a
non-retryable scored model-protocol failure; it is never treated as proof that
the provider rejected the request before execution. Only an explicit 429
rejection or a proven zero-submission host failure is infrastructure-retry
eligible.

Malformed or unobservable candidate child-process receipts are infrastructure
failures rather than task failures. They remain retryable only under the same
bounded disposition and campaign budgets. A scored task-arm outcome may occur
exactly once.

If the host crashes after the content-bound receipt is fsynced but before its
completion event reaches the ledger, exact resume validates the orphan receipt
and appends a recovery completion event without another model call. An orphan
model-process start without a valid receipt remains reconciliation-blocking.

A process signal before any provider submission, with no task mutation and an
established zero-submission disposition, is likewise a proven host
infrastructure failure. The real OpenCode Seatbelt startup probe prevents such
a host incompatibility from being mistaken for a scored model outcome.

Raw stdout, stderr, task workspaces, private controls, credentials, and OAuth
state are not published. Private receipts retain bounded counts, provider
status evidence, and content hashes; the committed attempt-hash ledger binds
the private receipt archive with receipt SHA-256, size, attempt ID, arm, family
ID, and final disposition.

## Scoring, guardrails, and inference

The directly observed operational guardrails are zero containment violations,
zero hidden-data leakage, candidate out-of-scope mutation rate no higher than
plain, timeout-rate delta no greater than +0.05, authentic-terminal-completion
rate delta no lower than -0.05, and an authentic verification receipt for each
scored candidate attempt. Absence of classified defects is not a guardrail.

Primary inference uses only the 60 validation families: paired absolute delta,
candidate-only wins, plain-only wins, ties, exact two-sided McNemar, the frozen
one-sided exact McNemar test in the core-greater direction, and a deterministic
100,000-resample family-level percentile bootstrap. The primary bootstrap seed
is the SHA-256 measurement manifest fingerprint. If the plain rate is zero,
relative lift is `null`. Strata remain descriptive without post-hoc gates.

The 29-task pilot receives separate descriptive paired statistics, CI, and
p-values marked exploratory. It is never pooled with primary inference.

The only result labels are:

- `MODEL-BACKED MEASUREMENT COMPLETE — CORE IMPROVES FROZEN TASK SUCCESS`;
- `MODEL-BACKED MEASUREMENT COMPLETE — NO CLEAR DIFFERENCE`;
- `MODEL-BACKED MEASUREMENT COMPLETE — CORE REGRESSES FROZEN TASK SUCCESS`.

They apply only to the exact frozen model, validation benchmark, product source,
and materialized core. They do not claim production quality or independently
observable HIGH/MEDIUM/CRITICAL regression safety.
