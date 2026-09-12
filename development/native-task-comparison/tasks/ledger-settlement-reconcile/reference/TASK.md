# ledger-settlement-reconcile

Integrate ledger validation with per-currency settlement summaries. validateEntries(entries) checks unique entry IDs. An entry with reverses must reference an earlier non-reversal entry, have the same account and currency and delta exactly the negation of the original; each original may be reversed only once. Forward/missing references, duplicate IDs, reversal-of-reversal, mismatched data and double reversals throw TypeError. reconcile(entries) validates the whole sequence, then sums signed deltas by currency/account including reversal entries (which cancel their original). Return currencies in ASCII lexicographic order, each {currency,accounts:[{account,delta}],total,balanced}; accounts sort by ASCII account and retain zero-net accounts. total sums those account deltas, balanced is total===0 per currency; never net different currencies together. Empty ledger returns []. Domain: nonempty ASCII IDs/accounts, three uppercase ASCII currency letters, signed integer delta including zero but excluding -0, safe intermediate sums, dense own-data entry arrays. Invalid references and duplicates are in rejection scope. No input mutation. Preserve simple balanced one-currency settlements.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Valid reversal cancels its account while retaining zero balance, with another currency separate.
- Double reversal rejection.

Update project documentation to explain:
- Earlier original-only reversal references with exact account/currency/negation and one reversal limit.
- Sorted per-currency totals, zero accounts and balance is never cross-currency.

Run npm test after the last source or test change.
