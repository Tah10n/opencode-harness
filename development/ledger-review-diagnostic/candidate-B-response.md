## 1. Scope

- Base: `05064d33f51980d8b4607e0f0f5dc68866341f34`
- HEAD: `892747fc17e42e197e5e0dc0054dbf2105db6b40`
- Snapshot SHA-256: `6d430ded8c1a434792d3831a496d765090709899cc1f7e60a828cca11b9d7fcd`
- Task: provided
- `files_changed: []`
- Diagnostic-only termination; no implementation performed.

## 2. Concrete defects

### HIGH — OpenCode preflight fails open on malformed or incomplete evidence

- **Path/lines:** `packages/connector/lib/opencode-cutover-preflight.mjs:386-405`
- **Trigger:** `config.json` is malformed, or an OpenCode source has a missing/invalid `sourceId` or sequence. Syntax errors return successfully, and invalid sources are filtered out; an empty result returns without blocking.
- **Impact:** Guarded mutators such as `source add/remove` can proceed without proving the required 0.4.4 exact-ID cutover, potentially allowing accepted usage loss or duplication.
- **Smallest safe fix:** Treat unreadable config and any malformed OpenCode source metadata as `opencode_cutover_required`; never return success when cutover evidence is unavailable.

### MEDIUM — Disconnected logical Codex accounts cannot be reactivated

- **Path/lines:** `apps/web/app/api/installations/current/sources/register/route.ts:150-197`
- **Trigger:** A logical Codex source already exists for the installation but has `status = 'disconnected'`, then registration is retried after reconnect/revocation.
- **Impact:** The endpoint returns `source_registration_conflict` instead of restoring the existing mapping. Account switching after reconnect remains stuck in setup-pending and cannot recover the prior logical account.
- **Smallest safe fix:** For a matching disconnected source and physical profile, reactivate and return the existing mapping inside the locked transaction.

### MEDIUM — Legacy event migration does not detect conflicting tuples

- **Path/lines:** `packages/connector/lib/adapters/shared.mjs:126-134, 511-519`
- **Trigger:** A migrated 0.4.3 event identity is observed again with different counters.
- **Impact:** The old event is skipped based only on its date; the first tuple is retained, but collection is not marked partial and `local_event_identity_conflict` is not emitted. The result can falsely report complete data.
- **Smallest safe fix:** Preserve a bounded legacy identity-to-tuple mapping, compare migrated events exactly, and set partial/conflict diagnostics while continuing unrelated events.

## 3. Unfulfilled explicitly requested obligations

- Original requirement: **“Do not ... change package versions.”**
- Evidence: `packages/connector/package.json:3` and `packages/connector/lib/version.mjs:2` change the connector to `0.5.0`.

## 4. Assumptions and questions

- The reconnect defect assumes the existing logical source remains in the database as disconnected, which is established by the revoke path.
- No repair or author continuation was requested or performed.

## 5. Verification and limitations

- Inspected native connector preflight, configuration, adapters, protocol, registration, pairing, and relevant database sources.
- Checks: **NOT RUN**. No supplied test output was available.
- Residual risk remains in the unexecuted connector/web/database integration paths.

`decision_unblocked: false`  
`termination_reason: diagnostic-only review completed; checks and repair were not permitted.`