# bracket-check-core

Extract inspect(text) to src/brackets.mjs and delegate check(text) in src/check.mjs to it. Preserve bracket stack rules for () [] {}, ignoring all other characters (quotes have no special meaning). First mismatching/unmatched closing bracket reports {ok:false,index:UTF16 offset}; if end reached with openers report earliest remaining opener index, otherwise {ok:true,index:null}. check returns "ok" or "unbalanced at INDEX". Domain arbitrary UTF16 text<=10000 units. No I/O, regex-only balancing or duplicated algorithm in consumer.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- mismatch offset through consumer
- remaining earliest opener and ignored text

Update project documentation to explain:
- Explain pure inspection, ignored text, first closing mismatch vs earliest remaining opener and UTF16 offsets.

Run npm test after the last source or test change.
