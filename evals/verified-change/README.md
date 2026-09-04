# Verified-change evaluation preparation

**Not frozen. No final model outcome has been observed.** The eventual single
60-task evaluation is specified in PROTOCOL.md. It is separate from development.

Currently 12 tasks in four declared families have been authored:

| Family | Public reproducer | Uncovered requirement | Multi-file obligation |
| --- | --- | --- | --- |
| Route table | Malformed percent parameter | HEAD fallback | Bound request context |
| Window quota | Zero timestamp | Weighted consumption | Policy selectors and factory |
| Catalog | Empty/own-key lookup | Locale parent fallback | Template formatting consumer |
| Dependency graph | Duplicate dependencies | Execution layers | Settled failure propagation |

Each has ordinary public source/tests, an independent behavioral hidden grader,
a reference and a separately implemented alternative. All twelve were validated
through the exact installed product's Docker/check modules: the appropriate
incorrect baseline fails, while both valid implementations pass public/hidden
checks and source scope. This is fixture validation, not model evaluation. The
remaining 48 tasks, runner, freeze manifest and full execution are pending.

Run pre-freeze model-free fixture validation against an installed bundle:

```sh
node evals/verified-change/validate-fixtures.mjs /absolute/install/node_modules/@opencode-harness/verified-change
```

An optional final argument selects one corpus module for a bounded recheck. The
script retains actual check records privately. It does not launch models, retry
an evaluation, or issue a scored success claim.

`statistics.mjs` implements the draft paired cluster t analysis and nominal exact
McNemar, with degenerate variance reported unavailable. Independent review checked
the formulas and implementation; four model-free tests passed both locally and
in the independent review. This review preceded final outcomes. The original
sign-flip proposal was removed because its symmetry null was stronger than a
zero-mean effect. The t approximation's assumptions and limitations remain
explicit. Critical-value conventions agree with the
[NIST Student t table](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm).

```sh
node --test evals/verified-change/statistics.test.mjs
```

Do not execute models on these final cases until all 60 are ready, the installed
runner path is verified, and the manifest freezes candidate/bundle/runner/corpus,
instructions, limits, arm order, no-retry policy and analysis. Do not publish a
positive effect from generated tests, fixture validation or review approval.
