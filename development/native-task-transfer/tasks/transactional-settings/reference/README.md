# transactional-settings

# Commit synchronous settings transactions atomically
The existing file contains valid JSON {revision: nonnegative integer, data: JSON object}. Retain read(file), which returns parsed state without writing and propagates read/parse errors. Implement transact(file, fn, expectedRevision?) and export ConflictError extending Error.
Read current state. If supplied expectedRevision is not strictly equal to current revision, throw ConflictError before invoking fn and leave bytes unchanged. Invoke fn exactly once with an isolated mutable copy of data. On normal synchronous return, persist {revision: old+1, data: draft} and return {state: that state, result: callback return value}. Changes include nested updates and deletions; a no-op callback still increments revision. No callbacks or concurrent writers run in parallel in this task.
Callback exceptions propagate by identity without touching file bytes. Reject a returned Promise/thenable with TypeError, without committing. Serialization failure must also preserve original bytes. Successful persistence must use a sibling temporary file and rename so readers cannot observe partially written JSON; remove your temporary file after success/failure. Do not mutate any object returned by an earlier read. Returned state is detached from later read results.
Add project tests for conflict not invoking fn, thrown callback preserving exact bytes, and nested update/deletion persisted with incremented revision. Document synchronous-only callback, conflict behavior, and atomic replacement in README.md.

Use the existing Node built-ins and public exports. Keep old project tests and behavior. Do not add dependencies. Run npm test after the last change.
