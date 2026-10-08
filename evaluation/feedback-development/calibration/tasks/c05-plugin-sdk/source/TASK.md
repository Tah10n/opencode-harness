Extend this dual CommonJS/ESM plugin SDK compatibly. Preserve Registry and
createRegistry exports and their identity across src/index.cjs and src/index.mjs;
the ESM default remains the CommonJS exports object. Keep callback plugins and
chainable register(), canonical list() insertion order and unregister() booleans.

register({name,aliases=[],run}) supports aliases. All names must match
^[a-z][a-z0-9-]*$ and run must be a function. aliases must be an array. Invalid
shape throws TypeError; repeated/colliding canonical or alias names throw Error.
Validate the whole registration before storing anything. Copy metadata rather
than retaining the caller's mutable aliases array. list() lists only canonical
names. describe(canonicalOrAlias) returns a detached {name,aliases} or undefined.
unregister(canonicalOrAlias) removes the canonical plugin and all its aliases.
Removed names may be reused; names are case-sensitive.

execute(name,input,callback) keeps the callback form, returning undefined and
calling callback(error) or callback(null,value) once, asynchronously via a
microtask. Omitting callback returns a Promise. A supplied nonfunction callback
throws TypeError. Both forms support (input,done) callback plugins, returned
non-undefined synchronous values and returned Promises. The first callback,
return value, promise settlement or synchronous throw settles the execution;
later callbacks/throws/rejections cannot settle again or cause unhandled
rejection. A synchronous undefined return means a callback is still pending.
Invoke run with this.name equal to its canonical name. Unknown names reject
Error('unknown plugin') or asynchronously call back with that error. Clone input
before invoking and successful output before delivery, so plugin and consumer
mutations cannot affect each other. Preserve zero, false and null as real values.
No dependencies or model-facing helper tools. Run npm test.
