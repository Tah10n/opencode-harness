# percentile-method-options

## Supported contract

Extend percentile(values,p,options?) with options.method "nearest" (default, preserve existing) or "linear". Validate method first, unknown TypeError("method"), then p finite number0..1 or RangeError("p"), even for empty input; return null for valid empty input. Values finite numbers, dense array<=1000, sorting copy numerically. Nearest uses index max(0,ceil(p*n)-1). Linear uses x=p*(n-1), interpolate between floor/ceil indexes. Duplicate values allowed. Never mutate/frozen input. Options plain object or omitted; no undefined-method error (defaults).

Run `npm test` for the preserved legacy and new project regressions.
