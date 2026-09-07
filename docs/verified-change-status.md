# Verified-change delivery status — 2026-09-07

The installed requirement-checking and bounded-repair mechanism is implemented.
The final model evaluation has not started. This is an experimental draft, with
no established product advantage and no evidence-backed designation.

The current manifest is frozen, despite the pre-freeze wording retained in its
hashed README and protocol. Those files are preserved byte-for-byte. The
authoritative binding is `evals/verified-change/manifest.json`, committed in
`8c620ccf41f4c0e1339fef5818c6f256aae7599b`, SHA-256
`68c28c91608f71b9f83b305f98fa3e821cff2bbe25f819510f830debed0ececa`.

## Install and run

From the repository checkout, with Node 24+, installed OpenCode and Docker:

```sh
npm pack ./product/verified-change --ignore-scripts
npm install --prefix ./harness-install --ignore-scripts --no-audit --no-fund ./opencode-harness-verified-change-0.1.0.tgz
./harness-install/node_modules/.bin/opencode-harness doctor --workspace /absolute/repository
./harness-install/node_modules/.bin/opencode-harness run --workspace /absolute/repository -- "Your task"
```

The target must be a clean Git worktree with a committed `.opencode-harness.json`.
See [package instructions](../product/verified-change/README.md) for the small
configuration and supported Node test adapter. The configured Docker image must
already exist locally; the product does not pull images or install project
dependencies. Model/provider selection is delegated to installed OpenCode when
no override is supplied. Authentication is not copied or replaced.

The CLI prints its private artifact directory, containing D0/D1/D2 patches,
check diagnostics, structured outcomes and unverified requirements. An accepted
patch is applied only after checking the original worktree state again.

## Verified preparation

On 2026-09-07, remote main still matched the branch base, installed OpenCode
reported version 1.18.26, and its `run --help` exposed the adapter's actual options.
The local Docker image matched the frozen immutable image ID. The installed
archive matched the candidate, all 40 frozen runner files matched, and all 60
task definitions matched their frozen fingerprints. The arm order remains 30 BC
and 30 CB, with 20 families and 20 tasks per stratum.

The installed runner suite passed 23/23 with no skips on 2026-09-07. Its
OpenCode/localhost-provider fixture verifies identical D0 copies, an author who
sees only the original source, one C repair and independent grades `[0,1,1]`.
This is deterministic mechanism evidence, not a scored evaluation observation.

The product suite also passed 51/51 with no skips on 2026-09-07 (164.6 seconds),
including freshly packed and prefix-installed CLI scenarios for correct D0,
missed requirements and consumers, unsupported assertions, broken test runtime,
regressing repair, concurrent user edits, cancellation and timeout cleanup.
The runner suite took 15.0 seconds. Reproduction commands:

```sh
(cd product/verified-change && VERIFIED_CHANGE_DOCKER_TEST=1 VERIFIED_CHANGE_OPENCODE_TEST=1 npm test)
VERIFIED_CHANGE_EVAL_INSTALLED=/absolute/installed/package node --test evals/verified-change/*.test.mjs
```

These runs use the installed OpenCode executable and a localhost scripted
provider; they do not send evaluation tasks to an external model. Historical
files are unchanged and the product runtime has no lab imports. Full repository
CI and live external-provider evaluation were not run in this continuation.

The development record contains 24 unique repository scenarios and all three
allowed substantive revisions. It documents one real-model correction of the
explicit integer `delayMs` requirement, together with an unresolved spurious
assertion in the same run. The final 23 revision-3 cases all selected D0 without
repair; a transactional-store dispute may have suppressed a valid defect.
See [the unchanged development record](../development/verified-change/README.md).
Those outcomes do not establish semantic success or measured lift.

## Measurements unavailable

No final task has an official scored result. The planned denominator is 60;
absence of observations is not 0/60 success.

| Requested result | Current value |
| --- | --- |
| A/N, B/N, C/N | Unavailable; 0 of 60 tasks scored |
| C−A and C−B absolute delta | Unavailable |
| Paired 95% confidence intervals and p-values | Unavailable |
| Recovered unsuccessful D0 / regressed successful D0 | Unavailable |
| Final-run time, turns, tool calls, observed tokens | Unavailable; evaluation unstarted |

The prior execution approval review rejected the official run because it would
transmit the synthetic repository files and task prompts to an external model
and could consume substantial account quota. It required direct confirmation
of the frozen `openai/gpt-5.6-luna`, `low` binding, payload and quota use. That
confirmation is pending. No alternative route around that rejection is used.

## Material limitations against the requested comparison

- The frozen runner provides 300 seconds for D0 and 600 extra seconds each for
  B/C, but **does not implement equivalent hard model/token/currency budgets**.
  C includes authorship in its internal deadline. B starts its clock before
  preparation, whereas C starts after preflight. Actual elapsed time includes
  setup and cleanup. This does not fully meet the requested equal-budget design.
- A/B use ordinary fresh OpenCode sessions through the same isolated repository
  tool adapter as C. This controls containment, but differs from unrestricted
  default OpenCode tools and project-local context discovery. Any result concerns
  this comparison, not every configuration of plain OpenCode.
- Generated assertions and the primary agent's disputes remain fallible. Passing
  admitted checks is not proof that all requested behavior is correct.
- Evaluation tasks are synthetic and clustered in 20 families. The frozen
  primary analysis uses a cluster-level paired t interval/test; task-level exact
  McNemar is only a nominal diagnostic because task pairs are dependent.
- Interrupted usage may be incomplete, and zero provider cost metadata is not
  evidence of free execution. Product support currently centers on Node's test
  runner and already-installed dependencies.

Candidate, runner, tasks, evaluator and thresholds remain frozen. These gaps are
reported rather than silently fixed by a fourth development revision or a new
campaign. The draft remains incomplete until authorized execution and reporting;
an eventual result cannot erase the equal-model-budget limitation.
