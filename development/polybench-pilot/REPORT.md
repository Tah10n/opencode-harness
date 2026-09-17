# SWE-PolyBench Verified pilot results

**Decision: no positive product signal and no demonstrated TYPE_COMPAT contribution.** H1 ties P on both official resolved and D_bench on all six observed pairs. The ten-task pilot is incomplete: the existing unknown-submission policy closed admission after slot 18. No continuation, replacement, default change or further campaign was performed.

Assigned: 30 slots on 10 paired tasks; submitted and officially evaluated: 18 slots on six tasks. Slots 19–30 are not_started and unknown. The last H0 request returned HTTP 200 but was aborted at the task deadline before terminal server evidence/usage was observed. Local processes, capture and relay cleanup are verified; remote completion and usage for that one request remain unknown. Launcher outcome is paused, not a successful 30-run completion.

Runtime: `e18db1fe10223db52dcc05b3e769bca140367c2b`; preparation freeze commit: `39e2fda17606370a6c2cdcaf1ce287f59d6654cb`. [Manifest](frozen-manifest.json), [plan](PLAN.md) and [run instructions](README.md) retain exact revisions, images, inputs and all 30 slots.

Official resolved R is primary. T requires autonomous applicable delivery and verified native/container stop. D_bench = R and T. Unknowns are not failures.

| Arm | Started | R true | R false | R unknown | T true | D_bench true |
|---|---:|---:|---:|---:|---:|---:|
| P | 6 | 1 | 5 | 4 | 6 | 1 |
| H0 | 6 | 0 | 6 | 4 | 4 | 0 |
| H1 | 6 | 1 | 5 | 4 | 5 | 1 |

| Comparison | Metric | Wins | Losses | Ties | Unknown pairs |
|---|---|---:|---:|---:|---:|
| H1-P | R | 0 | 0 | 6 | 4 |
| H1-P | D_bench | 0 | 0 | 6 | 4 |
| H0-P | R | 0 | 1 | 5 | 4 |
| H0-P | D_bench | 0 | 1 | 5 | 4 |
| H1-H0 | R | 1 | 0 | 5 | 4 |
| H1-H0 | D_bench | 1 | 0 | 5 | 4 |

## All assigned slots

