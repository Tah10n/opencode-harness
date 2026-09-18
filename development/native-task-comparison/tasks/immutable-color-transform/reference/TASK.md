# immutable-color-transform

Extract parseColor(text), shiftColor(color,amount), formatColor(color) into src/color-core.mjs and make existing adjustColor(text,amount) in src/color.mjs compose them in that order. Supported text exactly #rgb/#rgba/#rrggbb/#rrggbbaa case-insensitive hex, no trimming; invalid/non-string TypeError('color'). Parse produces fresh {r,g,b,a} integer channels0..255, shorthand digits doubled, omitted alpha255. shift accepts ordinary/frozen channel records in that domain; amount finite number[-1,1], otherwise RangeError('amount'). For amount>=0 each RGB channel rounds Math.round(c+(255-c)*amount), for negative rounds Math.round(c*(1+amount)); alpha unchanged. Result fresh, input unmodified; endpoints white/black respectively. format emits lowercase six hex digits and appends alpha exactly when a!=255, never shorthand. adjust retains parse-before-amount validation order, no duplicate color logic. Domain explicitly excludes CSS names/rgb()/percentages/other color spaces; no floating channels in color records. Preserve all old tests/behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert shorthand/long uppercase parsing, canonical output and nonopaque alpha.
- Assert positive/negative/endpoint shifts, rounding, frozen nonmutation and validation order.

Update project documentation to explain:
- Document supported hex syntax, byte alpha and canonical output.
- Explain interpolation/rounding, amount range and pure core composition.

Run npm test after the last source or test change.
