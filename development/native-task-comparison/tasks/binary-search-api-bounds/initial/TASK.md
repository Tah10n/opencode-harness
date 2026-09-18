# binary-search-api-bounds

Extend bounds(values,target,options?) and its locate consumer with optional {compare,key}. Defaults for missing/undefined fields are numeric compare(a,b)=a-b and identity key. target is already an extracted key: never run key on it. values is sorted under compare(key(value),key(value)); compare defines a consistent total order, returning a Number with negative/zero/positive sign (infinities allowed, NaN excluded). Return {lower,upper}: lower is first position whose key is not before target, upper first position strictly after target; both are values.length if absent at the end. Thus duplicate run is [lower,upper) and absent target has equal insertion bounds. locate must propagate options and return {found:upper>lower,index:lower,count:upper-lower}. Empty input returns zero bounds without callbacks. Preserve numeric calls and do not mutate values, options or records. Keep logarithmic comparator work: bounds uses no more than4*ceil(log2(n+1))+4 comparisons, with no need to fix exact comparison order/count. Callback failures propagate unchanged. Domain: dense sorted ordinary arrays length<=100000 (possibly frozen), pure key/compare callbacks, primitive or ordinary object elements, options ordinary stable data properties. Default comparator only used for finite numeric keys/target. No unsorted input validation, sparse arrays, callback mutation or async callbacks requested.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert duplicate lower/upper bounds and absent insertion points.
- Assert key/comparator options through locate, including descending order and source preservation.

Update project documentation to explain:
- Document both APIs, default/overloaded callbacks and already-extracted target.
- Explain duplicate/insertion boundaries, sorted-input assumptions and logarithmic work.

Run npm test after the last source or test change.
