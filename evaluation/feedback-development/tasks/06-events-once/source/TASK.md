# Once listeners with reentrant emission

Extend Events.on(name,fn,options={}) with `{once:true}`. A once registration must be removed before invoking its callback, so recursively emitting the same event does not invoke it again. Removal must also survive a callback exception. Each registration is independent, even when the same function is registered twice. The unsubscribe closure returns true once while its registration exists and false after removal.

Preserve ordinary listeners without once:true: repeated emits, registration order, argument forwarding and event-name isolation. Emission uses a snapshot: listeners added during an emit wait until a subsequent emit, and a registration removed before its turn is skipped. Callback exceptions still propagate. Do not introduce async scheduling or change the emit return contract.

Run `npm test` and `git diff --check` after the final change. Ordinary tests are public and may be extended. Keep their existing contract coverage. Use Node.js 24 and the standard library; no dependency installation is needed.
