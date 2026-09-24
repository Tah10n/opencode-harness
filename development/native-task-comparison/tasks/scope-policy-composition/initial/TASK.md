# scope-policy-composition

Compose authorization rules across ordered roles. matches(pattern,resource) supports exact segments, * for exactly one segment, and terminal ** for zero or more remaining segments; wildcard characters never appear inside literal segments. authorize(roles,action,resource) considers every matching rule in every role. Any matching deny overrides all matching allows. Return {allowed:false,reason:"explicit-deny",roles:[names of denying roles]} for denial, {allowed:true,reason:"grant",roles:[granting roles]} if allowed, otherwise {allowed:false,reason:"no-grant",roles:[]}. Include each relevant role once in original role order. A rule={action,resource,effect}; action matches exactly or is "*". Domain: resource nonempty slash-separated nonempty segments containing ASCII letters/digits/underscore/dot/hyphen, patterns additionally support whole * and terminal **, actions nonempty ASCII identifiers, unique role names and valid effect allow/deny. Do not mutate inputs. Preserve default deny and exact match grants.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- A later explicit deny overrides an earlier wildcard grant.
- Difference between * and terminal ** at zero and multiple remaining segments.

Update project documentation to explain:
- Wildcard segment grammar and action wildcard.
- Deny precedence, default denial and deduplicated role explanation order.

Run npm test after the last source or test change.
