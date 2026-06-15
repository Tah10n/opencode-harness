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

6. Optional network drift check before publishing:

   ```sh
   HARNESS_CHECK_LINKS=1 npm run verify:drift
   ```

7. Confirm GitHub Actions is green after pushing.
8. Confirm the compatibility table is current.
9. Update `CHANGELOG.md`.

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
