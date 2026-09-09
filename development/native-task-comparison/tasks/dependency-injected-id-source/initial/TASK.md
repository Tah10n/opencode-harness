# dependency-injected-id-source

Refactor createRecord(input,existingIds?) to accept third options argument {nextId}, defaulting on missing/undefined to Node crypto.randomUUID, while retaining the old call forms. Validate input.name first: must be string whose String.trim() result has1..80 UTF-16 units, otherwise TypeError before any allocation or Set mutation. Then invoke nextId exactly once with no arguments and undefined thisArg under normal JavaScript receiver rules. Allocated id must match ASCII [A-Za-z0-9_-]{1,64}, otherwise TypeError. If existingIds already contains it, throw Error code ID_COLLISION; do not retry. Allocator throws propagate exactly. Only after all checks add id to existingIds and return fresh {id,name:trimmedName}. Preserve input, prior Set entries and behavior on errors; same names with distinct IDs are allowed. Existing default UUID behavior remains. Domain: ordinary input own data name, native Set of strings, callable synchronous allocator, ordinary options with optional function, frozen input/options allowed; no getters/proxies/reentrant allocator or extra storage. Do not introduce global allocator mutation, retries, scheduling or ID-service infrastructure.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert invalid names allocate nothing and valid names allocate exactly once.
- Assert collision/invalid ID/allocator failure preserve Set and do not retry.

Update project documentation to explain:
- Document old/new call forms and default UUID source.
- Explain validation-before-allocation, allowed IDs, uniqueness commit and failure behavior.

Run npm test after the last source or test change.
