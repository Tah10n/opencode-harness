# Limit a filtered CLI record list

Add `--limit N` to `parseArgs` and `runCLI`. N must be a canonical nonnegative decimal integer (`0`, `1`, ...), representable as a safe integer. Reject a missing value, signs, whitespace, decimal fractions, leading zeroes other than `0`, nonnumbers and unsafe integers. The last occurrence of a repeated option wins, as for --tag.

Apply the limit after --tag filtering, preserving input order. Zero selects no records. An omitted limit selects all matching records. Both text and --json rendering must use exactly the selected records; keep the existing text lines and JSON array format. Preserve --tag, --json, unknown-option errors, and the input records and tags. No filesystem or frontend work is required.

Run `npm test` and `git diff --check` after the final change. Ordinary tests are public and may be extended. Keep their existing contract coverage. Use Node.js 24 and the standard library; no dependency installation is needed.
