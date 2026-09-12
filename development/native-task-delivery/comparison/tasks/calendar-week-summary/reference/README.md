# calendar-week-summary

## Supported contract

Implement weekStart(day) returning Monday of containing UTC calendar week, and integrate summarize(entries) aggregating {day,minutes} into sorted {week,minutes}. Domain valid Gregorian YYYY-MM-DD dates years2000..2099 and nonnegative integer minutes, <=1000 entries, safe totals; dates at year edges may map into prior year. Calendar arithmetic must not depend on host timezone. Duplicate days sum; preserve source entries/frozen arrays. Sort output by ascending week date, no empty weeks. No ISO week-number calculation or locale week conventions.

Run `npm test` for the preserved legacy and new project regressions.
