# Repeated URL query values

Extend `withQuery(input,updates)` so an array update replaces all old values for that key with the supplied scalar values in array order; [] deletes the key. Array entries may be strings, finite numbers or booleans; null, undefined, objects and nonfinite numbers in arrays must be rejected. Do not mutate updates or arrays.

Retain scalar behavior: undefined leaves a key alone, null deletes all its values, other scalar values replace a key via String(value). Preserve unrelated repeated keys and their relative order, the path or absolute URL prefix, and the fragment including its exact bytes. Encode query values with URLSearchParams semantics; no bare '?' for an empty query. Relative input URLs are supported. The position of a replaced array key relative to unrelated keys is unspecified; compare key values and unaffected ordering.

Run `npm test` and `git diff --check` after the final change. Ordinary tests are public and may be extended. Keep their existing contract coverage. Use Node.js 24 and the standard library; no dependency installation is needed.
