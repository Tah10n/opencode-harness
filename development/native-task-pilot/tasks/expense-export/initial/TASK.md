# Currency-filtered expense export
The finance operator needs EUR-only or USD-only reports without editing input files.
1. Extend buildReport(expenses, options = {}) with optional currency. Accept EUR or USD case-insensitively; reject any other supplied value (including empty/null) with RangeError. Omission preserves the current all-currency behavior and exact existing return shape.
2. Filter before totals and count. Amounts are integer cents; do not convert through floating-point currency units. Do not mutate inputs. Keep original row order.
3. Wire `node cli.mjs INPUT --currency VALUE` through argument parsing, service and CSV rendering. Unknown flags or a missing value must exit 2 with an error on stderr and no CSV on stdout.
4. The CLI with no flag retains its CSV header and quoting. CSV must handle commas and double quotes in description and end with a newline, including an empty selection.
5. Add project tests exercising the library AND actual CLI for selected currency, invalid flag/value, empty selection, and existing quote handling. Keep old tests. Document the option and cents units in README.md.
