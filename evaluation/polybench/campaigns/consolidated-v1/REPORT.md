# Consolidated candidate: partial results and terminal admission stop

The single authorized batch ran on 2026-09-30, from 08:42:24.986 UTC to
14:04:41.955 UTC. **27 model attempts completed across nine common tasks.**
The coordinator then stopped at slot 31 before its first model request. This is
a stopped partial campaign, not completion of all seventeen eligible tasks.
The original twenty tasks and sixty assignments remain intact; 33 slots are
not started and retain null R/T/D. Nine were excluded on preparation, and 24
were prevented from starting by the admission stop. No replacements or retries.

| Mode | Resolved / evaluated | Rate | Autonomous deliveries | Agent execution | Input / output tokens | Unknown / evaluator / infrastructure |
| --- | --- | --- | --- | --- | --- | --- |
| Plain (P) | 2 / 9 | 22.2% | 9 / 9 (100%) | 4472.004 s | 13,213,483 / 92,731 | 11 not started; 1 official patch rejection |
| Native core (C) | 3 / 9 | 33.3% | 9 / 9 (100%) | 4240.290 s | 12,497,925 / 84,682 | 11 not started; 1 official patch rejection |
| Task + investigator (T) | 2 / 9 | 22.2% | 7 / 9 (77.8%) | 6425.786 s | 18,369,635 / 87,790 | 11 not started; 2 official patch rejections; 2 captured empty partial artifacts |

R is the pinned evaluator's outcome for the complete exact captured patch.
The operational delivery metric T (distinct from the arm name) is 9/9, 9/9 and
7/9; D = R ∧ T is 2/9, 3/9 and 2/9. All started attempts have a known official
quality outcome, known provider completion and complete usage. Four official
patch rejections and two actual empty partial captures are retained in R=false;
no missing capture or unstarted slot was turned into an empty prediction.
All seven delivered task workflows independently reported `workflow_status=incomplete`.

## Comparison on the nine observed task pairs

| Comparison | Wins / losses / ties | Unobserved pairs | R difference | Paired 95% interval | Formal test |
| --- | --- | ---: | ---: | --- | --- |
| T − P, primary | 1 / 1 / 7 | 11 | 0.0 pp | −33.3 to +33.3 pp | Exact McNemar p=1.0 |
| C − P, secondary | 1 / 0 / 8 | 11 | +11.1 pp | 0.0 to +33.3 pp | Not separately tested |
| T − C, descriptive | 0 / 1 / 8 | 11 | −11.1 pp | −33.3 to 0.0 pp | Not tested |

The frozen paired percentile bootstrap uses 100000 resamples and seed 20260929.
D comparisons have the same counts and intervals. Only the primary R comparison
has a formal hypothesis test, so there is no post-hoc choice of a winning arm.
C's observed gain is one task; it is not evidence of a general quality gain.
T and P tie in count but solve different tasks. The primary result is inconclusive,
not equivalence or proof of no advantage. No full-benchmark score is claimed.

Observed tasks come from four repositories: Svelte 4, MUI 2, Prettier 2 and
Serverless 1 (seven JS, two TS). The original selection spans eight repositories
and ten tasks per language. Eleven missing pairs narrow coverage substantially.
Leaving Svelte out changes T/P to 0 wins / 1 loss / 4 ties (−20 pp); leaving MUI
out gives 1 / 0 / 6 (+14.3 pp). Leaving Prettier or Serverless out retains one win
and one loss. These repository-sensitive descriptions are in [results.json](results.json).

| Observed task | P: R / delivery | C: R / delivery | T: R / delivery | Official exception |
| --- | --- | --- | --- | --- |
| `sveltejs__svelte-5850` | false / true | true / true | true / true | — |
| `serverless__serverless-6869` | false / true | false / true | false / true | — |
| `sveltejs__svelte-738` | false / true | false / true | false / true | — |
| `mui__material-ui-38544` | true / true | true / true | false / false | T: empty_patch |
| `prettier__prettier-8777` | false / true | false / true | false / true | — |
| `sveltejs__svelte-6458` | false / true | false / true | false / true | T: patch_rejected |
| `mui__material-ui-36971` | false / true | false / true | false / false | T: empty_patch |
| `sveltejs__svelte-3151` | true / true | true / true | true / true | — |
| `prettier__prettier-5025` | false / true | false / true | false / true | P: patch_rejected; C: patch_rejected; T: patch_rejected |