| Slot | Instance / repository | Language / category | Arm | R | T | D_bench | Evaluation / stop | Requests / author seconds | Input / output tokens |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | serverless__serverless-2434 / serverless/serverless | JavaScript / Bug Fix | P | false | true | false | official_result / normal native completion | 23 / 301.0 | 929460/10169 |
| 2 | serverless__serverless-2434 / serverless/serverless | JavaScript / Bug Fix | H0 | false | true | false | official_result / normal native completion | 46 / 909.4 | 2531834/18070 |
| 3 | serverless__serverless-2434 / serverless/serverless | JavaScript / Bug Fix | H1 | false | true | false | official_result / normal native completion | 35 / 711.7 | 1890554/15203 |
| 4 | serverless__serverless-6534 / serverless/serverless | JavaScript / Bug Fix | H0 | false | true | false | official_patch_rejected / normal native completion | 37 / 595.7 | 1634963/9347 |
| 5 | serverless__serverless-6534 / serverless/serverless | JavaScript / Bug Fix | H1 | false | true | false | official_patch_rejected / normal native completion | 21 / 494.5 | 811952/6713 |
| 6 | serverless__serverless-6534 / serverless/serverless | JavaScript / Bug Fix | P | false | true | false | official_patch_rejected / normal native completion | 30 / 337.2 | 1051019/8564 |
| 7 | serverless__serverless-6842 / serverless/serverless | JavaScript / Feature | H1 | false | true | false | official_result / normal native completion | 22 / 424.5 | 703242/6876 |
| 8 | serverless__serverless-6842 / serverless/serverless | JavaScript / Feature | P | false | true | false | official_result / normal native completion | 19 / 231.1 | 498869/6055 |
| 9 | serverless__serverless-6842 / serverless/serverless | JavaScript / Feature | H0 | false | true | false | official_patch_rejected / normal native completion | 37 / 667.7 | 1855563/11033 |
| 10 | sveltejs__svelte-5452 / sveltejs/svelte | JavaScript / Bug Fix | P | true | true | true | official_result / normal native completion | 62 / 838.6 | 4418663/17024 |
| 11 | sveltejs__svelte-5452 / sveltejs/svelte | JavaScript / Bug Fix | H0 | false | false | false | official_empty_patch / Aborted; Native permission boundary rejected a tool; no further continuation admitted | 24 / 626.9 | 1472711/8080 |
| 12 | sveltejs__svelte-5452 / sveltejs/svelte | JavaScript / Bug Fix | H1 | true | true | true | official_result / normal native completion | 34 / 951.0 | 1764471/12872 |
| 13 | mui__material-ui-20356 / mui/material-ui | TypeScript / Bug Fix | H0 | false | true | false | official_result / normal native completion | 38 / 1221.3 | 2728366/13383 |
| 14 | mui__material-ui-20356 / mui/material-ui | TypeScript / Bug Fix | H1 | false | true | false | official_patch_rejected / normal native completion | 30 / 1137.3 | 1419892/10557 |
| 15 | mui__material-ui-20356 / mui/material-ui | TypeScript / Bug Fix | P | false | true | false | official_patch_rejected / normal native completion | 19 / 645.9 | 617205/5835 |
| 16 | sveltejs__svelte-1190 / sveltejs/svelte | JavaScript / Refactoring | H1 | false | false | false | official_patch_rejected / hard_deadline | 67 / 1800.0 | 9416326/27582 |
| 17 | sveltejs__svelte-1190 / sveltejs/svelte | JavaScript / Refactoring | P | false | true | false | official_patch_rejected / normal native completion | 73 / 1122.6 | 8239864/31635 |
| 18 | sveltejs__svelte-1190 / sveltejs/svelte | JavaScript / Refactoring | H0 | false | false | false | official_patch_rejected / hard_deadline | 75 / 1800.1 | 10794711/32648 (partial) |
| 19 | mui__material-ui-18141 / mui/material-ui | TypeScript / Bug Fix | P | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 20 | mui__material-ui-18141 / mui/material-ui | TypeScript / Bug Fix | H0 | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 21 | mui__material-ui-18141 / mui/material-ui | TypeScript / Bug Fix | H1 | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 22 | coder__code-server-4923 / coder/code-server | TypeScript / Feature | H0 | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 23 | coder__code-server-4923 / coder/code-server | TypeScript / Feature | H1 | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 24 | coder__code-server-4923 / coder/code-server | TypeScript / Feature | P | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 25 | microsoft__vscode-136347 / microsoft/vscode | TypeScript / Bug Fix | H1 | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 26 | microsoft__vscode-136347 / microsoft/vscode | TypeScript / Bug Fix | P | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 27 | microsoft__vscode-136347 / microsoft/vscode | TypeScript / Bug Fix | H0 | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 28 | mui__material-ui-17301 / mui/material-ui | TypeScript / Refactoring | P | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 29 | mui__material-ui-17301 / mui/material-ui | TypeScript / Refactoring | H0 | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |
| 30 | mui__material-ui-17301 / mui/material-ui | TypeScript / Refactoring | H1 | unknown | unknown | unknown | not_started / not_started | 0 / unknown | unknown/unknown |

## Distribution

| Group | Value | Tasks | P R/D; evaluated/assigned | H0 R/D; evaluated/assigned | H1 R/D; evaluated/assigned |
|---|---|---:|---|---|---|
| repo | coder/code-server | 1 | 0/0; 0/1 | 0/0; 0/1 | 0/0; 0/1 |
| repo | microsoft/vscode | 1 | 0/0; 0/1 | 0/0; 0/1 | 0/0; 0/1 |
| repo | mui/material-ui | 3 | 0/0; 1/3 | 0/0; 1/3 | 0/0; 1/3 |
| repo | serverless/serverless | 3 | 0/0; 3/3 | 0/0; 3/3 | 0/0; 3/3 |
| repo | sveltejs/svelte | 2 | 1/1; 2/2 | 0/0; 2/2 | 1/1; 2/2 |
| language | JavaScript | 5 | 1/1; 5/5 | 0/0; 5/5 | 1/1; 5/5 |
| language | TypeScript | 5 | 0/0; 1/5 | 0/0; 1/5 | 0/0; 1/5 |
| task_category | Bug Fix | 6 | 1/1; 4/6 | 0/0; 4/6 | 1/1; 4/6 |
| task_category | Feature | 2 | 0/0; 1/2 | 0/0; 1/2 | 0/0; 1/2 |
| task_category | Refactoring | 2 | 0/0; 1/2 | 0/0; 1/2 | 0/0; 1/2 |

## Repository sensitivity

Wins/losses/ties/unknown pairs after omitting each repository. [Full values](results/repository-sensitivity.json).

