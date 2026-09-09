# conditional-form-errors

Integrate conditional form validation and accessible summary links. valueAt(values,path) traverses own properties only and returns undefined for an absent or non-object intermediate. missing means only undefined, null, or empty string (false and 0 are present). validate(values,rules) walks rules in order. A rule has path (array of key strings), label, optional required, optional minLength, optional when:{path,equals}; skip a rule unless its when value is strictly equal to equals. Emit at most one error per rule: required first for a missing value, else minLength for a present string shorter than the limit. Errors are {path,code,message}; required message is label+" is required", minLength is label+" is too short". errorSummary(errors) keeps only the first error for each identical path array, in encounter order, returning {target,text}; target="field-" plus individually encodeURIComponent-encoded path segments joined by "/", text=message. Domain: acyclic own-data plain JSON records with primitive leaves, no getters/custom methods; nonempty ASCII path keys, minLength only for string-or-missing fields, primitive when.equals, labels are strings. Duplicate paths are allowed across rules. No input mutation. Preserve empty rules and own nested field lookup.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Conditional nested missing field and corresponding encoded summary target.
- False or zero required value is present.

Update project documentation to explain:
- Strict conditional equality, required-before-minLength and missing-value definition.
- Stable first-error-per-path summary with segment-wise URL encoding.

Run npm test after the last source or test change.

String minLength is measured in JavaScript UTF-16 code units (String.length): the single supplementary character "😀" has length 2.
