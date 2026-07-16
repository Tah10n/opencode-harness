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

3. For installed-profile changes, also run:

   ```sh
   npm run verify:runtime
   ```

   If a candidate decision will be produced, first capture static evidence by
   verifying the external materialized snapshot in each compared source tree,
   then bind first-party installed permission evidence to those exact artifacts:

   ```sh
   BASELINE_ROOT="/absolute/path/to/baseline"
   CANDIDATE_ROOT="/absolute/path/to/candidate"
   BASELINE_STATIC_JSON="$BASELINE_ROOT/.oc_harness/evidence/<baseline-static>.json"
   CANDIDATE_STATIC_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<candidate-static>.json"

   cd "$BASELINE_ROOT"
   npm run evidence:static -- --candidate-id baseline-v1

   cd "$CANDIDATE_ROOT"
   npm run evidence:static -- --candidate-id candidate-v1

   cd "$BASELINE_ROOT"
   npm run verify:runtime -- --evidence-profile baseline-v1 \
     --subject-evidence "$BASELINE_STATIC_JSON"

   cd "$CANDIDATE_ROOT"
   npm run verify:runtime -- --evidence-profile candidate-v1 \
     --subject-evidence "$CANDIDATE_STATIC_JSON"
   ```

   Use the absolute artifact path printed by each producer. A relative
   `.oc_harness/evidence/...` path resolves against only the current checkout;
   it cannot identify evidence from both source trees.

   Fixture-backed permission evidence is parser coverage only and is not
   trusted for acceptance. Candidate assessment also requires intact immutable
   report generations; its pair universe comes from the canonical checked-in
   manifests rather than caller overrides.

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
   `docs/evaluation.md`, `scripts/verify-harness.mjs`, and
   `scripts/evaluate-harness.mjs` agree.

7. Confirm adversarial fixtures remain static and non-executable, with no real
   `.env`, `.npmrc`, private keys, credentials, tokens, destructive scripts, or
   private logs.

8. For material prompt, orchestration, delegation, review-loop, or
   high-assurance workflow changes, optionally run live baseline/candidate
   evaluation with a fixed scenario suite:

   ```sh
   BASELINE_ROOT="/absolute/path/to/baseline"
   CANDIDATE_ROOT="/absolute/path/to/candidate"
   BASELINE_PERMISSIONS_JSON="$BASELINE_ROOT/.oc_harness/evidence/<baseline-permissions>.json"
   CANDIDATE_PERMISSIONS_JSON="$CANDIDATE_ROOT/.oc_harness/evidence/<candidate-permissions>.json"
   ADAPTER_PATH="/absolute/path/to/adapter.mjs"

   cd "$CANDIDATE_ROOT"
   npm run verify:live-eval
   OPENCODE_BASELINE_PROFILE=baseline-profile \
   OPENCODE_HARNESS_PROFILE=candidate-profile \
   OPENCODE_BASELINE_PERMISSION_EVIDENCE="$BASELINE_PERMISSIONS_JSON" \
   OPENCODE_HARNESS_PERMISSION_EVIDENCE="$CANDIDATE_PERMISSIONS_JSON" \
   OPENCODE_LIVE_EVAL_ADAPTER="$ADAPTER_PATH" \
   npm run eval:live -- --suite development

   # Acceptance input: run the complete canonical development + held_out +
   # canary universe with no suite selector.
   OPENCODE_BASELINE_PROFILE=baseline-profile \
   OPENCODE_HARNESS_PROFILE=candidate-profile \
   OPENCODE_BASELINE_PERMISSION_EVIDENCE="$BASELINE_PERMISSIONS_JSON" \
   OPENCODE_HARNESS_PERMISSION_EVIDENCE="$CANDIDATE_PERMISSIONS_JSON" \
   OPENCODE_LIVE_EVAL_ADAPTER="$ADAPTER_PATH" \
   npm run eval:live
   ```

   The `--suite development` command is only a partial smoke and its report
   must not be passed to `npm run assess:candidate`. Candidate assessment uses
   the report from the selector-free full run, because the acceptance policy
   requires `development`, `held_out`, and `canary`.

   Baseline and candidate use separate isolated copies and operational run IDs.
   Hidden checks/assertions remain runner-only. Reports persist sanitized
   status/exit/size metadata, never raw transcripts or command output. Review
   visible and hidden pass rates together with defect escape rate. The
   deterministic infrastructure self-test does not count toward acceptance.
   Do not block patch releases on live evaluation unless behaviour risk is
   material.

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