| Omitted repository | Comparison | R W/L/T/U | D_bench W/L/T/U |
|---|---|---|---|
| coder/code-server | H1-P | 0/0/6/3 | 0/0/6/3 |
| coder/code-server | H0-P | 0/1/5/3 | 0/1/5/3 |
| coder/code-server | H1-H0 | 1/0/5/3 | 1/0/5/3 |
| microsoft/vscode | H1-P | 0/0/6/3 | 0/0/6/3 |
| microsoft/vscode | H0-P | 0/1/5/3 | 0/1/5/3 |
| microsoft/vscode | H1-H0 | 1/0/5/3 | 1/0/5/3 |
| mui/material-ui | H1-P | 0/0/5/2 | 0/0/5/2 |
| mui/material-ui | H0-P | 0/1/4/2 | 0/1/4/2 |
| mui/material-ui | H1-H0 | 1/0/4/2 | 1/0/4/2 |
| serverless/serverless | H1-P | 0/0/3/4 | 0/0/3/4 |
| serverless/serverless | H0-P | 0/1/2/4 | 0/1/2/4 |
| serverless/serverless | H1-H0 | 1/0/2/4 | 1/0/2/4 |
| sveltejs/svelte | H1-P | 0/0/4/4 | 0/0/4/4 |
| sveltejs/svelte | H0-P | 0/0/4/4 | 0/0/4/4 |
| sveltejs/svelte | H1-H0 | 0/0/4/4 | 0/0/4/4 |

## Evaluation and stop evidence

All 18 captured patches strictly apply to their clean author baseline (including the empty delivery). The official evaluator first applies its test_patch, then the unchanged model patch with its original application procedure. Nine nonempty patches are rejected in that context: all three serverless-6534 and svelte-1190 patches, H0 serverless-6842, and P/H1 material-ui-20356. The strict observations identify conflicts in test files or expected fixtures. These are official patch-application outcomes, not proven semantic implementation failures; no production-only patch was manufactured for a different score. Strict and official acceptance agree on these cases. [Original official outputs and application observations](results/official/) are retained.

One empty H0 delivery on svelte-5452 takes the evaluator's documented no-test early return. Eight other patches execute tests: two resolve and six remain unresolved. All three evaluator processes exit 0; no missing per-instance output, image pull failure, parser failure or evaluation timeout was observed. Tests were never rerun to select a better result.

| Task | P passed/failed | H0 passed/failed | H1 passed/failed |
|---|---|---|---|
| serverless-2434 | 27/2 | 25/2 | 26/2 |
| serverless-6534 | no tests: patch rejected | no tests: patch rejected | no tests: patch rejected |
| serverless-6842 | 25/3 | no tests: patch rejected | 25/3 |
| svelte-5452 | 3066/1 | no tests: empty patch | 3066/1 |
| material-ui-20356 | no tests: patch rejected | 63/2 | no tests: patch rejected |
| svelte-1190 | no tests: patch rejected | no tests: patch rejected | no tests: patch rejected |

The remaining svelte-5452 test failure is compatible with official resolved=true; gold also retains a failure outside the deciding set. R is not a claim that every test passes. The retained official failed-test lists explain unresolved tested patches.

Three T failures are separate from scoring: H0 svelte-5452 requested a grep of `/work/repo` outside its nested delivery worktree and hit the unchanged native permission boundary; H1 and H0 svelte-1190 exceeded the 1800-second deadline. The last H0 cancellation additionally left one provider submission unknown and closed later admission. No Docker failure or provider overload was observed. The sole H1–H0 win is svelte-5452, where H0 aborted with an empty patch; it does not establish a TYPE_COMPAT repair effect. Removing Svelte removes every observed between-arm R/D difference. H1 never beats P under any repository omission.

## TYPE_COMPAT

Among six real H1 attempts: five unsupported surfaces and one preparation-error; zero successful baseline admissions, zero compiler analyses, zero incompatibilities, zero diagnostic blocks in actual author HTTP inputs, and zero evidence-to-repair chains. All 692 captured requests were inspected, with received blocks deduplicated by tool call and output digest. [Accounting](results/accounting.json) preserves each actual status and receipt count. The four unstarted H1 slots have no real coverage outcome.

