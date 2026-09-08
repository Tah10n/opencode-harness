# Portable regression examples (development diagnostics only)

These tests are not loaded by the template. They use the project's normal APIs,
Node test runner and temporary files; no private harness path, evaluator import,
new execution environment or model/provider access is required. They are examples
for validating a regression hypothesis, not a reference patch available to agents.

For a disposable VibeRacing checkout, copy the applicable `.test.mjs` from this
directory into `packages/connector/test/native-diagnostic.test.mjs`, then run from
that project's root with Node 24:

```sh
node --test packages/connector/test/native-diagnostic.test.mjs
```

The relative imports and fixture URL resolve inside that project. There are no
absolute source paths. Apply no diagnostic change to an archived model candidate.

| Example | Contract basis for expected result | Preserved wrong off/on | Public corrected control |
|---|---|---|---|
| collectors-preserve-state.test.mjs | The task requires unsupported usage to be partial, retain accepted days and last committed state; unrelated metadata stays irrelevant | fail / fail (complete instead of partial) | pass, 0f8b1c7e1e502bb27ee01fc647e6b618035ca42c |
| account-switch-ledger.test.mjs | The task explicitly says deleting history cannot erase accepted events; new events count, replay does not duplicate, persisted identities are content-free | fail / fail (old day lost) | pass, 9e389a6dbc1b0c9813599fb61eceb6958d8c4de4 |
| Cursor original CLI/sync tests with only positive-version fixtures updated | The task permits valid dated builds from a lower date bound, and stable Desktop within the same major | 1/11 / 11/11 | 11/11, bbff8e4fa90497ba411c6487e07a004bcb8b84c3 |

These public commits are in [Tah10n/viberacing](https://github.com/Tah10n/viberacing).
Corrected code accepting a test is a positive control, not the reason its expected
result is correct. Expectations above come from the task, and the tests preserve
observable behavior without imposing a ledger representation. A failing original
or candidate demonstrates sensitivity only; passing these examples is not full
contract coverage. Preservation tests are not required to fail first.

The Cursor check uses the original CLI/sync test bytes from source commit
f2fdbf718c72ca4c27ea7dd225481b111e01f800, copied to each disposable project:

- In `cursor-cli.test.mjs` and `cursor-sync.test.mjs`, replace the positive fixture
  `2026.09.02-c22c1a3` with `2027.01.01-c22c1a3`.
- In `cursor-sync.test.mjs`, replace the default `version = "3.19.7"` with
  `version = "3.19.13"`.
- Keep every assertion unchanged. Run
  `node --test --test-concurrency=1 packages/connector/test/cursor-cli.test.mjs packages/connector/test/cursor-sync.test.mjs`.

All nine combinations above were run on separate source copies with ordinary
host Node 24.19.0. Cursor uses the project's existing local HTTP test server.
Collector/ledger positives complete all assertions; their negative controls stop
at the first expected assertion failure. No model attempt was rerun and no
historical result was rescored. No failing test was edited to fit an observed
output. These are local diagnostic checks, not model-backed lift or CI evidence.
