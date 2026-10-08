# Fix shared configuration mutation

Diagnose and fix mergeConfig(defaults,overrides). Callers reuse defaults across requests; one merge currently affects later requests. Both inputs must remain untouched, including nested objects and arrays. The returned result must share no mutable objects or arrays with either input.

For plain JSON-shaped objects, recursively merge object members. An override replaces a scalar or array; arrays are cloned rather than merged by index. A null override is a real replacement. Undefined object-member overrides leave the default member unchanged at every nesting level. Preserve untouched default members, new override keys and empty-object behavior. Inputs contain only ordinary JSON-shaped values, plus undefined object members; no Date, class instances, cycles or prototype handling is requested.

Run `npm test` and `git diff --check` after the final change. Ordinary tests are public and may be extended. Keep their existing contract coverage. Use Node.js 24 and the standard library; no dependency installation is needed.
