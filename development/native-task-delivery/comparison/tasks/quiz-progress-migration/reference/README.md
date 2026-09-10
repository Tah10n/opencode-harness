# quiz-progress-migration

## Supported contract

Implement migrate(value), encode(value), decode(text). v1 progress is {version:1,answered:[unique question ID strings],...extras}; v2 is {version:2,answers:[{id,order}],...extras}. Migrate v1 replaces only answered/version with answers preserving encounter order as zero-based order, retaining all extra JSON data. v1 inputs have no answers field, v2 no answered field; valid v2 answers values/order and extras must be preserved verbatim in value semantics, not renumbered/sorted. Unknown version throws RangeError("version"). Return independent deep copies (JSON-data domain, no special objects); encode is JSON.stringify of migrated value; decode parses JSON then migrates, SyntaxError propagates for invalid text. <=1000 answers, arbitrary JSON extras without cycles. Never mutate input; this is not a general schema validator.

Run `npm test` for the preserved legacy and new project regressions.
