# bracket-check-core

## Supported contract

Extract inspect(text) to src/brackets.mjs and delegate check(text) in src/check.mjs to it. Preserve bracket stack rules for () [] {}, ignoring all other characters (quotes have no special meaning). First mismatching/unmatched closing bracket reports {ok:false,index:UTF16 offset}; if end reached with openers report earliest remaining opener index, otherwise {ok:true,index:null}. check returns "ok" or "unbalanced at INDEX". Domain arbitrary UTF16 text<=10000 units. No I/O, regex-only balancing or duplicated algorithm in consumer.

Run `npm test` for the preserved legacy and new project regressions.
