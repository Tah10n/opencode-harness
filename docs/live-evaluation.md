# Live Evaluation

Optional live evaluation measures actual adapter/model/tool behaviour. The
deterministic manifest and infrastructure self-tests run in `npm run verify`,
but an actual live run requires installed profiles, model access, and an
explicit host adapter. Do not fake a model run.

This runner is part of the unreleased `0.3.0` development target, not the
tagged `v0.2.0` package surface.

## Commands And Selection

Validate the versioned scenario and suite corpus without running an agent:

```sh
npm run verify:live-manifests
npm run eval:live:buffered-self-test
npm run verify:live-eval
```

Run actual behavioural evaluation only with an adapter, both profiles, and the
corresponding installed-runtime permission evidence. Run from the candidate
checkout and pass absolute evidence paths from their owning source roots:

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
npm run eval:live -- --suite development
```

Using the same relative `.oc_harness/evidence/...` spelling for two checkouts
does not bind two artifacts: both relative paths resolve from the one current
working directory.

The canonical report roles are `baseline` and `candidate`;
`OPENCODE_HARNESS_PROFILE` remains the compatibility environment name for the
candidate profile. `--suite development|held_out|canary|infrastructure`
selects one suite. Repeat `--scenario <id>` to select known scenario IDs, with
an optional matching `--suite`. Unknown or mismatched selections fail closed.
Without selection, live evaluation runs all behavioural suites and excludes
`infrastructure`.

## Adapter Process Host And Instrumentation Boundary

The configured module runs in a dedicated Node IPC child process and exports:

```js
export async function runScenario(context) {
  // context: scenario, repetition, profileRole, profile, repo, timeout,
  //          profileFingerprint, signal, trace
  await context.trace.emit({
    event_type: "tool_call",
    summary: "Recorded a bounded tool event.",
    status: "completed",
    tool_or_command: "context_read",
  });
  return {
    passed: true,
    profile_fingerprint: context.profileFingerprint,
  };
}
```

The child receives an `AbortSignal`. This legacy live-evaluation adapter path
uses bounded cleanup only: Windows invokes `taskkill`, while POSIX sends
TERM/KILL to a dedicated process group. Neither path is verified containment
for reparented or detached descendants. A timeout, failed cleanup, or stalled
trace request fails closed before hidden data can be staged; it cannot produce
Milestone 2 containment evidence. Trusted project checks use the separate
Windows Job Object or delegated Linux cgroup-v2 boundary described below.
Adapters must return explicit success, such as
`passed: true`, `ok: true`,
`success: true`, `status: "passed"`, or `exitCode: 0`; returning an object alone
is not success. The adapter must also attest the invoked profile with the
content-derived `profile_fingerprint` expected by the runner. Failures,
mismatches, and timeouts are classified honestly.

While an adapter process tree exists, runner and adapter trace operations are
validated into a byte/count-bounded in-memory journal. Nothing under
`.oc_harness/` is created or updated in that window. After teardown is proven,
the trusted coordinator materializes the complete journal in a private staging
tree, validates an exact file manifest, and atomically publishes the finalized
run directory. If teardown is unverified, the journal is discarded and neither
a durable trace nor report history is published; remaining profiles/scenarios
are not started.

`context.trace` is a validated facade for event emission, context receipts,
and job create/transition/complete operations. It accepts strict allowlists and
enforces request-count, queue, per-payload, cumulative-byte, and terminal-result
quotas. The adapter process checks those limits before sending across IPC; the
parent repeats the checks as defense in depth before calling the trace store.
Arbitrary trace blobs and unbounded result envelopes are rejected. Adapter
`context.scenario` contains only allowlisted public fields. `failure_family`,
`workspace_policy`, `expected_contracts`,
`forbidden_regressions`, `hidden_checks`, `hidden_check_files`,
`hidden_trace_assertions`, suite membership,
held-out/canary labels, thresholds, and canary expectations never cross this
boundary.

This adapter is the honest interception boundary. Arbitrary non-evaluation
OpenCode sessions are not traced automatically unless the host provides a real
adapter/runtime hook. If the local OpenCode CLI cannot be automated reliably,
stop at deterministic verification and report the missing integration point.
The IPC process boundary bounds ordinary lifetime and message flow; it is not a
full hostile-code OS sandbox. A deliberately detached process can require a
container or platform job/sandbox boundary. The configured host adapter is
trusted to expose only the isolated `context.repo` and attest the profile it
actually ran.

Setup, visible, and hidden shell checks use the same bounded managed-command
process-tree contract. A phase result is accepted only after its ordinary
descendants are confirmed gone; timeout or teardown uncertainty fails closed.
In particular, hidden staging cannot begin while a visible-check process tree
may still exist.

Node's cross-platform filesystem API does not expose handle-relative
`renameat`/`linkat` publication, so pathname checks alone cannot make a security
claim against an arbitrary concurrent process running as the same OS user.
The implemented boundary removes the adapter process tree before publication.
Protecting against unrelated same-user processes requires privilege-separated
storage/ACLs or an OS sandbox and is outside this machine-local harness.

## Isolation And Hidden Evidence

For every scenario, repetition, and profile role, the runner creates a separate
operational run and a separate isolated repository copy. Baseline and candidate
never share a working copy.

In other words, the runner preserves separate isolated repository copies for
the baseline profile and candidate harness profile.

The runner records task start, fixture preparation, setup, adapter invocation
and classification, visible checks, hidden staging/checks, final verification,
and task end. Early failures leave explicit failed/blocked phase events rather
than silent gaps. Runner-owned hidden files are copied only after explicit
adapter success and verified process-tree teardown, and only to absent,
physically confined targets. Timeouts, adapter failures, or teardown uncertainty
skip hidden staging and mark evidence incomplete. Symlinks, junctions, and
linked ancestors fail closed. Hidden files must not overwrite or merge with
existing files. Hidden shell checks and declarative trace assertions are never
exposed before the run; only their sanitized outcome contributes to hidden pass
rate and defect escape rate.

Hidden targets must be absent before staging and must not overwrite or merge
with existing repository files.

`repo_fixture` must be a relative allowlisted project fixture:
`fixtures/sample-project` or `fixtures/live/<name>`. It must not point at the
repository root, trace/report directories, `.git`, `node_modules`, static
adversarial fixtures, runtime fixtures, or hidden-check directories.
Unsupported fields are rejected.

Every scenario also declares a runner-only `workspace_policy`. `read_only`
permits no adapter change; `allowlist` permits only the listed exact portable
relative paths. The runner fingerprints the ordinary fixture tree immediately
before adapter invocation and compares it again after verified adapter teardown,
before visible checks or hidden staging. Added, modified, or deleted paths
outside the policy fail the run even when the adapter emitted no `edit` event.
Adapter-authored trace events are never proof that the workspace stayed clean.

## Corpus And Suites

`evals/suites.json` is the versioned runner-owned split manifest. Every
behavioural scenario belongs exactly once to `development`, `held_out`, or
`canary`. The deterministic `runner-self-test` belongs only to
`infrastructure`, creates separate baseline/candidate operational runs without
an LLM, and never contributes to candidate acceptance metrics.

The twelve behavioural scenarios cover:

1. small local change without unnecessary delegation;
2. broad audit with bounded context discovery;
3. visible bug test plus a hidden edge case;
4. related-file/call-path test discovery;
5. read-only review with no edits;
6. prompt injection embedded in repository data;
7. fake secret bait that must not be persisted;
8. stale snapshot refresh before verification;
9. conflicting write scopes that must serialize or block;
10. incomplete handoff with bounded redirection/termination;
11. project-local knowledge that must not become global memory;
12. destructive action that remains approval-gated.

## Reports And Privacy

Every evaluation invocation writes a collision-resistant immutable set under
`evals/reports/`:

```text
<timestamp>-<evaluation_run_id>-<collision_id>.json
<timestamp>-<evaluation_run_id>-<collision_id>.md
<timestamp>-<evaluation_run_id>-<collision_id>.complete.json
latest.json
latest.md
latest.complete.json
```

The completion marker binds the evaluation ID, exact JSON/Markdown filenames,
semantic report fingerprint, JSON-text fingerprint, and deterministic Markdown
fingerprint. `latest.*` is a mutable convenience generation, not history; its
marker is written under an exclusive lock and readers fail closed on a split
generation. Failed or timed-out runs
that produced structured evidence still produce an honest report; incomplete
evidence is explicit.

Reports include evaluation/operational run IDs, scenario/repetition/profile,
content and repository fingerprints, adapter classification, visible/hidden
rates, defect escape rate, duration, sanitized model/tool/cost availability,
and incomplete-evidence markers.
Command results contain only stable check ID, status, exit code, and
`stdout_chars`/`stderr_chars` sizes. Reports persist command status/exit
metadata, adapter classification, and allowlisted sanitized model/tool/cost
availability, never raw command
stdout/stderr, transcripts, prompts, completions, secrets, logs, source dumps,
absolute private paths, or arbitrary adapter output.

## Relationship To Acceptance

Live reports are evidence, not an automatic rollout. `npm run assess:candidate`
compares paired baseline/candidate reports under the versioned acceptance
policy and writes a separate immutable decision. Missing, malformed, untrusted,
or incomplete mandatory evidence yields `inconclusive`, even when another gate
has a proven failure. A complete evidence set may be `accepted` or `rejected`.
Static, permission, and live evidence must carry matching content attestations;
labels alone never bind a candidate. Assessment trusts a report only after
strict history inspection of JSON, Markdown, and marker; it derives the
repetition universe and scenario fingerprints from the canonical validated
workspace corpus and fingerprints both into the decision.

Quality acceptance uses a stricter, model-neutral input boundary. A selected
scenario with a validated quality sidecar is still executed by this production
`eval:live` runner, which invokes canonical runner-integrated verification when
constructing the quality receipt. The resulting explicit runner/session
artifact bundle binds the baseline and candidate roles to the same scenario
and verification-target universe and includes validated dossier, integrated
verification, and attested outcome evidence. An individual live report or
self-described quality outcome is not that bundle and is never trusted by
itself; missing, narrowed, forged, or incomplete bundle evidence stays
`inconclusive`.

## Engineering quality boundary

General baseline/candidate profiles evaluate harness regressions; they are not
model promotion roles. Model identity is optional report metadata and is never
an acceptance gate.

The normal-session Engineering Dossier bridge is a separate product path. Its
computational mutation gate applies only when the installed plugin and relevant
pre-tool hooks are runtime-verified. Native Bash is disabled inside an
instrumented quality session; repository commands use catalog-backed trusted
checks. Windows workers use Job Object containment before initialization, while
Linux workers require a delegated writable cgroup v2 and verified hierarchical
`cgroup.events: populated 0` followed by postorder subtree removal. macOS is
explicitly unsupported; any unavailable
production controller fails closed. The live adapter
runner enforces its own isolated workspace policy, hidden checks, teardown, and
report assertions only inside live-evaluation runs. Processes started outside
these application boundaries are not intercepted; neither mode is a host-wide
OS sandbox.
