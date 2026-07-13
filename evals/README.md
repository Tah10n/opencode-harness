# Feedback Plane Evaluation Artifacts

This directory contains checked-in policies, suite/scenario manifests, public
fixtures references, and runner-owned hidden checks. Generated reports and
decisions are ignored machine-local evidence.

These evaluation artifacts belong to the unreleased `0.3.0` development
target; they are not part of the tagged `v0.2.0` package surface.

## Deterministic Validation

```sh
npm run verify:live-manifests
npm run verify:live-eval
npm run verify:acceptance
```

These commands require no model or installed live adapter. The live-eval
self-test runs only `runner-self-test` from the `infrastructure` suite, creates
separate baseline/candidate operational runs, and does not affect acceptance.

## Suites And Selection

`suites.json` has the strict versioned split:

- `development` — visible iteration scenarios;
- `held_out` — behavioral evidence reserved from the development split;
- `canary` — stable safety and boundary regressions that must remain zero;
- `infrastructure` — deterministic runner self-tests only.

Every behavioral scenario belongs exactly once to the first three suites.
Unknown, duplicate, or missing membership fails validation. Suite membership
is runner metadata and never enters adapter context.

```sh
npm run eval:live -- --suite development
npm run eval:live -- --scenario visible-hidden-edge-bug
```

Default live selection excludes infrastructure.

## Scenario Contract

Every manifest contains exactly:

- `id`, `description`, `risk_tags`, runner-only `failure_family`, and
  runner-only `workspace_policy`;
- relative allowlisted `repo_fixture` and explicit `task`;
- `setup_commands`, `visible_checks`, and at least one `hidden_checks` entry;
- runner-owned `hidden_check_files` and `hidden_trace_assertions`;
- bounded `timeout` and `repetitions`;
- `expected_contracts` and `forbidden_regressions`.

The runner rejects unsupported manifest fields. `repo_fixture` must be a relative allowlisted
project fixture: `fixtures/sample-project` or `fixtures/live/<name>`. It must
not point at the repository root, trace/report directories, `.git`,
`node_modules`, static adversarial fixtures, runtime-debug fixtures, or hidden
directories.

`workspace_policy.mode` is either `read_only` or `allowlist`. Read-only
scenarios permit no adapter mutation. Allowlist scenarios contain 1-50 exact,
portable relative `allowed_paths`; globbing, linked paths, duplicate paths,
Windows device names, and trailing-dot names are rejected. The runner compares
its own pre/post-adapter file manifest and treats any unexpected add, modify, or
delete as failure regardless of adapter trace events.

Hidden sources live under `evals/hidden/<scenario>/`, outside the public
fixture. They are staged only into absent target paths after explicit adapter
success and verified teardown of the adapter child and its ordinary descendant
tree. Timeouts, failures, and uncertain teardown skip staging and remain
incomplete. Physical path checks reject symlinks, junctions, and linked target
ancestors; hidden files must not overwrite or merge with public files.

The declarative hidden assertion language executes no code or regex. It
supports exact `event_exists`/`event_absent` selectors,
`event_count_at_most`, `context_receipt_exists`, `verifier_code_exists`,
`termination_reason_equals`, `no_overlapping_job_write_scopes`, and
`sanitized_value_absent`. Review/audit scenarios additionally require an exact
structured `review_finding_exists` with safe ID, P0-P3 severity, relative file,
line range, and code. Results expose only assertion ID, status, and stable
reason code.

`context_receipt_exists` may require one exact `relative_path`. The weak-handoff
scenario uses this to require both handoff receipts plus exactly one delegation.
Equal-millisecond job boundaries are treated as ambiguous overlap and fail
closed. A non-success adapter termination can satisfy a scenario only when one
runner-owned `termination_reason_equals` assertion requires that exact reason
and passes; an unexpected blocked or failed reason cannot produce a passing
report.

## Live Adapter Boundary

Actual live evaluation requires:

```sh
BASELINE_ROOT="/absolute/path/to/baseline"
CANDIDATE_ROOT="/absolute/path/to/candidate"
BASELINE_PERMISSIONS_JSON="$BASELINE_ROOT/.oc_harness/evidence/baseline-permissions.json"
CANDIDATE_PERMISSIONS_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/candidate-permissions.json"
ADAPTER_PATH="/absolute/path/to/adapter.mjs"

cd "$CANDIDATE_ROOT"
OPENCODE_BASELINE_PROFILE=baseline-profile \
OPENCODE_HARNESS_PROFILE=candidate-profile \
OPENCODE_BASELINE_PERMISSION_EVIDENCE="$BASELINE_PERMISSIONS_JSON" \
OPENCODE_HARNESS_PERMISSION_EVIDENCE="$CANDIDATE_PERMISSIONS_JSON" \
OPENCODE_LIVE_EVAL_ADAPTER="$ADAPTER_PATH" \
npm run eval:live
```

Permission artifacts remain owned by their source checkout. Do not substitute
the same cwd-relative `.oc_harness/evidence/...` path for both roots.

The adapter boundary is intentionally explicit. The harness does not fake a
model run. Adapter `context.scenario` contains only the public task, fixture,
visible checks, timeout, repetitions, description, and risk tags. It excludes
`failure_family`, `workspace_policy`, `expected_contracts`,
`forbidden_regressions`, hidden checks
and assertions, and all suite/canary metadata. Adapters must return an
explicit success signal and the content-derived `profile_fingerprint` of the invoked profile.
The IPC child receives a timeout `AbortSignal` and a trace facade bounded by
request, queue, payload, and cumulative-byte quotas; arbitrary adapter output
is not persisted.

Baseline and candidate run in separate isolated repo copies. Hidden checks and
assertions remain runner-only until adapter execution ends.

## Reports, Decisions, And Privacy

`reports/` stores collision-resistant immutable JSON/Markdown report pairs plus
a `.complete.json` marker that binds the evaluation ID, exact filenames,
semantic report, JSON text, and deterministic Markdown. `latest.json` and
`latest.md` are mutable convenience copies validated by `latest.complete.json`
under an exclusive writer lock. `decisions/` stores immutable candidate decision
JSON/Markdown/marker sets. Both directories are ignored.

Reports persist command status/exit metadata, adapter classification, and
allowlisted sanitized model/tool/cost availability. Check entries contain
status, exit code, and output character counts, never raw command stdout/stderr.
Do not persist transcripts, prompts,
completions, secrets, logs, source dumps, credentials, absolute paths, or
arbitrary adapter fields. Incomplete and unavailable evidence stays explicit.

`acceptance-policy.json` defines non-scalar hard gates. Candidate assessment
returns only `accepted`, `rejected`, or `inconclusive`; any missing mandatory
evidence makes the whole decision inconclusive, even if another gate failed.
Repository, permission, and live profile fingerprints must form one matching
content-attested evidence chain. Reports without a valid JSON/Markdown/marker
attestation are untrusted and force `inconclusive`. Required repetitions and
scenario fingerprints come only from the canonical validated workspace corpus;
both corpus and pair-universe fingerprints are bound into every decision.
