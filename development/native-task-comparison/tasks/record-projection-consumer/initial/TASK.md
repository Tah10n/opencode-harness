# record-projection-consumer

Implement allowlisted API row projection. lookup(record,path) traverses own properties, returning {found:false} when a path is absent or an intermediate is null/primitive; otherwise {found:true,value}, including explicit null. project(record,fields) returns a flat object with only fields whose paths exist, renamed to field.as; do not include missing fields, apply defaults, or copy unrequested siblings. Present empty string, false, 0, null, empty array/object all remain present. Deep-copy any projected JSON object/array so neither mutating result nor source later affects the other. responseRows(records,fields) projects all records in input order with independent results. Domain: plain own-data JSON records, acyclic dense arrays, finite numbers excluding -0, no undefined, custom methods, getters or symbols. Fields have nonempty ASCII path segments and unique output names, which may include __proto__ or constructor; names must become own enumerable data properties. Array paths may address canonical decimal indices. No requirement on result object prototype. Preserve existing scalar rename behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Missing path omitted while explicit null and false/zero stay present.
- Projected nested values detached from source and other response rows.

Update project documentation to explain:
- Own-path allowlist, flat renames and absent versus null.
- JSON input domain and deep-copy ownership including special output keys.

Run npm test after the last source or test change.
