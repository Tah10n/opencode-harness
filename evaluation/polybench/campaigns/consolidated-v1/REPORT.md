# Consolidated candidate: preparation complete, measurement not started

**No comparative quality result is available.** The fixed twenty-task selection
has seventeen technically ready tasks and three preparation exclusions, shared
by P/C/T. All sixty assigned slots remain **not_started**. No real provider
request, model patch or model-result evaluation exists for this campaign.

| Mode | Resolved / evaluated | Rate | Autonomous deliveries | Inference time | Input / output tokens | Unknown / evaluator / preparation |
| --- | --- | --- | --- | --- | --- | --- |
| P — Plain | 0 / 0 (not run) | — | 0 attempts | 0 s | No requests | 20 unobserved; evaluator not run; 3 preparation errors |
| C — Native core | 0 / 0 (not run) | — | 0 attempts | 0 s | No requests | 20 unobserved; evaluator not run; 3 preparation errors |
| T — Task + investigator | 0 / 0 (not run) | — | 0 attempts | 0 s | No requests | 20 unobserved; evaluator not run; 3 preparation errors |

No differences, confidence intervals or hypothesis-test results are calculated:
each comparison has zero observed task pairs and twenty incomplete pairs.
These rows are not zero quality scores and do not establish benefit, equality,
or loss. The historical pilot is a separate campaign and is not pooled here.

## Admission clarification before freeze

On 2026-09-30 the user confirmed that preliminary host container/input preparation
is separate from the 1800-second task budget. The unchanged timer starts after
that preparation. OpenCode startup, parent/title requests, author work, all project
commands, investigator and its preparation, post-start worktree creation, inspect,
integration and native delivery consume the shared budget. No model request,
solution work or agent-selected action belongs to preliminary preparation.

The earlier scripted observations measured 9.284 s (P), 6.245 s (C), and 6.668 s (T)
before task-clock start. These were preparation durations, not observed overruns.
[PLAN](PLAN.md) fixes separate accounting from existing timestamps for preliminary
preparation, agent execution, capture, cleanup, post-execution overhead and full
slot processing. Missing boundaries remain unknown; no post-start delays are
deducted. The rule is identical across P/C/T.

The existing authorization covers one frozen batch of at most 51 eligible attempts
under the original sixty-slot assignment. The nine preparation-excluded slots
remain not_started. Draft/review gates apply to PR merge, not model admission.
No stopped model batch is resumed and no availability probe is permitted.

## Fixed selection and technical outcomes

| # | Instance | Language | Official gold / baseline | Final preparation |
| ---: | --- | --- | --- | --- |
| 1 | `sveltejs__svelte-5850` | JavaScript | resolved / unresolved | ready |
| 2 | `serverless__serverless-6869` | JavaScript | resolved / unresolved | ready |
| 3 | `sveltejs__svelte-738` | JavaScript | resolved / unresolved | ready |
| 4 | `microsoft__vscode-177084` | TypeScript | resolved / unresolved | unsupported: absolute Python symlink |
| 5 | `mui__material-ui-38544` | TypeScript | resolved / unresolved | ready |
| 6 | `prettier__prettier-8777` | JavaScript | resolved / unresolved | ready |
| 7 | `sveltejs__svelte-6458` | JavaScript | resolved / unresolved | ready |
| 8 | `mui__material-ui-36971` | TypeScript | resolved / unresolved | ready |
| 9 | `sveltejs__svelte-3151` | JavaScript | resolved / unresolved | ready |
| 10 | `prettier__prettier-5025` | JavaScript | resolved / unresolved | ready |
| 11 | `mui__material-ui-42412` | TypeScript | resolved / unresolved | ready |
| 12 | `mui__material-ui-18683` | TypeScript | resolved / unresolved | ready |
| 13 | `microsoft__vscode-135805` | TypeScript | resolved / unresolved | ready |
| 14 | `serverless__serverless-2945` | JavaScript | resolved / unresolved | ready |
| 15 | `mrdoob__three.js-24461` | JavaScript | resolved / unresolved | ready |
| 16 | `serverless__serverless-8159` | JavaScript | resolved / unresolved | ready |
| 17 | `microsoft__vscode-108964` | TypeScript | resolved / unresolved | ready |
| 18 | `microsoft__vscode-189223` | TypeScript | resolved / unresolved | unsupported: absolute Python symlink |
| 19 | `tailwindlabs__tailwindcss-550` | TypeScript | gold resolved; baseline 0 parsed tests | preparation_error: baseline unverified |
| 20 | `coder__code-server-3277` | TypeScript | resolved / unresolved | ready |

VSCode-177084 rejects `remote/node_modules/spdlog/build/node_gyp_bins/python3`;
VSCode-189223 rejects `remote/node_modules/kerberos/build/node_gyp_bins/python3`.
Both point to `/usr/bin/python3`, outside the author input. Python's existing
`tarfile` data filter refused extraction. Minimal reproducers and archive hashes
are retained; isolation was not relaxed.

