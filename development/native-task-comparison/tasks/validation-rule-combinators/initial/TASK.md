# validation-rule-combinators

Expose reusable allOf(rules) and anyOf(rules) from src/rules.mjs and refactor existing validateProfile in src/profile.mjs to compose them, retaining existing messages/order. Domain: stable dense arrays<=100 of synchronous rule functions; each returns {ok:boolean,errors:dense array of arbitrary error values}, errors ignored on success; up to 200000 error values in a result or combined final output; nested combinators depth<=100. Rules called left-to-right with one unchanged input and undefined thisArg. allOf stops first failed rule and returns {ok:false,errors:shallow copy of that rule's errors}; if all pass returns {ok:true,errors:[]}, including empty. anyOf stops first success and returns clean {ok:true,errors:[]}; if all fail concatenate their errors in order, including empty=>{ok:false,errors:[]}. Preserve error identities, no mutation of rule/result/input arrays, fresh output records/error arrays per call; exact thrown value propagates immediately. No async coercion. Existing profile domain has primitive string name/email/phone,<=100units: name must be nonempty then<=20 UTF16 units, failure messages 'name required'/'name too long'; contact accepts email matching existing ASCII-space/@ rule /^[^ @]+@[^ @]+$/ or phone /^[0-9]{6,12}$/, else ordered 'email invalid','phone invalid'. Name failures stop before contact. Do not invent new email standards, trimming, or stronger validation; compose shared combinators without separate AND/OR logic.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert AND/OR short-circuit order, nested error identity, empty cases and first thrown value.
- Assert legacy profile name precedence and either-contact success/failure messages.

Update project documentation to explain:
- Document combinator result shape, ordering/copies and empty semantics.
- Explain existing profile composition without expanding validation rules.

Run npm test after the last source or test change.
