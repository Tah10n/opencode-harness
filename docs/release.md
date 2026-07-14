# Release Process

The current development target is unreleased `0.3.0`; the latest tagged
release remains `v0.2.0`. Do not describe the feedback package exports as a
tagged capability until a `v0.3.0` release completes these gates.

## Pre-Release Checks

1. Ensure the worktree is clean or contains only release-intended changes.
2. Run:

   ```sh
   npm run verify
   ```

   For package, fixture, or adoption-boundary changes, the default gate includes
   `npm run verify:adoption-bundle`; it must pass from its isolated temporary
   copy without a live provider.

   The default gate also runs these Milestone 2 model-free checks:

   ```sh
   npm run verify:quality-contracts
   npm run verify:engineering-dossier
   npm run verify:architecture-policy
   npm run verify:impact-graph
   npm run verify:model-profiles
   npm run verify:prompt-inventory
   npm run verify:quality-live-coordinator
   npm run verify:quality-live-manifests
   npm run verify:quality-acceptance
   npm run verify:milestone-2-dod-contract
   ```

   These are deterministic contract and negative-case sensors. They are not
   installed-runtime or model-quality evidence.

3. For installed-profile changes, also run:

   ```sh
   npm run verify:runtime
   ```

   If a candidate decision will be produced, capture one stable candidate
   repository subject, then probe the separate baseline and candidate installed
   runtime roots against that same content attestation:

   ```sh
   CANDIDATE_ROOT="/absolute/path/to/candidate"
   BASELINE_RUNTIME_ROOT="/absolute/path/to/installed-baseline-runtime"
   CANDIDATE_RUNTIME_ROOT="/absolute/path/to/installed-candidate-runtime"
   SUBJECT_STATIC_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<experiment-subject-static>.json"

   cd "$CANDIDATE_ROOT"
   npm run evidence:static -- --candidate-id experiment-subject

   HARNESS_RUNTIME_CWD="$BASELINE_RUNTIME_ROOT" \
   HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_ROOT" \
   npm run verify:runtime -- --evidence-profile baseline-v1 \
     --subject-id experiment-subject \
     --subject-evidence "$SUBJECT_STATIC_JSON"

   HARNESS_RUNTIME_CWD="$CANDIDATE_RUNTIME_ROOT" \
   HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_ROOT" \
   npm run verify:runtime -- --evidence-profile candidate-v1 \
     --subject-id experiment-subject \
     --subject-evidence "$SUBJECT_STATIC_JSON"
   ```

   Use the absolute artifact path printed by each producer. `--subject-id`
   deliberately keeps the shared static subject separate from the two
   `--evidence-profile` labels. Both snapshots bind the same candidate
   repository fingerprint, but their runtime fingerprints come from separate
   installed roots.

   Fixture-backed permission evidence is parser coverage only and is not
   trusted for acceptance. Candidate assessment also requires intact immutable
   report generations; its pair universe comes from the canonical checked-in
   manifests rather than caller overrides.

   Capture every distinct invocation for both sides into one fresh dedicated
   candidate-owned runtime evidence directory:

   ```sh
   HARNESS_RUNTIME_CWD="$BASELINE_RUNTIME_ROOT" \
   HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_ROOT" \
   npm run verify:runtime -- --all-experiment-models --profile-role baseline

   HARNESS_RUNTIME_CWD="$CANDIDATE_RUNTIME_ROOT" \
   HARNESS_EVIDENCE_WORKSPACE="$CANDIDATE_ROOT" \
   npm run verify:runtime -- --all-experiment-models --profile-role candidate
   ```

   A completion marker is published only after all exact baseline/candidate
   model, effort, verbosity, and mode invocations are eligible. Missing,
   unsupported, ignored, alias-only, conflicting, or unparseable options are
   not compatible evidence. Do not enable `temperature`, `max`, API pro mode,
   or persisted reasoning in GPT-5.6 profiles without a separately proven
   installed option surface.

4. Confirm the fixture-backed runtime parser checks are covered by `npm run
   verify`, or run it directly:

   ```sh
   npm run verify:runtime:fixture
   ```

5. Run the read-only semantic release review for minor or major releases:

   ```sh
   /harness-release-review
   ```

   This inferential check reviews guide/sensor coherence, permission safety,
   behaviour-contract coverage, runtime/drift coverage, release/adoption docs,
   and public/private boundaries.

6. For material prompt, orchestration, delegation, review-loop, trace,
   budget/termination, or subagent handoff changes, confirm that
   `docs/trace-contract.md`, `docs/budgets-and-termination.md`,
   `docs/subagent-result-schema.md`, `docs/harness-map.md`,
   `docs/evaluation.md`, `docs/model-profiles.md`, the checked `quality/`
   schemas/manifests, `scripts/verify-harness.mjs`, and
   `scripts/evaluate-harness.mjs` agree. Confirm high/critical instrumented
   implementation cannot precede its passed runner-owned gate and that absent
   project architecture policy stays explicitly `not_configured`. When policy
   is configured, confirm the pre-edit baseline and trusted post-edit candidate
   evaluation are both present; an adapter-authored candidate graph is not
   acceptable evidence.

7. Confirm adversarial fixtures remain static and non-executable, with no real
   `.env`, `.npmrc`, private keys, credentials, tokens, destructive scripts, or
   private logs.