**Preparation limitation:** svelte-5452's original official image contains generated `types/runtime/index.d.ts`, but the clean baseline author archive omitted it. Its preparation-error is a setup limitation, not proof that the original project is intrinsically unsupported. This was discovered after freeze/real execution began, disclosed and retained without changing inputs or retrying. All three arms received the same archive. Thus the observed zero diagnostic coverage cannot be presented as an uncontaminated estimate of TYPE_COMPAT applicability to the original benchmark environments. The other nine scripted preflights reported unsupported; the supported old recorder fixture is model-free preparation evidence only and was never included in author inputs.

## Resource accounting

[Provider accounting](results/provider-accounting.json) verifies every captured request uses `gpt-5.6-luna` with reasoning `high`: 692 requests, including 18 titles and 674 work requests. Of these, 691 have usage; one H0 request has unknown usage and server completion. No availability probes, paid smoke, reviewer, replacement or continuation requests occurred.

| Arm | Requests | Author seconds | Observed input | Observed output | Cached input subset | Reasoning output subset |
|---|---:|---:|---:|---:|---:|---:|
| P | 226 | 3476.442 | 15755080 | 79282 | 14555136 | 41793 |
| H0 | 257 | 5821.070 | 21018148 + unknown | 92561 + unknown | 17055744 + unknown | 49801 + unknown |
| H1 | 209 | 5519.176 | 16006437 | 79803 | 14687232 | 42809 |

Observed totals: 52,779,665 input and 251,646 output tokens, plus one unknown request. Cached input 46,298,112 and reasoning output 134,403 are subsets, not extra totals. Monetary charges are unknown. Author durations sum to 14,816.688 seconds; container preparation and official evaluation are separate. TYPE_COMPAT executed zero compiler analyses; baseline admission inspections remain visible per slot, not charged again as model work.

[Resource accounting](results/resource-accounting.json) retains recorded durations separately: eight image pulls 2143.737 seconds; eight gold records 768.527 seconds; seven baseline records 322.252 seconds. These are partial accounting, not totals for all preparation: unrecorded pulls, controls, extraction, dependency preparation, Electron setup and failed preparation attempts have unknown durations. All ten gold and genuine baseline controls did run successfully after documented technical preparation; their outputs are retained in [controls](results/controls/). Initial VS Code missing-Electron gold failed with zero tests and was preserved before the justified model-free technical rerun. See [preparation notes](preparation-notes.json).

Scripted preparation has 53 run directories with request records and 314 fake requests, zero real provider requests. Fifty recorded run durations sum to 1735.379 seconds; three and earlier failures without request records have unknown durations. Official model evaluation took P 149.938, H0 72.828 and H1 151.793 seconds, 374.559 total, after the model launcher stopped. These time categories can overlap in preparation and must not be summed into an invented bill. Developing-agent counters are recorded separately in the final validation evidence and are not benchmark provider tokens or billing evidence.

## Interpretation and limits

Only six of ten assigned paired public tasks were observed: five JavaScript and one TypeScript, from three repositories (Serverless, Svelte and MUI). Four TypeScript tasks across MUI, Code Server and VS Code remain unknown. The full planned language/repository coverage was not achieved. Eighteen runs are not eighteen independent tasks. No narrow uncertainty interval is justified from this clustered, truncated sample.

There is no positive pilot signal under the frozen rule requiring H1 to beat P on both R and D_bench. H1's tie with P and absence of any delivered TYPE_COMPAT analysis give no component lift evidence. This partial result does not close the broader goal of improving model quality. Defaults stay unchanged and TYPE_COMPAT remains experimental; this task authorizes no next campaign or continuation after the admission stop.

Public tasks are not guaranteed unseen, and this is not a full Verified leaderboard score. Any later tuning on them makes them development evidence rather than a confirming holdout. Official resolved does not establish universal correctness or a broader Q rubric. Historical results and measured runtime remain unchanged. Historical PROCESS_CONTAINMENT_UNAVAILABLE of the general verifier is not repaired; local container evidence is not a full CI pass.

## Validation and publication scope

[Final validation](results/validation.json) records selection/schedule/export checks, all frozen hashes, original patch/prediction/official-result byte equality, independent paired arithmetic, actual provider model/effort checks, syntax and bounded diff review. [Developing-agent counters](results/developing-agent-accounting.json) are a pre-publication snapshot, separate from benchmark provider usage and not a monetary invoice. The report-packaging name-shadowing failure was repaired without rerunning models or official evaluation. All recorded batch author containers and campaign-labelled evaluator containers are gone; useful local reproduction inputs remain.

Publication targets the existing draft PR #25 and its unchanged base. Automated checks remain enabled; their remote status is reported separately from these local checks. No merge, release, package publication, leaderboard submission or manual Actions run is included.
