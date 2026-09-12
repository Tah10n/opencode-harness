# Bookmark migration
v1 upgrades in order to b1, b2 IDs; duplicate URLs and metadata remain. v2 IDs are retained. load is read-only; save validates before atomically persisting v2. Invalid data leaves bytes unchanged. Run npm test.
