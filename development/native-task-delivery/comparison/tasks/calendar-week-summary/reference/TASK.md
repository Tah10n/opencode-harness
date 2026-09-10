# calendar-week-summary

Implement weekStart(day) returning Monday of containing UTC calendar week, and integrate summarize(entries) aggregating {day,minutes} into sorted {week,minutes}. Domain valid Gregorian YYYY-MM-DD dates years2000..2099 and nonnegative integer minutes, <=1000 entries, safe totals; dates at year edges may map into prior year. Calendar arithmetic must not depend on host timezone. Duplicate days sum; preserve source entries/frozen arrays. Sort output by ascending week date, no empty weeks. No ISO week-number calculation or locale week conventions.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- week boundaries reach aggregation
- year leap and input preservation

Update project documentation to explain:
- Document UTC Monday grouping, year boundaries, summation/sorting and no mutation.

Run npm test after the last source or test change.
