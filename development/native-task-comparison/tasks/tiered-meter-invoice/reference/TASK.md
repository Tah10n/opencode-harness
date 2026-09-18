# tiered-meter-invoice

Extend charge(units,bands) in src/meter.mjs from a flat rate to graduated cumulative bands: each unit is charged only at the rate of its band, with upTo inclusive as a cumulative quantity threshold; null is unlimited. Update invoice(entries,bands,credit=0) in src/invoice.mjs to preserve input order and return {lines:[{id,cents}],subtotal,appliedCredit,due}. Apply credit once to the invoice, capped at subtotal; do not mutate inputs. Input domain: nonnegative safe integer units/credits/rates, unique nonempty entry IDs, strictly ascending positive finite band limits then one null limit; arithmetic fits safe integers.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- A multi-band invoice with distinct rates and exact line charges.
- Credit applied once and capped at subtotal.

Update project documentation to explain:
- Cumulative graduated thresholds, not one rate for all units.
- Invoice-level capped credit and unchanged input ordering.

Run npm test after the last source or test change.
