# Release Process

## Pre-Release Checks

1. Ensure the worktree is clean or contains only release-intended changes.
2. Run:

   ```sh
   npm run verify
   ```

3. Confirm GitHub Actions is green after pushing.
4. Confirm the compatibility table is current.
5. Update `CHANGELOG.md`.

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
