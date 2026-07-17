# Contributing

## Development Flow

1. Keep changes scoped to the harness behavior, documentation, examples, or
   verification scripts.
2. Do not add project-specific workflow facts, private memory entries, local
   machine paths, secrets, or raw logs.
3. Use Node.js 24 or newer and run the local verifier before opening a pull
   request:

   ```sh
   npm run verify
   ```

4. For changes that affect prompt/tool exposure, run the authoritative
   installed-profile inventory gate:

   ```sh
   npm run verify:runtime
   ```

   Individual `opencode debug` commands are diagnostic subsets, not a complete
   permission inventory. Useful spot checks include:

   ```sh
   opencode debug config
   opencode debug agent orchestrator
   opencode debug agent reviewer
   opencode debug agent improver
   ```

5. For containment, receipt, DoD, or release-workflow changes, require the
   `Milestone 2 receipt aggregation` GitHub check. It must depend on successful
   deterministic, Linux, Windows, and macOS producers from the same run.

## Review Expectations

- Review requests are read-only unless fixes are explicitly requested.
- Use the finding-ledger workflow for high/medium findings.
- Keep the global profile project-neutral.
- Prefer mechanical verifier coverage when a rule becomes important enough to
  document.
