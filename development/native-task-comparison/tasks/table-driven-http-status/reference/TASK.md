# table-driven-http-status

Refactor scattered status helpers into exported classifyStatus(status) in src/status-core.mjs with one data table for known labels/retry/auth flags. Existing isRetryable, statusLabel and needsAuthRefresh modules must delegate to this classifier, removing parallel status lists/switches. Return fresh {category,label,retryable,refreshAuth}. For integer100..599 categories by hundred are informational,success,redirect,client_error,server_error. Other values (including numeric strings, NaN, fractions, objects) are unknown without coercion or throwing. Unlisted codes within valid ranges retain category but label='Unknown status' and both flags false. Known labels exactly: {"100": "Continue", "103": "Early Hints", "200": "OK", "201": "Created", "204": "No Content", "301": "Moved Permanently", "302": "Found", "304": "Not Modified", "400": "Bad Request", "401": "Unauthorized", "403": "Forbidden", "404": "Not Found", "408": "Request Timeout", "409": "Conflict", "422": "Unprocessable Entity", "425": "Too Early", "429": "Too Many Requests", "500": "Internal Server Error", "502": "Bad Gateway", "503": "Service Unavailable", "504": "Gateway Timeout"}. Retryable only408,425,429,500,502,503,504. refreshAuth only401. No inference that every5xx retries or403 refreshes. Caller mutation of returned objects must not alter later results/table. Domain any primitive or ordinary object status, no patched intrinsics; this is a frozen project classification policy, not automatic synchronization with external HTTP registries. Preserve existing helper signatures and outputs.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert known labels/retry/auth flags through classifier and legacy helpers.
- Assert unlisted5xx, invalid inputs without coercion and returned-object isolation.

Update project documentation to explain:
- Document the fixed project table/flags and range categories.
- Explain unknown/default policy, no broad retry inference, delegation and fresh outputs.

Run npm test after the last source or test change.
