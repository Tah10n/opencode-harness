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

## Fresh calibration

| Case | F passed/failed | E passed/failed | E integrity |
| --- | --- | --- | --- |
| Baseline | 18/0 | 18/2 | verified |
| Gold | 18/0 | 20/0 | verified |
| Gold with author test assertions removed | not needed | 20/0 | verified |

Baseline E fails the unchanged label query and the separate literal ID check:
select.id is empty while label.htmlFor is labelled-select. Gold E observes both
as labelled-select and resolves the select by label. All 18 declared P2P and the
F2P are present in parsed results. Overlap restores the independent expectation
without modifying production. Source bytes/modes outside the surface, actual
module paths and unchanged assertions were checked; no production build output
is used by this Babel-register source test path. All calibration containers were
removed; nested creation/removal order is compared as a set of identities.

The successful calibration took 257.818 seconds including container preparation
and cleanup. [receipts.json](receipts.json) also retains the failed first
preparation's time and hashes separately. No historical 18/1 → 19/0 receipt was
changed. The old 12 unstarted slots and two unassigned admission slots remain
historical and are not the new slot.

## Execution status

Conditions were frozen locally in e0ebb4fe before any real dispatch. The slot
remains **not_started**: automatic permission review rejected the launch twice
before process creation. The first rejection treated the public Material UI
payload as private repository data; the second did not accept the authorization
in the user-provided attachment plus local provenance evidence as trusted
payload/destination approval. A direct user confirmation is pending. No endpoint,
account, permissions, transport or runtime workaround was attempted.

Real task-runs, provider requests, author tools/tokens, author execution and
cleanup time are all zero. M does not exist. delivery_apply, acceptance_diag,
Q, T and D are null; F_checks and assessment_integrity for the author are not_run.
Preparation success does not establish model success or failure. Developing-agent
work and preparation/evaluator costs are separate; monetary cost is unknown.
Exactly one new P slot remains authorized by the original task; no availability
probe, retry, fallback or harness comparison was assigned.
