# batch-error-aggregation

Extract reusable collectErrors(value,rules,{firstOnly=false}?) in src/collect.mjs and refactor src/validation.mjs so existing validate(record) and new validateAll(record) both use the same ordered rules and collector, without duplicated field validation. Collector calls each synchronous rule(value) once in order with one argument/undefined thisArg. Null/undefined means pass; every other value (including0,false,'') is an error preserved by identity. Return a fresh error array; firstOnly=true stops immediately after first error, default collects all. Rule throws propagate unchanged and stop further rules. Domain: finite dense rule arrays<=1000, stable callbacks, no input/rule mutation during collection, ordinary boolean options. Record rules in exact order: name required if nonstring or trim-empty, else too_long if trimmed length>40 UTF16; age invalid unless integer18..120; email absent for null/undefined/trim-empty string, required iff newsletter===true, otherwise optional. Present email invalid unless string trimmed matches ASCII [A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+ followed by literal dot and at least2 ASCII letters. Errors are {field:'name'|'age'|'email',code:'required'|'too_long'|'invalid'} as applicable, at most one per field. validate returns first error or null and remains fail-fast; validateAll returns all. Ordinary own-data records, optional newsletter defaults false; do not normalize/mutate input. This is the existing local email grammar, not full RFC validation. Preserve previous priority, fields, codes and accepted records.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert generic error order/identity, falsey errors and first-only short circuit.
- Assert legacy first field error and new full errors with accepted/boundary records unchanged.

Update project documentation to explain:
- Explain collector pass/error values, order, short circuit and thrown errors.
- Document shared record rule order, local grammar and first/all API behavior.

Run npm test after the last source or test change.
