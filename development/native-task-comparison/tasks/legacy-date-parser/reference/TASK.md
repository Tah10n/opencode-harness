# legacy-date-parser

Extend parseDate(text) from strict YYYY-MM-DD calendar input to also accept YYYY-Www-d ISO week dates. Return a canonical YYYY-MM-DD calendar string, with no timezone conversion. Calendar input year must be2000..2099 and a valid Gregorian date, retaining exact string. Week-year must be2000..2099, week two digits01..52/53 only if it exists in that ISO year, weekday1..7 (Monday1). ISO week1 is the Monday-starting week containing January4; a week date may produce a calendar date in an adjacent year, even2100 despite the calendar-input year bound. Reject any invalid date, nonexistent week, wrong padding/case, spaces, suffix/time component or non-string input with TypeError. Do not use host local timezone or permissive Date.parse rollover as validation. Domain is exactly these two forms; no ordinal dates, localized names, timestamps or output round-trip requirement for a returned calendar year outside input bounds. Preserve strict calendar behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert ISO week-year transitions and valid week53 dates.
- Assert nonexistent week53 and invalid calendar dates reject while old calendar parsing stays intact.

Update project documentation to explain:
- Explain both exact forms, Monday/January4 week rule and year bounds.
- Document strict rejection and adjacent output years without timezone rollover.

Run npm test after the last source or test change.
