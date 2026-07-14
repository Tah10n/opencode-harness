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
npm run verify:quality-live-manifests
npm run verify:quality-live-coordinator
npm run eval:live:buffered-self-test
npm run verify:live-eval
```

For development-only iteration, run actual behavioural evaluation only with an
adapter, both profiles, and the corresponding installed-runtime permission
evidence. This selected-suite example is incomplete and cannot support a
release or acceptance claim. The complete 96-pair recipe appears below.

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
  //          profileFingerprint, signal, trace, quality
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

The child receives an `AbortSignal`. The parent settles the adapter call only
after ordinary descendants are gone: Windows uses `taskkill /T /F`; POSIX uses
a dedicated process group with TERM/KILL and an absence check. A timeout,
failed tree teardown, or stalled trace request fails closed before hidden data
can be staged. Adapters must return explicit success, such as
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

### Engineering Quality Handshake

Milestone 2 quality scenarios also receive a quota-limited `context.quality`
facade with `createDossier`, `updateDossier`, `finalizeDossier`, `inspect`, and
`authorizeAction`. The adapter proposes dossier content, but the parent runner
owns validation, persistence, workspace observations, architecture evaluation,
gate computation, and the causal gate trace event.

For high/critical scenarios, the runner derives baseline evidence from its own
completed setup checks and derives architect/reviewer challenge receipts only
from terminal traced jobs whose role, result ID, status, and termination reason
match the finalized dossier. Those receipts are sealed and published as
`quality/preimplementation-evidence.json`; adapter-authored result IDs without
matching runner observations cannot satisfy the gate.

For a configured architecture policy, the dossier graph is the pre-edit
baseline. After teardown and workspace reconciliation, a trusted host graph
extractor must return the candidate graph; the runner computes and persists a
separate `post-architecture-evaluation.json`. Adapter-authored graphs cannot
serve as this evidence. Without a trusted extractor the run remains incomplete;
an introduced violation is preserved as failed post-edit evidence. For
high/critical work it also blocks the completion attestation, so the candidate
cannot reach acceptance.

For high and critical scenarios, an edit, write-capable action, implementation
event, or writable delegated job before that trusted passed gate fails closed
and latches the run invalid. Read-only discovery can occur before the gate.
The runner also compares the ordinary workspace to its pre-adapter snapshot;
an untraced mutation cannot be legitimized by a later trace or dossier.

After verified process-tree teardown and integrated verification, the runner
creates a quality attestation that binds the dossier and gate fingerprints,
pre-edit and post-edit architecture evaluations when configured,
gate/edit/verification ordering, workspace fingerprints, model and prompt
profile identities, and operational run. The quality artifacts and finalized
trace publish as one validated run bundle or not at all. Adapter-authored
claims cannot substitute for this attestation.

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

The original Milestone 1 twelve behavioural scenarios cover:

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

Milestone 2 adds twelve non-cosmetic whole-system quality scenarios. Their
suite allocation is fixed and runner-owned:

| Suite | Added scenarios | Purpose |
| --- | --- | --- |
| `development` (6) | `quality-cross-module-invariant`, `quality-public-api-compatibility`, `quality-architecture-boundary`, `quality-concurrency-cancellation`, `quality-parser-boundaries`, `quality-small-local-control` | Iteration on transitive invariants, public contracts, architecture, cancellation, parser edges, and overengineering control |
| `held_out` (4) | `quality-persistence-rollback`, `quality-retry-idempotency`, `quality-stale-cache-version-skew`, `quality-partial-dependency-failure` | Regression protection for persistence, retries, mixed versions, and degraded dependencies |
| `canary` (2) | `quality-resource-lifecycle`, `quality-migration-compatibility` | Critical lifecycle and migration/rollback compatibility protection |

Each quality scenario has a deliberately bad artifact, a good oracle, visible
checks, hidden checks, an explicit workspace allowlist, dossier/gate trace
assertions, expected contracts, and forbidden regressions. The sidecars under
`quality/live-scenarios/` are runner-only. They do not enter adapter context.

The GPT-5.6 experiment maps Sol to primary quality work, Terra to the two
read-heavy held-out discovery/research cells, and Luna only to the
`quality-small-local-control` `standard-lite` development cell. Luna is never
eligible for either critical canary. Suite membership, model role assignment,
and comparison variants are checked deterministically before live execution.

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
Milestone 2 schema-v2 quality results additionally bind the prescribed
comparison ID, exact model-profile and prompt-profile IDs/fingerprints,
installed-runtime model evidence, effective model/effort/verbosity/mode,
permission-snapshot and permission-profile fingerprints, quality attestation,
and structured quality outcomes. A runtime parser fixture or an adapter's
free-form model label cannot satisfy that identity.
Command results contain only stable check ID, status, exit code, and
`stdout_chars`/`stderr_chars` sizes. Reports persist command status/exit
metadata, adapter classification, and allowlisted sanitized model/tool/cost
availability, never raw command
stdout/stderr, transcripts, prompts, completions, secrets, logs, source dumps,
absolute private paths, or arbitrary adapter output.

## Relationship To Acceptance

Live reports are evidence, not an automatic rollout. Legacy reports remain
available to `npm run assess:candidate`; schema-v2 quality reports use
`npm run assess:quality-candidate -- ...` together with the checked model
experiment, one complete dedicated runtime-evidence directory (legacy explicit
files remain readable), and required
`--baseline-permission-evidence`/`--candidate-permission-evidence` snapshots.
The command compares all
prescribed baseline/candidate pairs under the versioned non-scalar acceptance
policy and writes a separate immutable decision. Missing, malformed, untrusted,
or incomplete mandatory evidence yields `inconclusive`, even when another gate
has a proven failure. A complete evidence set may be `accepted` or `rejected`.
Static, permission, and live evidence must carry matching content attestations;
labels alone never bind a candidate. Assessment trusts a report only after
strict history inspection of JSON, Markdown, and marker; it derives the
repetition universe and scenario fingerprints from the canonical validated
workspace corpus and fingerprints both into the decision.

Quality acceptance remains non-scalar: architecture-policy and invariant
violations, dossier or gate gaps, affected-path gaps, edge/failure coverage,
test-quality failures, permission widening, hidden failures, and introduced
regressions are independent hard gates. Cost, duration, and token metrics do
not cancel a quality regression. Missing installed-runtime model evidence or a
missing/mismatched quality attestation makes the comparison inconclusive.

An acceptance decision never edits the active profile. Permissions, security
rules, hidden checks, and the acceptance policy stay outside any future
proposal loop, and a rejected candidate cannot mutate the harness.

## GPT-5.6 External Evidence Boundary

The checked GPT-5.5/GPT-5.6 experiment is a plan, not a fabricated run. Actual
paired evidence requires all of the following external state at the same time:

- installed OpenCode profiles for the exact baseline and candidate role IDs;
- complete installed-runtime model-option evidence for each role under test;
- model/provider access;
- a compatible host adapter that invokes and attests the requested profile;
- isolated repositories and content-bound permission evidence for both sides.

Use the same fresh candidate-owned runtime-evidence directory for capture,
`OPENCODE_MODEL_RUNTIME_EVIDENCE_PATH`, and quality assessment. The producer
publishes baseline/candidate completion markers only after every exact distinct
invocation is complete installed-runtime evidence. The live runner consumes
the individual `*-model-*.json` files; assessment validates the batch arrays,
individual files, and completion markers as one coherent bundle and rejects
symlinks, duplicates, missing files, or unrelated artifacts.

The production/release recipe below evaluates the complete canonical 96-pair
universe. Both permission snapshots bind the same candidate repository static
subject while their effective permission surfaces are captured from separate
installed runtime roots. This keeps the static subject constant across the A/B
comparison without pretending the two runtime profiles are the same.

<!-- complete-quality-evidence-recipe:start -->
```sh
CANDIDATE_REPO="/absolute/path/to/candidate-repository"
BASELINE_RUNTIME_ROOT="/absolute/path/to/installed-baseline-runtime"
CANDIDATE_RUNTIME_ROOT="/absolute/path/to/installed-candidate-runtime"
ADAPTER_PATH="/absolute/path/to/adapter.mjs"

