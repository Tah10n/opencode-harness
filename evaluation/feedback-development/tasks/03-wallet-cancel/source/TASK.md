# Cancel one persisted wallet reservation

Fix `Wallet.cancel(id)`: cancelling an existing hold must return exactly its reserved cents to available balance, remove only that hold and return true. Cancelling a missing or already cancelled/committed id returns false and does not write or change state. A cancelled id may be reserved again; committed ids remain unavailable for reuse.

The JSON file is the source of truth for every operation. The result must survive reopening Wallet. Preserve deposit validation, insufficient-funds/duplicate rejection without mutation, commit semantics and other holds. The accounting invariant is available + outstanding holds + committed debits = initial balance + deposits. Amounts are positive integer cents; use the existing storage shape and API.

Run `npm test` and `git diff --check` after the final change. Ordinary tests are public and may be extended. Keep their existing contract coverage. Use Node.js 24 and the standard library; no dependency installation is needed.
