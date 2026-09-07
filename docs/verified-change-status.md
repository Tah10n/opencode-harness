# Verified-change delivery status — 2026-09-07

The installed requirement-checking and bounded-repair mechanism and its single
60-task final run are complete. **No product advantage was established.** The
frozen outcomes are A=59/60, B=58/60 and C=56/60; C−A is −5.00 percentage points
and C−B is −3.33 percentage points. Full statistics, every task, observed costs,
regressions and design limitations are in [the final report](verified-change-results.md)
and [the public structured results](verified-change-results/results.json).

The product remains experimental. A generated-test admission failure caused two
scored code regressions, a further static diagnosis found a regression missed
by the grader, and one arm could not verify container cleanup. The latter leaves
the frozen evidence gate unavailable. There is no evidence-backed designation,
merge, release or default switch.

## Install and run

From this repository checkout, with Node 24+, installed OpenCode and Docker:

```sh
npm pack ./product/verified-change --ignore-scripts
npm install --prefix ./harness-install --ignore-scripts --no-audit --no-fund ./opencode-harness-verified-change-0.1.0.tgz
./harness-install/node_modules/.bin/opencode-harness doctor --workspace /absolute/repository
./harness-install/node_modules/.bin/opencode-harness run --workspace /absolute/repository -- "Your task"
```

The target must be a clean Git worktree with a committed `.opencode-harness.json`.
For example, adapting paths and checks to the target repository:

```json
{
  "version": 1,
  "image": "node:24.19.0-bookworm-slim",
  "sourcePaths": ["src"],
  "protectedPaths": ["test", "package.json", ".opencode-harness.json"],
  "checks": [{"id": "regression", "kind": "node-test", "files": ["test/api.test.mjs"]}]
}
```

The image and project dependencies must already be installed. The product does
not pull images or install project dependencies. Without a model/variant
override, installed OpenCode selects its normal provider and model; no specific
model is hardcoded into the product and authentication remains with OpenCode.

The CLI reports its private artifact directory, D0/D1/D2 patches, diagnostics,
check outcomes and unverified assertions. It applies a selected passing patch
only after checking the original user worktree again. Concurrent user changes,
failed verification or operational failures retain patches for inspection.
See the [unchanged package instructions](../product/verified-change/README.md)
for supported flags and the Node test adapter. Its old pre-freeze status text is
retained as a hashed input; this delivery status and the final report supersede
that status wording.

## Validation and development record

Fresh checks on 2026-09-07 passed **51/51 product tests** (164.6 seconds) and
**23/23 runner tests** (15.0 seconds), with no skips. They used the actual
installed OpenCode executable, Docker, a freshly packed/prefix-installed bundle
and a localhost scripted provider. They verify the controller and installed
scenario, including missed requirements, consumers, disputed assertions,
broken test runtime, rejected regressions, concurrent user edits and cleanup.
They do not establish real-model semantic accuracy. Commands:

```sh
(cd product/verified-change && VERIFIED_CHANGE_DOCKER_TEST=1 VERIFIED_CHANGE_OPENCODE_TEST=1 npm test)
VERIFIED_CHANGE_EVAL_INSTALLED=/absolute/installed/package node --test evals/verified-change/*.test.mjs
```

All five repository CI jobs passed on delivery head
`15e056867b399ed23116441fa6db45593e3e2517` before the final report-only update;
current exact-head CI is attached to [the existing draft PR](https://github.com/Tah10n/opencode-harness/pull/23).
After the official run, independent checks also verified frozen inputs, all
60 preserved original workspaces, paired D0 identity, snapshot/patch references,
180 single arm attempts and the prespecified numerical analysis.

The unchanged [development record](../development/verified-change/README.md)
contains 24 unique scenarios and all three allowed substantive revisions. One
real-model integer `delayMs` correction coexisted with an unresolved spurious
assertion. Final development runs mostly retained D0. Those observations do
not establish broad learned accuracy or several independently validated real
recovery cycles.

## Frozen comparison limitations

The runner has equal 600-second extra allowances for B/C but no equivalent hard
model/token/currency cap, and their setup clock boundaries differ. A/B use the
same isolated repository-tool adapter as C. The corpus is synthetic; nine of
20 nominal multi-file tasks have one-file reference and alternative solutions.
The cluster paired t analysis is approximate and exact task-level McNemar is
nominal under family dependence. Interrupted usage can be incomplete. The final
report records these gaps, the grader's finite coverage and the cleanup failure.

Manifest SHA-256:
`68c28c91608f71b9f83b305f98fa3e821cff2bbe25f819510f830debed0ececa`.
It was committed before the first official call and remains authoritative even
where frozen README/protocol files say draft. Candidate, tasks, evaluator,
thresholds and order were not changed. No scored outcome was retried, no task was
excluded and no replacement evaluation or fourth development revision was made.
