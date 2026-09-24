# partial-checkout

# Reserve available checkout lines consistently
Implement partial fulfillment through plan(stock, lines), checkout(stock, lines), and purchase(stock, lines, prices).
Stock is a plain mapping of SKU to nonnegative safe integer quantities; prices contains nonnegative integer cents for every known SKU. These mappings are valid inputs; do not introduce new validation rules for them.
Validate the entire lines array before any stock mutation. Every line must be an object with a nonempty string sku and positive safe integer qty; otherwise throw TypeError. Empty lines is valid.
Process lines in original order, treating duplicate SKUs against the remaining stock. Accept a whole line only when its SKU is an own stock key and enough remains; no partial quantities. Otherwise reject it as unavailable without consuming stock. Return {accepted:[{index,sku,qty}],rejected:[{index,sku,qty,reason:'unavailable'}]}; each array preserves relative input order. Additional input line fields are ignored.
plan is pure and must not mutate stock or lines. checkout decrements only accepted quantities in the supplied stock, returns the same result shape, and never leaves negative quantities. purchase returns that shape plus totalCents charged only for accepted lines. Unknown SKUs are rejected without consulting prices. Keep the existing exports.
Add project tests for duplicate-SKU partial fulfillment through purchase and for an invalid later line leaving stock unchanged. Document whole-line order-dependent fulfillment, validation atomicity, and charging in README.md.

Use the existing Node built-ins and public exports. Keep old project tests and behavior. Do not add dependencies. Run npm test after the last change.