cd "$CANDIDATE_REPO"
npm run evidence:static -- --candidate-id experiment-subject
SUBJECT_STATIC_JSON="$CANDIDATE_REPO/.oc_harness/evidence/<experiment-subject-static>.json"
RUNTIME_EVIDENCE_DIR="$CANDIDATE_REPO/.oc_harness/evidence/runtime-model-batches"
BASELINE_PERMISSIONS_JSON="$CANDIDATE_REPO/.oc_harness/evidence/<baseline-permission>.json"
CANDIDATE_PERMISSIONS_JSON="$CANDIDATE_REPO/.oc_harness/evidence/<candidate-permission>.json"
QUALITY_REPORT_JSON="$CANDIDATE_REPO/evals/reports/<quality-report>.json"

HARNESS_RUNTIME_CWD="$BASELINE_RUNTIME_ROOT" \
HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_REPO" \
npm run verify:runtime -- --evidence-profile baseline-v1 --subject-id experiment-subject --subject-evidence "$SUBJECT_STATIC_JSON"

HARNESS_RUNTIME_CWD="$CANDIDATE_RUNTIME_ROOT" \
HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_REPO" \
npm run verify:runtime -- --evidence-profile candidate-v1 --subject-id experiment-subject --subject-evidence "$SUBJECT_STATIC_JSON"

HARNESS_RUNTIME_CWD="$BASELINE_RUNTIME_ROOT" \
HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_REPO" \
npm run verify:runtime -- --all-experiment-models --profile-role baseline

HARNESS_RUNTIME_CWD="$CANDIDATE_RUNTIME_ROOT" \
HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_REPO" \
npm run verify:runtime -- --all-experiment-models --profile-role candidate

OPENCODE_MODEL_RUNTIME_EVIDENCE_PATH="$RUNTIME_EVIDENCE_DIR" \
OPENCODE_BASELINE_PROFILE=baseline-v1 \
OPENCODE_HARNESS_PROFILE=candidate-v1 \
OPENCODE_BASELINE_PERMISSION_EVIDENCE="$BASELINE_PERMISSIONS_JSON" \
OPENCODE_HARNESS_PERMISSION_EVIDENCE="$CANDIDATE_PERMISSIONS_JSON" \
OPENCODE_LIVE_EVAL_ADAPTER="$ADAPTER_PATH" \
npm run eval:live

npm run assess:quality-candidate -- \
  --report "$QUALITY_REPORT_JSON" \
  --runtime-evidence "$RUNTIME_EVIDENCE_DIR" \
  --baseline-permission-evidence "$BASELINE_PERMISSIONS_JSON" \
  --candidate-permission-evidence "$CANDIDATE_PERMISSIONS_JSON" \
  --baseline-id baseline-v1 \
  --candidate-id candidate-v1
```
<!-- complete-quality-evidence-recipe:end -->

`npm run eval:live -- --suite development` is useful only for incomplete local
iteration. It does not cover the 96-pair universe and cannot support a release,
rollout, or accepted quality claim. Omit `--suite` for complete evidence.

When any of those inputs is unavailable, complete the deterministic checks and
report the live portion as unavailable/partially verified. Do not turn runtime
fixtures, config parsing, or the infrastructure self-test into behavioural
evidence. See [model-profiles.md](model-profiles.md) for the profile matrix and
runtime probe.
