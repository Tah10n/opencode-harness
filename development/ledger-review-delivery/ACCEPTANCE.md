# Frozen independent acceptance

Only after the whole A/R/F chain terminates, apply D0 and full M (or captured
partial) to separate clean baseline copies. Run identical procedures for both.
No outcome selects or modifies model stages. No historical patch or evaluation
is mounted into a model container.

1. Verify full patch application and final bytes/executable modes against captured
   delivery. Keep delta and full M distinct. Capture failure is unknown evidence,
   never a synthetic failure of the implementation.
2. Run Node 24 connector readers, config and protocol suites. Attempt the existing
   offline project verify once per delivery; missing pinned dependencies means
   unavailable, not pass. No dependency installation or version change.
3. Preserve raw outcomes of the unchanged six historical probe files (23 tests)
   in plain-ledger-native-high: account-switch-ledger, ledger-lifecycle,
   legacy-input, kimi-migration, migration-contract, cli-persistence. Scores are
   new observations, never a revision of historical scores. Exact diagnostic
   spelling and old-state information absent from 0.4.3 are not Q requirements.
4. Run declared supplemental public-collector scenarios: valid Antigravity and
   OpenCode records beside unsupported records retain valid usage and indicate
   partial; replay of an accepted Claude/Antigravity event through a relocated
   unterminated line retains it exactly once, then a new complete event counts;
   source-bound 0.4.3 migration retains accepted earlier daily usage and new usage;
   conflicting OpenCode tuples retain first tuple, allow unrelated events and
   reach normalizeAdapterDiagnostics; a valid 64-hex Claude provider ID must not
   persist raw. All steps use JSON-roundtripped actual nextState.
5. Inspect each delivered implementation and its actual serialized collector
   state to identify its declared storage bound and validation discriminants.
   Record those exact source locations, limit/selector and rationale before
   executing these two representation-adapted cases. Do not copy another
   implementation's field names or seed a synthetic ledger.
   - Retention: feed bounded batches of distinct, valid events through the public
     collector, roundtripping its returned state, until its actual declared
     bound is reached and exceeded. Record accepted total at every transition.
     Remove input, replay an early accepted event in a new file, then offer a
     fresh event. Accepted totals must never decrease or double-count the old
     event. Saturation may reject new events conservatively with partial data;
     it may not silently erase or reaccept history. No mandatory 65536 limit.
     A 180-second/256-MiB fixture cap is an evaluator resource cap, not a product
     requirement; inability to exercise the real bound is unknown, not pass.
   - Corruption: start with actual accepted state, JSON roundtrip it and corrupt
     an actual validated ledger version/discriminant or accepted numeric tuple
     (negative/non-numeric), recording the exact path and before/after type.
     Delete input and invoke the public collector. It must reject or explicitly
     quarantine corrupt data with partial diagnostics, never silently claim a
     complete empty replacement. If no valid mutation can be established from
     code/state, label the check unknown. Do not invent AR0-shaped state.
6. Trace source/account binding using actual source IDs and state transitions:
   unchanged observation after an account remap cannot be recounted; independent
   sources preserve their own observations. Trace existing OpenCode exact-ID
   cutover, CLI persisted nextState, diagnostic normalization/upload, privacy,
   token components, date ranges, bounded scans/storage and original parser APIs.
   Use public tests plus raw/supplemental evidence and implementation inspection;
   cite the evidence for each contract, including any coverage gap. Do not demand
   unavailable per-ID history from aggregate-only legacy state. Do not expand
   Codex identity discovery, server account dedup, reconnect, releases or versions.

Store delivery_apply, project_checks, assessment_integrity and per-component
contract_results with pass/fail/unknown, evidence and expected contract rationale.
Assertion failures require fixture-validity/contract review before semantic fail.
Evaluator exceptions are unknown unless independently reproduced as code defects.
Q is true only if the entire declared scope is supported, false if a confirmed
violation exists, otherwise unknown. T is true only for the scheduled completed
A/R/F path with verified termination/capture; interrupted is false, uncertain
termination is unknown. D = Q AND T with three-valued logic. Native observer
incomplete is retained independently. New findings outside this frozen procedure
are labelled post-freeze and do not silently alter acceptance.
