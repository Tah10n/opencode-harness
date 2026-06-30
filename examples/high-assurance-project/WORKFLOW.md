# High-Assurance Project Workflow

Use this as a copyable starting point for projects with high/critical changes.
Replace command examples with project-owned commands.

## Verification Commands

Safe local checks:

- Targeted tests: `npm test -- path/to/changed.test.js`
- Affected package tests: `npm --workspace <package> test`
- Full suite: `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Production build: `npm run build`
- Integration/E2E: `npm run test:e2e`
- Race/stress: `npm run test:stress`
- Fuzz/property: `npm run test:property`
- Mutation: `npm run test:mutation`
- Migration: `npm run test:migration`
- Rollback/recovery: `npm run test:recovery`
- Fault injection: `npm run test:faults`

Potentially destructive or high-side-effect checks:

- commands that delete data, reset databases, rewrite migrations, clean working
  trees, publish packages, deploy, or talk to production services.
- run these only when the user and OpenCode permissions explicitly allow them.

## Shared Mutable State

Do not run these in parallel when they share outputs or state:

- commands writing the same build output or cache;
- database, emulator, container, or service-backed tests;
- snapshot/golden updates;
- generated files;
- package metadata or lockfile updates;
- migration and rollback tests.

## High/Critical Order

1. Capture baseline: worktree status/diff, existing failures, targeted checks,
   affected-module checks, typecheck/lint/build/full-suite where available, and
   relevant toolchain versions.
2. Record behavior and compatibility contracts, invariants, edge cases, failure
   modes, test obligations, and specialized verification applicability.
3. For behavior-preserving refactors, create or confirm characterization tests.
4. Implement in explicit slices with non-overlapping write scopes.
5. Run assigned narrow checks per slice.
6. Integrate centrally.
7. Run integrated verification ladder and compare to baseline.
8. Run review ledger loop.
9. Run final adversarial audit for high/critical work.
10. Report verification evidence, unverified areas, residual risks, and
    completion status.

## Permission Note

This workflow describes commands and order. It does not grant permissions.
Allowlists and approval rules belong in OpenCode config.

## Example Safe Allowlist

```json
{
  "permission": {
    "bash": {
      "npm test": "allow",
      "npm test *": "allow",
      "npm run typecheck": "allow",
      "npm run lint": "allow",
      "npm run build": "allow"
    }
  }
}
```
