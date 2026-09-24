# Persisted Claude ID regression

`test-only.patch` adds one ordinary Node 24 project test at
`packages/connector/test/claude-persisted-privacy.test.mjs`. It exercises the
real `bin/viberacing.mjs sync` command with two synthetic Claude events, a
loopback protocol server, and an isolated temporary installation. The test
requires observed nonzero usage and a changed, readable `state.json` before it
checks the entire file for the two exact input IDs. A new CLI process must then
reload the state without doubling usage, and a third must retain usage after
the source file is removed. Privacy is checked after each successful step.

From a clean, disposable VibeRacing checkout with Node 24:

```sh
git apply /path/to/test-only.patch
node --test packages/connector/test/claude-persisted-privacy.test.mjs
```

To reproduce the two historical results, first make separate clean copies of
VibeRacing commit `2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd`. Apply
`../D0.patch` to one copy and `../post-capture-followup/M.patch` to the other,
then apply this directory's `test-only.patch` to each. Run the command above
from each project root. The expected result on both saved implementations is
**two passing controls and one failing CLI regression**, with the first
persisted-state privacy assertion naming both leaked synthetic IDs. The
test-only patch is not a product fix.

The test file imports only Node built-ins and locates the product CLI relative
to itself. It uses no harness development file, private archive, fixed mount
path, or model-run artifact. See [REPORT.md](REPORT.md) for the observed runs,
calibration limits, and cost accounting.
