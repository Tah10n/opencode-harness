# Six-task diagnostic native pilot

These are new small development packages selected by user-facing purpose before
any model result. They are not extracted scored failures or renamed variants of
collectors, ledger or Cursor. Each task has its own initial sources, ordinary
project tests, complete visible requirement, independent acceptance tests and
reference delivery for preflight. No hidden check or reference is mounted in a
model attempt. The same original project tests are also run against each final
source to measure preservation independently of model test edits.

Selection and fixed order (one pair each, no scored retries):

| Task | Category | User purpose | Order |
|---|---|---|---|
| expense-export | multi-file integration | Filter an expense report by currency consistently through library and CSV CLI | A, B |
| catalog-cache | multi-file integration | Conditional catalog requests shared by HTTP handler and client consumer | B, A |
| bookmark-migration | state preservation/migration | Upgrade saved bookmarks while retaining user metadata and original bytes on invalid input | A, B |
| delivery-outbox | state preservation/migration | Upgrade an outbox and retain failed/unacknowledged deliveries across restart | B, A |
| dual-config | compatibility/consumers | Extend a package option without breaking CommonJS/ESM consumers | A, B |
| lazy-pagination | compatibility/consumers | Add lazy page iteration while preserving eager consumer behavior and cancellation | B, A |

The independent grader checks public behavior and explicit tests/docs delivery.
Native reviewer verdicts and model-written tests do not serve as the grader.
Preflight must show ordinary baseline checks pass, reference acceptance and
preservation pass, and the new requirements discriminate against baseline.
Candidate, source, task, checks, reference, model, variant, order and budget are
frozen before the first of twelve scored task-runs. The B total includes bootstrap,
review, reproduction, repair and final summarization; requests/tokens are counted
separately, never called equal merely because the wall-clock limit matches.

This directory is a bounded pilot corpus, not a new benchmark framework. Execution
will reuse the existing native development container machinery. Six tasks cannot
establish general lift or statistical significance.