8. For a comparative model-quality claim, optionally run the complete live
   baseline/candidate evaluation when compatible installed profiles, model
   evidence, provider access, and a host adapter are available:

   ```sh
   CANDIDATE_ROOT="/absolute/path/to/candidate"
   BASELINE_PERMISSIONS_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<baseline-permissions>.json"
   CANDIDATE_PERMISSIONS_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<candidate-permissions>.json"
   RUNTIME_EVIDENCE_DIR="$CANDIDATE_ROOT/.oc_harness/evidence/runtime-model-batches"
   ADAPTER_PATH="/absolute/path/to/adapter.mjs"

   cd "$CANDIDATE_ROOT"
   npm run verify:live-eval
   OPENCODE_BASELINE_PROFILE=baseline-profile \
   OPENCODE_HARNESS_PROFILE=candidate-profile \
   OPENCODE_BASELINE_PERMISSION_EVIDENCE="$BASELINE_PERMISSIONS_JSON" \
   OPENCODE_HARNESS_PERMISSION_EVIDENCE="$CANDIDATE_PERMISSIONS_JSON" \
   OPENCODE_MODEL_RUNTIME_EVIDENCE_PATH="$RUNTIME_EVIDENCE_DIR" \
   OPENCODE_LIVE_EVAL_ADAPTER="$ADAPTER_PATH" \
   npm run eval:live
   ```

   Baseline and candidate use separate isolated copies and operational run IDs.
   Hidden checks/assertions remain runner-only. Reports persist sanitized
   status/exit/size metadata, never raw transcripts or command output. Review
   visible and hidden pass rates together with defect escape rate. The
   deterministic infrastructure self-test does not count toward acceptance.
   The twelve Milestone 2 quality scenarios remain allocated six development,
   four held-out, and two critical canaries. Luna is limited to the low-risk
   `quality-small-local-control` evaluation cell and is prohibited for critical
   canaries.

   This no-selector invocation covers all 96 canonical pairs. A selected
   `--suite development` run is development-only incomplete evidence and must
   not support a release or acceptance claim.

   If compatible runtime or adapter state is unavailable, finish the
   deterministic boundary and record the exact external gap. Do not fabricate
   a model run, promote runtime fixtures into behavioural evidence, or claim
   GPT-5.6 superiority. Missing A/B evidence does not block release or change
   the active Sol/Terra configuration.

9. When making a candidate decision, confirm the first-party candidate static
   evidence captured above still fingerprints the stable candidate tree. If the
   tree changed, capture it again:

   ```sh
   CANDIDATE_ROOT="/absolute/path/to/candidate"
   cd "$CANDIDATE_ROOT"
   npm run evidence:static -- --candidate-id candidate-v1
   ```

   Then assess the immutable live report pair with the static and installed
   permission evidence:

   ```sh
   BASELINE_ROOT="/absolute/path/to/baseline"
   CANDIDATE_ROOT="/absolute/path/to/candidate"
   CANDIDATE_STATIC_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<candidate-static>.json"
   BASELINE_PERMISSIONS_JSON="$BASELINE_ROOT/.oc_harness/evidence/<baseline-permissions>.json"
   CANDIDATE_PERMISSIONS_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<candidate-permissions>.json"
   CANDIDATE_REPORT_JSON="$CANDIDATE_ROOT/evals/reports/<report>.json"

   cd "$CANDIDATE_ROOT"
   npm run assess:candidate -- \
     --report "$CANDIDATE_REPORT_JSON" \
     --baseline-id baseline-v1 \
     --candidate-id candidate-v1 \
     --static-evidence "$CANDIDATE_STATIC_JSON" \
     --baseline-permissions "$BASELINE_PERMISSIONS_JSON" \
     --candidate-permissions "$CANDIDATE_PERMISSIONS_JSON"
   ```

   Treat `accepted`, `rejected`, and `inconclusive` as evidence-backed decision
   states. Missing, incomplete, or mismatched mandatory evidence makes the
   whole decision inconclusive, including when another gate failed. Decisions
   are immutable artifacts and are never auto-applied to the active harness.
   Permissions, security controls, hidden checks, and the acceptance policy are
   outside any future proposal loop; rejected candidates never mutate the
   active profile.

   For schema-v2 quality reports, use the immutable report history generation,
   checked 96-pair universe, runtime model evidence, and both installed
   permission snapshots:

   ```sh
   RUNTIME_EVIDENCE_DIR="$CANDIDATE_ROOT/.oc_harness/evidence/runtime-model-batches"
   npm run assess:quality-candidate -- \
     --report "$CANDIDATE_REPORT_JSON" \
     --runtime-evidence "$RUNTIME_EVIDENCE_DIR" \
     --baseline-permission-evidence "$BASELINE_PERMISSIONS_JSON" \
     --candidate-permission-evidence "$CANDIDATE_PERMISSIONS_JSON" \
     --baseline-id baseline-v1 \
     --candidate-id candidate-v1
   ```

10. Optional network drift check before publishing:

   ```sh
   HARNESS_CHECK_LINKS=1 npm run verify:drift
   ```

11. Confirm `.oc_harness/`, `evals/reports/`, and `evals/decisions/` remain
    ignored and no operational artifacts or private data are staged.
12. Confirm GitHub Actions is green after pushing.
13. Confirm the compatibility table is current.
14. Update `CHANGELOG.md`.

## Tagging

Use annotated tags:

```sh
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

## GitHub Release

Create a GitHub Release from the pushed tag and include:

- summary of harness behavior changes;
- verification evidence;
- compatibility notes;
- any manual adoption notes.

## Branch Protection

The `main` branch should require the `Verify` GitHub Actions check, block force
pushes, and require pull requests for non-admin changes.
