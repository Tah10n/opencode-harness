# draft-three-way-merge

Implement mergeDraft(base,local,remote) for top-level draft fields. Treat each nested field value atomically; do not recursively combine nested objects. Structural equality ignores record key order, preserves array order, and distinguishes absence from explicit null. For each field in the union: if local equals remote choose that state; else if local equals base choose remote; else if remote equals base choose local; otherwise report a conflict and omit that field from merged. Chosen absent states delete/omit the field. Return {merged,conflicts}; conflicts are sorted by ASCII field key and each is {key,base,local,remote}, where each state is {present:false} or {present:true,value}. Construct merged fields in ASCII-sorted key order subject to normal JavaScript integer-key enumeration. Deep-copy all emitted values, including conflict states. Domain: ordinary Object.prototype records with arbitrary ASCII keys and ordinary acyclic JSON values/dense arrays; no custom methods, getters, symbols, undefined, nonfinite numbers or -0. Do not mutate inputs. Preserve identical drafts and unchanged-field propagation.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Independent field edits merge while a one-sided deletion is retained.
- Delete versus explicit null conflict with presence-aware states.

Update project documentation to explain:
- Top-level atomic three-way resolution and structural equality rules.
- Conflicting field omitted, sorted conflict states and detached value ownership.

Run npm test after the last source or test change.
