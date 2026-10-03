# Per-line invoice discounts

Add optional numeric `discountPercent` to invoice lines. `validateLine` must accept finite numbers from 0 through 100 (fractional values are allowed), reject other supplied values without mutating the input, and retain a supplied value. Omission means no discount and must preserve the old object shape; an explicit zero remains present.

`invoice` applies the discount to quantity * unitCents and rounds each line to the nearest cent with `Math.round`, then sums rounded line totals. `exportInvoice` exports the same supplied discount and totals. Update the connected validator, pricing and export paths. Preserve line order, names, quantity/unitCents validation, the empty invoice and unchanged behavior for lines without a discount. Inputs must remain unchanged.

Run `npm test` and `git diff --check` after the final change. Ordinary tests are public and may be extended. Keep their existing contract coverage. Use Node.js 24 and the standard library; no dependency installation is needed.