Tailwind-550 gold resolved with 101 passed tests. Its baseline process exited 1,
but the official parser produced zero passed/failed tests: the retained Jest JSON
lacks the closing `wasInterrupted` marker required by the pinned parser. Visible
textual counters are not substituted for the official parser. The baseline
control is unverified, and all three task slots are excluded. No parser, test,
assertion or command was repaired or retried to force a positive control.

## Scope and fixed inputs

Product candidate: `39def2ed0b1476299b104b38f8c93747d828a87a`.
The product modules and core instructions were materialized from that commit
and compared byte for byte. [Preparation metadata](preparation.json) records the
installed bundle/configuration hashes separately from the product and adapter.
Adapter commit: `5c0e634c4327bcbe687d8da03058e54c45f28734`. No product fix, prompt edit,
permission change or deadline change was made.

Dataset: `AmazonScience/SWE-PolyBench_Verified`, revision
`b3fca77b637379f0c01ad86d18753a7ac1998b53`, CSV SHA-256
`0c8138e73c34fa29a5276b675b146b72d78ce001fcc4560d76302c908b4808a5`.
Official evaluator: `amazon-science/SWE-PolyBench`, revision
`9c836c5d7f3cb991934132b77d29e6941d912a07`. Integrity checks cover tracked files
and extra importable Python sources, with assertions enabled.

The selection was committed before technical controls. It contains 10 JavaScript
and 10 TypeScript tasks, drawn by SHA-256 order with the fixed seed and language
category quotas in PLAN.md. The ten historical pilot IDs were excluded; indexed
later PolyBench case studies use those same IDs. Unused reserve metadata was not
treated as a previous experiment. No task is replaced after preparation failure.

Repository counts: Svelte 4, Material UI 4, VSCode 4, Serverless 3, Prettier 2,
Three.js 1, Tailwind 1, code-server 1. The eight repositories and twenty tasks
are a restricted JS/TS sample, not the complete benchmark or twenty independent
repositories. New to our development process does not imply absent from training.

## Compared configurations

| Arm | Configuration |
| --- | --- |
| P | Ordinary OpenCode build and native tools; no harness or host-global instructions/plugins |
| C | Stock native core materialization, without task or review |
| T | Stock native core with task; `/harness-task`, direct, investigator enabled |

For T, CONTEXT, CHECKS, TYPE_COMPAT, SENSITIVITY, COMMAND_HINTS,
PRESERVATION_NUDGE and EXTRA_ATTENTION are zero. There is no separate review,
forced investigator call, author reminder, imported solution or evaluator feedback.
Investigator use is the author's decision under the existing single-investigation
limit. This comparison does not isolate reviewer or TYPE_COMPAT effects.

All author containers use two CPUs, a 12288 MiB container memory limit, an
8192 MiB `/work` tmpfs and a 512-process limit. They run as UID/GID 1000,
with no container network, a read-only root filesystem, dropped capabilities
and no-new-privileges. The host is ARM64; the pinned project images are AMD64,
while the separate diagnostic/runtime toolchain is the existing ARM64 path.
These common local conditions are not a claim to reproduce leaderboard hardware.

OpenCode 1.18.26; `openai/gpt-5.6-luna`, high; the existing Codex OAuth Responses
route. Each task receives cyclic P-C-T, C-T-P, T-P-C order. All real attempts are
serial; at most sixty attempts are assigned, each with one 1800-second task clock.
Parent/title/child traffic, native bootstrap, tools and delivery share that clock.
Preliminary container preparation is separate under the user clarification above.

The common recording profile is `research-full-inspect-ledger-1g-v1`, with a
1 GiB slot cap and unchanged request/response limits. Unknown submission,
auth/quota, incomplete evidence or unverified local stop closes new admissions.
No retries or resumption of a stopped batch are implicit.

## Technical checks and intermediate failures

The short installed P/C/T checks use scripted responses, not a real model.
All three received the full task and expected native tools, executed edit/bash,
and ended with a patch that reproduced the captured final snapshot. P and C
used `/work/repo`; T used the actual task delivery worktree. A separate real
container check covered additions, deletions and executable modes.

The scripted patch was identical in all three arms: SHA-256
`f115c00cc4fcf3e3241dd34505357a1a3f1aec4ceaa6cdef39323581a8087611`.
One official invocation evaluated those exact bytes and confirmed patch
application, with `resolved=false`. Its result SHA-256 is
`e1ed068731d94c48c316a40da88f3eb6dc653a018860e77a3b2c0af251570fca`.
This is an export/control check, not a model benchmark observation.

Intermediate preparation problems remain in private evidence:

- C initially needed its startup `.gitignore` before mounting the template
  read-only. Adapter preparation supplied the normal file; only C was rechecked.
- One Docker call was blocked by the local sandbox before extraction. Its empty
  partial inputs and diagnostic were retained; access was corrected without
  excluding the affected benchmark tasks.
