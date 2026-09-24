# percentile-method-options

Extend percentile(values,p,options?) with options.method "nearest" (default, preserve existing) or "linear". Validate method first, unknown TypeError("method"), then p finite number0..1 or RangeError("p"), even for empty input; return null for valid empty input. Values finite numbers, dense array<=1000, sorting copy numerically. Nearest uses index max(0,ceil(p*n)-1). Linear uses x=p*(n-1), interpolate between floor/ceil indexes. Duplicate values allowed. Never mutate/frozen input. Options plain object or omitted; no undefined-method error (defaults).

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- linear interpolation and default remain distinct
- validation precedes empty shortcut

Update project documentation to explain:
- Explain nearest default, exact linear formula, validation order/empty return and immutable numeric sorting.

Run npm test after the last source or test change.
