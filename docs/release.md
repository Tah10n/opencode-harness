# Release Process

## Pre-Release Checks

1. Ensure the worktree is clean or contains only release-intended changes.
2. Run:

   ```sh
   npm run verify
   ```

3. For installed-profile changes, also run:

   ```sh
   npm run verify:runtime
   ```

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
   high-assurance workflow changes, optionally run live A/B evaluation with a
   fixed scenario corpus:

   ```sh
   npm run verify:live-eval
   OPENCODE_BASELINE_PROFILE=baseline-profile \
   OPENCODE_HARNESS_PROFILE=harness-profile \
   OPENCODE_LIVE_EVAL_ADAPTER=path/to/adapter.mjs npm run eval:live
   ```

   Use a baseline profile, candidate harness profile, fixed task corpus,
   hidden checks, transcript/evidence capture, pass/fail rubric, and defect
   escape-rate reporting. Do not block patch releases on live A/B unless the
   behaviour risk is material.

9. Optional network drift check before publishing:

   ```sh
   HARNESS_CHECK_LINKS=1 npm run verify:drift
   ```

10. Confirm GitHub Actions is green after pushing.
11. Confirm the compatibility table is current.
12. Update `CHANGELOG.md`.

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
