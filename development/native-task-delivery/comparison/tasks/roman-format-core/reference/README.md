# roman-format-core

## Supported contract

Extract pure roman(n) into src/roman.mjs and have existing label(n,prefix="Chapter ") in src/label.mjs delegate to it, without parallel Roman conversion logic. Preserve uppercase standard subtractive Roman numerals for integers1..3999 and RangeError("roman") for other numeric inputs including NaN/fractional, plus all existing prefix behavior (string including empty). Core must not use I/O/global mutable state. Domain numeric n, string prefix. Add direct core and consumer tests, preserve old assertions. This is refactoring, no extended number notation.

Run `npm test` for the preserved legacy and new project regressions.