## Engineering quality release checks

Before a source release, run:

```powershell
npm run verify
npm run verify:whitespace
```

The first command is the complete model-free deterministic receipt aggregator.
The second prints the local committed-whitespace receipt directly. In CI the
same verifier consumes pull-request base or push before metadata and binds the
exact range and HEAD.

GitHub Actions additionally runs the Windows and Linux production verifiers
through `npm run milestone:2:operational`, uploads their sealed receipt bundles,
and aggregates them with the deterministic bundle through `npm run
milestone:2:assess`. The aggregate is `blocked_external_state`, not `verified`,
when the GitHub-hosted run has no installed host adapter. Do not promote that
bounded blocker into installed-host evidence.

Each producer binds the same portable source attestation and re-observes it
before sealing. The aggregate job first requires `success` from deterministic,
Windows, and Linux producers; diagnostic artifacts from a failed producer are
never accepted as release evidence.

When an installed OpenCode environment is part of the release claim, also run:

```powershell
npm run verify:runtime
npm run probe:runtime:quality-plugin-api
npm run verify:runtime:quality-hooks
```

To include installed-host evidence in a Milestone 2 aggregate, run the last
command with `--adapter <host-owned-adapter> --milestone-out <absolute-json>`
and aggregate that bundle only with artifacts from the same repository HEAD and
run binding. Fixture-contract mode cannot emit a host milestone bundle.

A `failed` runtime hook receipt blocks the claim. An `incomplete` receipt
allows only a partial claim that names the uncovered surface. The current
explicit API probe proves that the installed API can construct the bounded tool
surface and recognizes only the exact expected `ContractError` denial. The
runtime-hook verifier is a separate host-evidence surface. Neither proves every
host callback invocation, effective adopted permissions, exact task-to-child
causality, or pre-dossier risk classification. Native Bash is disabled in an
instrumented quality session; commands use trusted project-catalog checks, with
Windows Job Object containment, delegated Linux cgroup-v2 containment, explicit
macOS unsupported status, and fail-closed behavior whenever the production
controller is unavailable. Logical project toolchain IDs never carry host
paths; non-Node resolvers require the fixed-source
`quality-toolchains.host.v1.json` beside the global wrapper, with disjoint
trusted-code and mutable-state roots. Processes outside the plugin are not
claimed as intercepted. The declared
`permission.ask` callback is reported separately because OpenCode 1.17.20 does
not wire it into the permission service.

Java/Maven/Gradle response files and resolver-owned Maven/Gradle overrides are
rejected. Maven receives sealed user/global settings and toolchains while
automatic writable-user configuration and extensions fail closed. Maven 4
user/project property files fail closed, and its extension/config routing
properties—including installation/project/user settings and toolchains,
settings-security, and local-repository chains—are resolver-owned. Maven project
configuration, every applicable Gradle project/ancestor property file, Gradle
user/installation properties, and installation init scripts are bounded or
distribution-manifest identity-bound through the contained spawn boundary;
writable Gradle user init scripts are unsupported. Toolchain policy v4 and the
receipt bind the complete runtime config inventory plus the configured Node
identity used to start the internal sync worker. The managed worker opens the
trusted cwd after parent-side revalidation; the contained child rechecks that
inherited directory object last and the command does not reopen the cwd path.
Containment setup and
execution use separate deadlines, and execution time starts only after controller
readiness.

General live regression evaluation remains optional:

```powershell
npm run eval:live
npm run assess:candidate -- --help
```

Baseline and candidate are harness profiles, not prescribed models. Do not make
a model comparison or a particular model ID a release requirement. A model-only
frontmatter change needs no generated catalog update, but the active README
table and agent-file list must stay accurate.

Do not publish, tag, push, or create a release from verification alone. Those
remain explicit human-authorized steps.