## Exact stop and candidate limitations

Slot 31 was `mui__material-ui-42412-C`. Existing input-manifest serialization
produced 43,229,958 bytes for 204,292 entries; the adapter's subprocess buffer is
33,554,432 bytes. JSON parsing failed with `Unterminated string in JSON at position
33587195`. No task timer, OpenCode session or model request began. The persisted
pause is `execution_or_capture_error`, slot 31. Its partial environment snapshot
is excluded from predictions and is not a model failure. The initial slot receipt
closed after 56.965 s; its original capture was incomplete because native data
did not exist. Subsequent inspection verified the suspended relay and absence
of author work, archived the evidence, removed the exact container, and verified
all 28 created author containers absent. Recovery added 321.468 s of wall time
beyond batch exit; it made zero model requests. The pause remains in force.

The new adapter error was not fixed after freeze. No later assignment was sent,
including the remaining 23 positions after slot 31. The candidate and evaluator
were not edited in response to any observed result.

Two T attempts, MUI-38544 and MUI-36971, stopped in stock `harness_task` with
`Git context unavailable (ls-files)` before the author child session. Their base
Git listings exceed the stock 2 MiB buffer (2,579,497 and 2,534,961 bytes).
A model-free reproduction using the original MUI-38544 filenames produced the
same buffer failure. Native parent completion does not supply a terminal task
record: both are empty partial environment captures, with delivery=false and
official resolved=false. Verified stop/capture/cleanup remains true.

The official evaluator rejected the full model patch for Prettier-5025 in all
three arms and Svelte-6458 in T (`patch_applied=false`, `generation=true`). Its
retained console records patch-application errors; it does not expose a finer
hunk diagnosis in the result. No tests, fixtures or snapshots were removed from
predictions, and no alternate application order or manual score was substituted.
All 27 strict base-checkout applications passed before official evaluation; this
is a different check from the evaluator's full application sequence.

Investigator use was chosen by the author:

- Svelte-738/T ran one child investigation: 68 observed commands, usable=true,
  finish=stop, empty test patch, no recorded disposition. Preparation plus child
  work took 519.736 s, entirely inside the parent task clock. R remained false.
- Svelte-3151/T invoked investigator preparation, which declined after 0.062 s
  with `Investigation snapshot file limit exceeded`. No child model session ran.
  The marker called `started` in the frozen collector denotes preparation; the
  public presentation calls it `preparation_started` and records child commands
  separately. The final task R=true is not attributed to a child that never ran.

The stock advertised 180-second diagnostic budget is not an independently
implemented investigator deadline: the candidate uses the enclosing task deadline
and does not debit investigation elapsed time from the sensitivity counter.
Svelte-738's 519.736 s is retained as observed, with no clamp or subtraction.
The common 1800-second task mechanism was unchanged and no observed attempt
exceeded it. This candidate limitation was not repaired during measurement.

## Time boundary fixed before freeze

Preliminary host container/input preparation contains no model request, solution
work or agent-selected action. The unchanged task timer starts after it. OpenCode
startup, parent/title requests, author work, all project commands, investigator
and its preparation, post-start worktrees, inspect, integration and delivery are
inside the same 1800 seconds for P/C/T. Nothing was deducted retroactively.
[PLAN](PLAN.md) and the frozen manifest record this clarification before execution.

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
Frozen adapter commit: `670f6e8f35ba1df60a337fbe6c04b16313cd9d67`.
The earlier preparation metadata names its historical `5c0e634c` checkpoint;
[frozen-manifest.json](frozen-manifest.json) binds the actual run adapter and inputs. No product fix, prompt edit,
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

- Final-freeze serialization reached Node's maximum string length because each
  shared source manifest was serialized once as a runtime input and again for
  each of P/C/T. No freeze file or run existed. Consolidated slots now reference
  the same already-verified runtime manifest; historical per-arm manifests remain
  readable. Model-free checks cover both formats and refusal of changed inputs.
  The failure log and the empty pre-freeze directory receipt are retained.
