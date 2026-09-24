## 1. Scope

- Resolved base: `6d0b167b0f21e53e49d711419f50624b40358202`
- HEAD: `6975983dcf1acb5069da45a3cef2427af9e34f12`
- Snapshot SHA-256: `77d139d16c8bf5963da31723580fbffa684195391bd53c385f6436b123473336`
- Task: provided
- `files_changed: []`
- Diagnostic-only review; no worktree changes made.

## 2. Concrete defects

### High — complete records before an unterminated tail are dropped

- **Path/lines:** `packages/connector/lib/adapters/shared.mjs:466-475, 509-512`
- **Trigger:** With an existing non-empty ledger, append `event-2\n` followed by an unterminated `event-3` line.
- **Evidence:** The collector stores complete parsed records in `entries`, but records no observations when a tail exists. The final branch then prefers `ledger.entries` and discards `entries`.
- **Impact:** `event-2` is absent from the result and is not persisted. If the file is truncated, moved, or deleted before the tail completes, accepted usage is permanently lost; new events after an account switch can be missed.
- **Smallest safe fix:** Preserve complete records from the current chunk when a tail exists, preferably by sending only complete records through ledger observation while keeping the tail provisional.

### Medium — duplicate/conflicting appended IDs bypass conflict detection

- **Path/lines:** `packages/connector/lib/adapters/shared.mjs:417-440, 505-514`
- **Trigger:** After collecting an event ID once, append another complete record with the same ID but different token totals.
- **Evidence:** `eventDays` causes the line to be skipped before parsing at line 434, so `observeEventLedger` never compares the conflicting tuple.
- **Impact:** The first tuple is retained without `partial` completeness or `event_usage_conflict` diagnostics, violating the explicit conflicting-tuple contract.
- **Smallest safe fix:** Allow known IDs to reach tuple comparison, then deduplicate only after conflict detection.

### Medium — ledger-capacity overflow can recount unpersisted events

- **Path/lines:** `packages/connector/lib/adapters/shared.mjs:145-164`
- **Trigger:** Fill the ledger to `65,536` entries, then observe a new ID more than once or across subsequent scans.
- **Evidence:** Capacity-limited entries are placed in `unpersisted` but never recorded by identity. Repeated observations are appended repeatedly and merged into totals.
- **Impact:** The bounded-ledger path can count the same event more than once and cannot preserve it if source history is later deleted. It also violates range filtering for overflow observations because `unpersisted` entries bypass the range filter.
- **Smallest safe fix:** Do not emit events that cannot be persisted in the ledger, or implement a bounded retention/eviction scheme with a proven replay boundary. At minimum, deduplicate overflow observations within a pass and filter them by range.

## 3. Unfulfilled explicitly requested obligations

The original task required:

> Run the existing connector tests with Node 24: `node --test packages/connector/test/readers.test.mjs`; `node --test packages/connector/test/config.test.mjs`; `node --test packages/connector/test/protocol.test.mjs`.

The supplied snapshot states: **Checks NOT RUN**. No execution evidence was provided.

## 4. Assumptions and questions

- `packages/connector/lib/adapters/kimi.mjs:37-38` now identifies records only by `(type, time, usageScope)`. Is that tuple guaranteed unique by Kimi? If not, distinct records can be silently coalesced.
- Several adapters check only `eventLedger.version`, while Claude validates the complete ledger. Should malformed version-1 ledgers fail closed consistently?

## 5. Unverified areas and limitations

- Inspected the changed adapter, persistence, sync, server usage-contract, privacy, and focused test sources.
- Tests and repository verification were **NOT RUN**.
- No sandbox/check procedure was supplied.
- Conclusions are bound to the captured snapshot; later edits require a new diagnostic review.

**Decision unblocked:** No; the findings require resolution or explicit risk acceptance.

**Termination reason:** Diagnostic-only review complete; no edits, repairs, retries, or approval verdict issued.