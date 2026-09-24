# quiz-progress-migration

Implement migrate(value), encode(value), decode(text). v1 progress is {version:1,answered:[unique question ID strings],...extras}; v2 is {version:2,answers:[{id,order}],...extras}. Migrate v1 replaces only answered/version with answers preserving encounter order as zero-based order, retaining all extra JSON data. v1 inputs have no answers field, v2 no answered field; valid v2 answers values/order and extras must be preserved verbatim in value semantics, not renumbered/sorted. Unknown version throws RangeError("version"). Return independent deep copies (JSON-data domain, no special objects); encode is JSON.stringify of migrated value; decode parses JSON then migrates, SyntaxError propagates for invalid text. <=1000 answers, arbitrary JSON extras without cycles. Never mutate input; this is not a general schema validator.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- v1 migration through codec keeps extras
- v2 order and deep ownership

Update project documentation to explain:
- Describe v1-to-v2 order mapping, extra-field preservation, unchanged v2 values, deep copies and parse/version errors.

Run npm test after the last source or test change.