- The first final-freeze validation rejected Three.js's existing relative
  `test/node_modules/three -> ../..` link, which resolves exactly to the allowed
  source root. Before any freeze or model request, the adapter's manifest and
  actual-container input predicates were aligned with the preparation boundary:
  the root itself is inside the tree. A RED-to-GREEN fixture executes the actual
  scheduler input-check script; outside and sibling targets remain rejected.
  Source inputs, permissions, deadline behavior and the three exclusions did
  not change. The unsuccessful pre-freeze validation log is retained.
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
- After the pre-freeze root-link adapter correction, the full local check run
  passed the first ten checks but failed the unchanged sensitivity cancellation
  fixture with `Diagnostic child termination unverified`. A subsequent process
  inspection found that exact child PID absent; the retained fixture was archived
  and removed. This later failure supersedes any claim that the latest aggregate
  run passed. SENSITIVITY is disabled in every campaign arm; the product and its
  test were not repaired or retried. Remaining checks are reported separately.

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

## Actual time and expense coverage

All figures use the pre-existing receipts; no new telemetry was installed.
Execution is taskStarted → forwardingClosed on the monotonic clock. Preliminary
preparation is started.json.at → taskStarted.at. Capture and cleanup are subsets
of forwardingClosed → completed.at, so they must not be added twice. Full slot
wall time is started.json.at → completed.at. Per-slot values and missing boundaries
are in [results.json](results.json); [costs.json](costs.json) separates activities.

| Arm | Preliminary preparation | Agent execution | Capture | Cleanup | Full observed slot wall |
| --- | ---: | ---: | ---: | ---: | ---: |
| P, 9 started | 107.901 s | 4472.004 s | 9.443 s | 1.664 s | 4591.603 s |
| C, 9 started + 1 pre-execution fault | 117.394 s known | 4240.290 s (9 runs) | 9.729 s known | 1.783 s | 4426.668 s |
| T, 9 started | 107.108 s | 6425.786 s | 14.187 s | 2.016 s | 6549.697 s |

C's fault has no task-start boundary: agent execution was NOT RUN; exact preparation
and capture duration cannot be separated from its 56.965 s initial handling span.
Its recorded cleanup attempt did not remove the retained container; verified
recovery is a separate receipt, not a retroactive rewrite of that attempt.
The recovery-inclusive wall interval is recorded on slot 31 and overlaps the
batch interval; only its 321.468 s tail is outside that batch interval.

Observed slots total 15,567.968 s, versus batch wall 19,336.954 s (5 h 22 min
16.954 s). The additional **3768.986 s** includes existing frozen-input verification
before per-slot started markers and other controller overhead; existing timestamps
do not separate or fairly assign it to arms. It remains visible as unallocated
batch overhead. These figures exclude earlier preparation and official evaluation.

| Arm | Requests | Input | Output | Cached input, included | Reasoning output, included |
| --- | ---: | ---: | ---: | ---: | ---: |
| P | 288 | 13,213,483 | 92,731 | 6,875,648 | 50,241 |
| C | 268 | 12,497,925 | 84,682 | 6,068,736 | 44,757 |
| T | 293 | 18,369,635 | 87,790 | 935,936 | 46,786 |
| Total | 849 | 44,081,043 | 265,203 | 13,880,320 | 141,784 |

Usage is known for all requests, including startup/title/parent/author/child work.
Equal time ceilings do not imply equal compute: T used 43.7% more execution time
and 39.0% more input than P, with much less cached input. No reliable bill or
route-specific tariff was available, so money remains unknown rather than zero.

