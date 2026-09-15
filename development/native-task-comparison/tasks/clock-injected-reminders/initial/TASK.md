# clock-injected-reminders

Refactor dueReminders into a pure exported selectDue(reminders,now) in src/reminder-core.mjs and the existing src/reminders.mjs wrapper dueReminders(reminders,{clock}?). The wrapper must delegate selection to that core, not keep a second filtering implementation, and read clock exactly once per call including empty lists. Missing/undefined clock uses Date.now at call time. The core never reads ambient time or external state. now/clock result must be a nonnegative safe integer or RangeError; a throwing clock propagates its exact reason. Select enabled reminders with non-null dueAt<=now, inclusive at the boundary, returning a fresh array in input order containing original record identities. Preserve array/records. Domain: dense arrays<=10000, records {id:string,dueAt:null or nonnegative safe integer,enabled:boolean}, frozen arrays/records allowed, ordinary nonmutating clock. No validation of out-of-domain record shapes, timezone conversion, scheduling or persistence. Preserve existing default-time selection behavior; the extraction and single observation are the requested change.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert inclusive due boundary, disabled/null exclusions and preserved identity/order.
- Assert one clock read including empty input and no ambient time use with injected/core calls.

Update project documentation to explain:
- Describe pure core and wrapper delegation with clock defaults.
- Document inclusive selection, clock validation/errors and original record identities.

Run npm test after the last source or test change.
