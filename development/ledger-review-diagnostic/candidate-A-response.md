## 1. Scope

- Resolved base: `a45273e659b839f1e98092161e82650d38b351ea`
- HEAD: `1d4c29960067cdcea67fba2522e7406db2355775`
- Snapshot SHA-256: `d97d6a28a8f3fe5ce87b9653fd56822bc1672d80a126d547797ff81987bb1342`
- Task: provided; connector account-switching review.
- `files_changed: []`
- Native diagnostic review only; no implementation or approval decision.

## 2. Concrete defects

### Medium — valid events are dropped whenever a scan also contains unsupported data

- **Evidence:** `packages/connector/lib/adapters/shared.mjs:455-468, 481-493, 523-525`; `packages/connector/lib/adapters/opencode.mjs:94-116`
- **Trigger:** A JSONL/SQLite source contains one malformed or unsupported candidate plus an unrelated valid usage record.
- **Impact:** The valid record is parsed but not added to the ledger. The final result uses `eventLedgerEntries(...)` and ignores the local `entries` accumulator, so the valid usage can be omitted repeatedly. OpenCode explicitly skips ledger acceptance when `unsupported` is true.
- **Smallest safe fix:** Accept valid records into the ledger even when the pass is partial; preserve the partial warning/diagnostic and only withhold unsupported records.

### Medium — unterminated tails can double-count already accepted events

- **Evidence:** `packages/connector/lib/adapters/shared.mjs:476-479, 523-525`; `packages/connector/lib/adapters/claude.mjs:159-163, 222-225`
- **Trigger:** An already accepted event is later observed as an unterminated final line after a file rewrite, truncation, or move.
- **Impact:** The accepted tuple remains in `ledger`, while the same parsed tuple is emitted through `provisionalEntries`/`provisionalMessages`, causing duplicate totals.
- **Smallest safe fix:** Carry provisional records with their hashed identities and suppress any identity already present in `ledger.events` or `ledger.legacyIds`.

### Medium — ledger eviction permits later duplicate accounting

- **Evidence:** `packages/connector/lib/adapters/shared.mjs:154-159`
- **Trigger:** More than `65,536` distinct events are accepted, then an evicted event reappears in copied or restored history.
- **Impact:** Its identity is no longer retained, so it is accepted and counted again. Marking the current pass partial does not preserve the no-duplicate guarantee on later passes.
- **Smallest safe fix:** Do not evict identities while claiming exact deduplication; use a durable overflow/fail-closed state or another exact retention strategy.

## 3. Unfulfilled explicitly requested obligations

- Original requirement: “copying/moving/truncating session files or deleting database history cannot erase accepted usage or count a previously observed event twice.”  
  Not fulfilled by the unterminated-tail path or bounded eviction.
- Original requirement: “Conflicting tuples retain the first accepted tuple, flag partial data and still allow unrelated valid events.”  
  Unrelated valid records are not retained when the same collection also encounters unsupported data.
- Original verification requirement:  
  `node --test packages/connector/test/readers.test.mjs`  
  `node --test packages/connector/test/config.test.mjs`  
  `node --test packages/connector/test/protocol.test.mjs`  
  These checks were not run.

## 4. Assumptions and questions

- Is eviction intentionally allowed to weaken exact duplicate prevention after the ledger limit? That conflicts with the stated contract.
- Should pre-ledger OpenCode `cutoverPending` aliases be treated as accepted identities when their exact usage tuples are unavailable?

## 5. Unverified areas and limitations

- Inspected the supplied diff and relevant adapter, runtime, configuration, and regression-test sources.
- Checks: **NOT RUN**; no test runner or shell execution permitted.
- No runtime reproduction was performed.
- Conclusions are bound to the captured snapshot; the worktree cannot be locked or certified unchanged.
- Residual risk remains in unexecuted paths, persistence integration, and existing test compatibility.

`decision_unblocked: false` — diagnostic findings require disposition.  
Termination reason: **diagnostic-only termination; no approval or implementation performed.**