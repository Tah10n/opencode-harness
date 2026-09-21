# One plain Material UI 18141 attempt

This is a separate single-instance stage after the historical two-repository
admission stop. It is not a resumed pilot, independent confirming evaluation,
model error-rate estimate, harness comparison, or official PolyBench result.

## Contract and bounded acceptance

[PLAN.md](PLAN.md) fixes Q/T/D before the author result. F retains the complete
patch. E restores only [fe-manifest.json](fe-manifest.json)'s test surface and
uses the actual implementation from F. The separate
[id-observation.test.js](id-observation.test.js) comes from the literal issue,
not the official test patch. The scope is TextField native label/ID behavior,
ordinary TextField and the retained custom-select accessibility contracts.
It does not claim general controlled-value correctness or a platform matrix.

## Preparation

The first fresh calibration failed before test registration because moving the
unchanged custom reporter to /tmp changed Node's module lookup: `mocha` was not
found. A local load check reproduced MODULE_NOT_FOUND; the same reporter loaded
with NODE_PATH=/testbed/node_modules. The corrected command uses those same
pinned dependencies, leaving package.json, yarn.lock, Babel configuration and
assertions unchanged. First-attempt raw outcomes are retained privately under
`local/plain-mui-18141/calibration/`; they are preparation errors, not model
failures. Its historical guard also detected the separately authorized launcher
parameterization performed concurrently; the historical data preservation check
compares all old reports/results/prompts and pause hashes against the starting
state explicitly. No previous score has been recomputed.

The one scripted preflight completed using the actual plain launcher and local
SSE fixture: 5 native tools (read, toolchain check, apply_patch, public TextField
check, spill-output), 7 synthetic requests including title, native stop and full
capture/cleanup. It made zero real provider requests. The 39,690-byte spill is
byte-for-byte equal to the generated 2,400-line fixture, with retained SHA-256
and session/call links. The author inventory is the ordinary native tools,
without webfetch or harness_task. Original prompt bytes appear unchanged inside
OpenCode's native quote wrapper. Linux OpenCode version is 1.18.26; project
Node/npm are 18.8.0/8.18.0. The initial host --version command returned ENOEXEC
because the pinned executable is Linux; verification ran in its Linux image.

## Execution status

Pending completed calibration and local freeze commit. No real task-run or
provider request has started at this report revision. Exactly one new P slot is
authorized; no availability probe, retry, fallback or harness comparison.
