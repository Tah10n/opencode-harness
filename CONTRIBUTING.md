# Contributing

## Development Flow

1. Keep changes scoped to the harness behavior, documentation, examples, or
   verification scripts.
2. Do not add project-specific workflow facts, private memory entries, local
   machine paths, secrets, or raw logs.
3. Run the local verifier before opening a pull request:

   ```sh
   npm run verify
   ```

4. For changes that affect prompt/tool exposure, also validate the live
   OpenCode surface in a host configuration:

   ```sh
   opencode debug config
   opencode debug agent orchestrator
   opencode debug agent reviewer
   opencode debug agent improver
   ```

## Review Expectations

- Review requests are read-only unless fixes are explicitly requested.
- Use the finding-ledger workflow for high/medium findings.
- Keep the global profile project-neutral.
- Prefer mechanical verifier coverage when a rule becomes important enough to
  document.