- The MUI broken-link probe exposed an adapter variable collision: a filename
  overwrote the temporary container name used for cleanup. A dedicated variable
  fixed the cause before freeze. The same input then passed the probe for all
  86 originally missing targets. The exited container was identified and removed;
  the original error and probe output remain preserved.
- The selected code-server version has no `vendor/modules`. Adapter preparation
  now checks whether that directory exists before including it; the original
  whole-directory handling is preserved for versions that have it. The same
  selected task then passed preparation, including its LFS asset.
- Image environment auditing required inspection of browser/crash paths and
  `YARN_VERSION`. These were verified as public runtime metadata; no image,
  project code or hidden-data boundary was changed. Root filesystem inspection
  also covered accessible common build locations and discovered Yarn caches.
- An intermediate aggregate verification hit sandbox `listen EPERM` at
  `127.0.0.1`; its diagnostic is retained. After the final adapter change, the
  complete `npm run verify` passed with local socket access, including all
  eighteen product/evaluation checks. No real provider calls were involved.

All twenty preparation dispositions and source-bound control hashes are recorded
in [preparation.json](preparation.json). The original selection is unchanged.

Control success means the official `resolved` criterion, not that every test
in the project is green. For Three.js-24461, the official gold control resolved
with 718 passed and 897 failed tests, while baseline did not resolve with
716 passed and 899 failed tests. These raw outcomes are retained without parser,
test-command or assertion changes. Control results are never returned to authors.

## Prespecified scoring contract

R is the official `resolved` value for the exact complete captured patch. T is
autonomous delivery with native completion, verified local stop, captured delivery
record where applicable, and strict patch applicability. D = R and T. A task
workflow's own project-check status is reported separately. Operational delivery
does not certify correctness.

Terminal and partial artifacts are distinguished. A successful R for a partial
patch does not become autonomous delivery. Missing capture does not become an
empty patch. Not-started slots, evaluator errors and missing values are not zeros.
Provider completion, evidence completeness and token usage have independent fields.

The predeclared primary comparison is T/P. C/P is secondary and T/C descriptive.
Complete task pairs determine wins/losses/ties and percentage-point differences;
incomplete pairs remain visible. PLAN.md fixes the 100000-resample paired
percentile bootstrap and primary-only exact McNemar test. A degenerate interval
is not equivalence, and a small incomplete sample cannot establish no advantage.
Leave-one-repository-out differences are descriptive sensitivity checks.

All author/child/title/parent request usage counts. Cached input and reasoning
output are included subsets, never extra totals. Unknown usage is shown, and no
money figure is inferred without a reliable route-specific bill or tariff.
Preparation, official evaluator execution, CI and this development work are
separate from benchmark inference. Historical pilot costs and results are not
added to this campaign.

## Observed costs and time coverage

[Machine-readable cost coverage](costs.json) keeps inference, preparation,
official controls and development separate. There is no monetary estimate.

| Activity | Recorded observation | Coverage |
| --- | --- | --- |
| Benchmark inference | 0 requests; 0 input/output tokens; 0 task seconds | No task-run was admitted |
| Official baseline/gold execution | 3703.988 process seconds | Duration receipts for 39 of 40 controls; the first gold duration is missing; excludes scripted export control |
| Official image downloads | 3704.654 seconds | Receipts for 19 of 20 pulls; excludes the initial download |
| Serial preparation controller | 7468.163 seconds | All 20 task records; includes controls/downloads above, so these times must not be added together; earlier setup excluded |
| Developing Codex agent | 855,276 goal-meter tokens; 8868 seconds | Checkpoint 2026-09-29T16:38:10.000Z; no input/output split or bill; later publication/CI work excluded |
| CI | Not included in this preparation checkpoint | Actual execution is reported by the PR checks |

Goal-meter tokens are not the benchmark provider's token accounting. Unknown or
unrecorded preparation/CI costs are not declared zero. The aggregate preparation
wall time and monetary bill are not fully measured by these partial receipts.

## Publication and retained evidence

The public artifact contains [PLAN](PLAN.md), [selection](selection.json),
[preparation](preparation.json), [unstarted slot records](results.json) and this
report. There is no frozen manifest, prediction file or model patch because no
model attempt was admitted. Detailed controls and process logs remain private.
Reproducible extraction archives are removed only after source/integrity checks
and hash retention. All 34 redundant base/dependency archives for the seventeen
ready tasks have been removed after hash verification (14,087,055,360 bytes).
The two unsupported VSCode inputs and their Electron copies were also removed,
while minimal reproducers and their original hashes were preserved. No campaign
preparation or evaluator container remains.

The private campaign directory currently occupies approximately 18 GiB, including
prepared author inputs and toolchains. These inputs and pinned Docker images are
still needed for the authorized campaign; raw evidence remains
private. Their final cleanup is not declared complete while execution and evaluation are
pending. Shared caches and unrelated Docker resources were not pruned.
