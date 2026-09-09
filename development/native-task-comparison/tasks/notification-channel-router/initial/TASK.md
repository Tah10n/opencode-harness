# notification-channel-router

Extract planChannels(requested,available,fallback='log') into src/channels.mjs, and have existing createNotifier(handlers,{fallback='log'}={}) from src/notifier.mjs use it. Domain: stable dense arrays<=100 channel-name primitive strings, arbitrary names including __proto__/constructor; available array of names. Planning resolves each requested name to itself if available else fallback, verifies resolved target exists (otherwise RangeError('unknown channel: '+originalName)), deduplicates resolved targets in first-occurrence order. Empty request yields[] even if fallback absent. Pure inputs unchanged. Factory snapshots own enumerable string-keyed handler functions, ignores inherited keys, rejects any nonfunction TypeError('handler'); ordinary data properties only. Later handler object mutation cannot affect notifier. Async notify(message,requested) first completes full plan before any dispatch, then awaits handlers serially with undefined thisArg and exactly one unchanged message argument; returns [{channel,result}] in dispatch order preserving result identity/falsy values. First thrown/rejected value stops unchanged; fallback is for unknown names, never retry/failover after handler error. No ambient/global channel lookup or duplicate plan policy in factory. Preserve prior exports/behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert ordered unknown fallback resolution, deduplication, special keys and absent fallback.
- Assert handler snapshot, serial payload/result identity, plan-before-dispatch and no failover after error.

Update project documentation to explain:
- Document requested/available/fallback policy and empty requests.
- Explain handler snapshot/injection, sequential results and error behavior.

Run npm test after the last source or test change.