| Separate activity | Recorded observation | Coverage |
| --- | --- | --- |
| Official model evaluation | P 371.751 s; C 367.147 s; T 197.260 s; total 936.158 s | One pinned invocation per arm; all exited 0; 27 per-instance outcomes; no re-evaluation |
| Baseline/gold controls | 3703.988 process seconds | 39 of 40 duration receipts; first Svelte-5850 gold duration missing; excludes scripted control |
| Official image downloads | 3704.654 s | 19 of 20 pulls recorded; first download missing |
| Serial preparation controller | 7468.163 s | Contains downloads and controls above; do not add them together; earlier setup excluded |
| Developer agent | Historical 855,276 tokens / 8868 s; later stale meter 966,271 / 10,189 s | Both preparation-era checkpoints; current resumed work unmetered; not provider usage or bill |
| CI | Separate PR check receipts | No inference; see publication status below |

Overall campaign wall time and money are not fully measured by these partial
receipts. Historical pilot costs are not added here. No successful earlier check
was rerun merely because the budget wording changed.

## Publication, verification and retained evidence

Public files include the unchanged [PLAN](PLAN.md), [selection](selection.json),
[preparation](preparation.json), [frozen manifest](frozen-manifest.json), all sixty
[slot records](results.json), [costs](costs.json), and the three exact prediction
files [P](predictions/P.jsonl), [C](predictions/C.jsonl), [T](predictions/T.jsonl).
[Artifact hashes and official outcome summaries](artifact-manifest.json) bind
predictions to official provenance and original per-instance result hashes.
Private raw logs, captures, hidden benchmark lists and host runtime data are not
published. Public predictions contain complete model patches, including tests.

Freeze was committed before the first request. The retained private freeze SHA-256
is `111cd723b51489574bd5705bf0046d8b54ee5719b0ce9a12730287b96722fa72`.
Real first-request receipts verified complete task bytes, actual model/effort and
the intended P/C/T instructions and entry points. No availability probe ran.

The last full local pre-freeze verification had 17 passing checks and one failure
in the unchanged sensitivity cancellation fixture, whose exact child was later
verified absent. This is not reported as an all-green aggregate. The later compact
manifest change passed its model-free compatibility and input-refusal checks.
SENSITIVITY stayed disabled in this campaign. Official evaluation, model quality,
local fixtures and remote CI are separate evidence categories.

Final `npm run verify:evaluation` passed with loopback access (zero provider
requests). The first sandbox invocation failed at recorder `listen EPERM`; its
fixture was archived and removed. Publication assertions independently compared
all 27 prediction hashes to official provenance/results, checked all 60 unique
assignments and null unstarted scores, verified R/T/D totals and stop facts, and
checked changed Markdown links and whitespace. No evaluator or model run was
repeated for these checks.

The existing [PR #26](https://github.com/Tah10n/opencode-harness/pull/26) carries
this result on `eval/polybench-consolidated`. Its current-head remote checks and
review disposition are reported on the PR; earlier CI at `82ef535c` is historical,
not final-head evidence. Merge requires both passing checks and a counting
approval. No approval existed at publication preflight; protection is not bypassed.

[Cleanup receipts](cleanup.json) record the verified private archive: 34,075 files,
233,688,405 compressed bytes, SHA-256
`785518ca4bb4a4f4726f6af57f0e588c615e42124f4d2a6f14c9b2a3e6d60ee0`.
Every member was read back and checked against its source hash/link target.
Raw evidence is preserved privately; it is not a new development archive in Git.

Final cleanup removed 19,312,095,232 allocated bytes of prepared sources,
dependencies, Electron copies, evaluator/toolchain installations and temporary
caches, plus 959,774,720 bytes of verified duplicate evidence. The campaign
working directory was 97,140,736 allocated bytes at that checkpoint; the separate
archive is additional. These are local directory measurements, not a global disk
usage claim. Earlier removal of 34 redundant extraction archives
(14,087,055,360 bytes) is historical and not added to this final-cleanup figure.

All 38 owned Docker images are verified absent, with no own author/evaluation
container remaining. An exact allowlist removed 231 owned build-cache records;
Docker reported 25.82 GB reclaimed, with zero owned records left. Image layers
and cache storage can overlap, so image virtual sizes are not added to reclaimed
cache bytes. Pre-existing images, unrelated containers and other build-cache IDs
were not targeted. No global prune, branch deletion, model restart or pause
removal occurred. Small receipts and the pause remain locally; the raw archive
retains the original failed capture facts and later verified recovery separately.
