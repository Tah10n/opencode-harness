# Blind selection of six retained V3 patch pairs

**Luna selected four acceptable existing patches out of six tasks, timed out without a decision once, and selected an incomplete patch once. The measured selector did not improve complete delivery over either historical arm (4/6 each).** It found both real one-sided behavioral differences without the evaluator, but finished only one of those two selections. It failed to reject the pair in which neither delivery was complete. This is evidence of useful local diagnosis, not a confirmed reliable selection mechanism or general product lift.

Exactly six fresh selection sessions ran with **OpenCode 1.18.26, openai/gpt-5.6-luna, high, 300 seconds including tools**. New author implementations, corrections/H1 variants, selection retries, response repair calls, stronger judges, and independent new tasks: **0**. Historical V3 results and artifacts are unchanged.

## Actual choices and candidate quality

Acceptance below is the **saved V3 full-patch acceptance**, including preserved behavior and required delivered tests/docs. Mapping was frozen before the first provider request and withheld from all six sessions. The report reveals it after every selector container terminated.

| Task | X | Y | Luna's actual decision | Selected patch acceptable? | Complete patch existed? |
| --- | --- | --- | --- | --- | --- |
| protocol-error-api | P: yes | H: yes | X / P | Yes | Yes |
| catalog-cache | H: no | P: yes | Y / P | Yes | Yes |
| legacy-runtime-reload | P: no | H: yes | No completed decision: deadline | No delivery | Yes |
| reconnect-revoked | H: yes | P: yes | X / H | Yes | Yes |
| request-module-extraction | P: yes | H: yes | X / P | Yes | Yes |
| dual-config | H: no | P: no | X / H | **No** | **No** |

- **A — Available candidates:** 8/12 acceptable patches; P 4/6 and H 4/6. Three pairs have two acceptable deliveries, two have exactly one, one has none.
- **B — Actual selection:** 5/6 completed decisions, 4/6 acceptable selected deliveries, 1/6 incorrect selection, 1/6 unfinished selection. Neither explicit rejection nor insufficient-evidence decisions were returned. Four of the five emitted choices select acceptable bytes; this conditional fraction does not erase the timeout.
- **C — Oracle bound:** perfect knowledge could select an acceptable patch on 5/6 tasks and reject both on the sixth. That computed maximum is **not** the observed result. Actual selection recovers 4/5 available complete deliveries.

[Machine-readable results](results.json) bind every X/Y input and selected patch to its full SHA-256, link the original final patch paths, and preserve exact executed shell commands, working directories, exit codes, resource counters, and stop facts. No winner was assembled or repaired.

## What the selectors actually established

**Catalog, one acceptable candidate — completed correct selection.** With the same inline probe and separate TMPDIRs, X/H's `selectCatalog(catalog)` returned `[]` for region-bearing items; Y/P returned the original all-items representation. The baseline source defines the omitted-argument behavior. Both ordinary suites were green, including X's larger suite; Luna chose Y because of this observed compatibility difference, not test count. The paired probe failed at its first preservation assertion on X and completed on Y; later assertions in X's probe were consequently not executed.

**Legacy runtime, one acceptable candidate — useful diagnosis, failed completion.** The same diagnostic constructed the exact historical flat layout under separate temporary homes and called `prepareRuntime(retainedLegacyLauncherURL)`. X/P failed with ENOENT while copying `lib/connection-lifecycle.mjs` from the old tree; Y/H installed the current runtime and retained the old launcher. Luna described that distinction before the deadline. It then exhausted 300 seconds without a `DECISION` line. Recognized behavioral differences: **2/2** one-sided pairs; completed correct selections: **1/2**. The partial legacy answer is not converted into an inferred Y choice.

**Dual config, neither acceptable — incorrect selection.** Luna selected X/H because it delivered more direct negative tests through both render consumers and described both implementations as satisfying the runtime contract. It missed X/H's absent ESM-render `pretty + indent:0` regression and removal of the old ESM compact-render assertion. Y/P retains those cases but omits required negative tests through both actual render consumers. These are the saved acceptance reasons from the original task's explicit requirements, not new rules. The selector's external diagnostic also omitted ESM-render `pretty + indent:0`; its green matrix does not supply a missing delivered test. The model did not explicitly say it was forced to choose, but it still returned an unacceptable delivery where rejection was required.

**The three both-acceptable pairs remain ties in full acceptance.** Protocol selected X/P after passing real consumer tests; its targeted pairing/control-character/retry cases are a coverage preference, not a newly established correctness win over Y. Reconnect selected X/H, whose delivered test observes cleanup at pairing start and retains the full local registry/identity; both production paths remain accepted. Extraction selected X/P with documentation/export-surface objections to Y; no production failure in Y was established, and this report does not turn those objections into a new rejection criterion.

## Checks and execution limitations

| Task | Ordinary checks actually executed on both | Additional evidence |
| --- | --- | --- |
| protocol-error-api | Full connector `npm test`: X 158 passed + 5 skipped; Y 157 + 5. Same focused config pattern: 5 and 4 tests passed. | Read/diff review of protocol, CLI consumers, supplied tests and docs. |
| catalog-cache | `npm test`: X 8 passed, Y 6; base 2. | Identical selector/handler/client probe: X fails preserved omitted-argument call; Y passes. |
| legacy-runtime-reload | Config/state-security/executables/hook-security tests: X 94 passed + 2 skipped; Y 95 + 2. Full connector suites: X 159 + 5; Y 160 + 5. | Identical legacy-launcher and runtime-mode probes; actual legacy difference above. No final choice. |
| reconnect-revoked | Config tests: 79/79 each; full connector suites: 161 passed + 5 skipped each; each candidate's named revoked-connect test: 1/1. | Read/diff review of cleanup timing and delivered state assertions. An initial misplaced filter ran the full config file, not just its intended subset. |
| request-module-extraction | Full connector suites: X 160 passed + 5 skipped; Y 161 + 5. Targeted runtime/retry command: 4 results each. | Final isolated installed CLI `--version` probe passed both. It proves loading, not an extra HTTP request through that installed executable. |
| dual-config | `npm test`: X 4 passed, Y 3. | Same external option/render matrix passed both, but did not establish complete delivered coverage. |

All twelve `git apply --check` calls exited 0. `git diff --no-index --check` returned **1 with empty output** because the trees differ; no whitespace diagnostics were emitted. Protocol's three `git status` attempts failed with 128 on the deliberately git-free canonical inputs. These exit codes are retained, not flattened to success.

Two preparation/runtime limitations matter. First, the native `apply_patch` permission matcher rejected diagnostic-file writes (four errors across catalog, legacy and extraction), despite the configured diagnostic allow pattern; permitted inline Node/bash probes remained available equally. A missing-file `read` in extraction was also retained. No permissions or prompts were changed mid-series. Second, extraction's first additional runtime probe omitted separate state roots, so X and Y collided in `/work/home/.viberacing`; its over-escaped assertion also rejected a correct version string. **That probe violated diagnostic-state separation and is excluded as comparative evidence.** The selector subsequently used separate X/Y state roots on both candidates, corrected the escaping within the same session, and obtained two passes. These are diagnostic attempts within one selection, not new selector runs. The malformed probes and their costs remain recorded. Preparation proved separate directories existed; it did not enforce every model-authored process's HOME/state environment.

The full web/database/platform matrix was unavailable; five platform-specific skips occur in each full connector suite. No matrix or manual Actions run was launched for this experiment, and existing mandatory CI controls were not changed. No extra requirements, production repair, or rerun was introduced after observing these limitations.

## Resources

| Task | Selection seconds | Provider requests | Native tools | Observed input tokens | Observed output tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| protocol-error-api | 246.572 | 13 | 59 | 626,485 | 9,793 |
| catalog-cache | 213.204 | 11 | 41 | 177,703 | 10,297 |
| legacy-runtime-reload | 300.155 | 15 | 51 | ≥776,320 | ≥11,364 |
| reconnect-revoked | 233.892 | 18 | 57 | 945,956 | 7,370 |
| request-module-extraction | 295.384 | 18 | 54 | 935,912 | 11,492 |
| dual-config | 196.733 | 10 | 35 | 141,327 | 9,271 |
| **Total** | **1,485.940** | **85** | **297** | **≥3,603,703** | **≥59,587** |

Observed cached input: **≥811,520**; reasoning output: **≥37,837**, included in the respective input/output counters. Usage is present for 84/85 requests; the deadline-cancelled legacy request remains unknown. The 300.155-second observation includes termination overhead after the 300-second deadline. Preparation/container setup is separate from selection time. All six native sessions had no child sessions, all forwarded model requests were Luna/high, and all six containers were verified absent. Legacy's local execution stopped and forwarding closed; provider-side completion of its last cancelled request remains unknown under the existing managed-deadline rules.

Already-created patches are not free: V3 candidate generation used **322 requests, 588 tools, 4,622.13 seconds, 22,402,676 input and 177,985 output tokens**. This selection adds the costs above. It does not measure the complete path of generating two fresh independent solutions. Monetary price cannot be derived from OAuth usage and is not reported.

## Preparation and interpretation

Before the first request, the task order, balanced X/Y mapping, [single prompt](PROMPT.md), initial/candidate bytes and executable modes, launcher and dependencies were frozen. P is X three times and Y three times. All 7,743 frozen files remained unchanged. Prompt SHA-256: `81210ad6503bed13f8118fb936ca703f9bbda1167f6cf13d6582c6408cb7a690`.

Each session received only public original task/source, separately applied X/Y deliveries, exact diffs and ordinary tests. The existing `--init` container used read-only `/input`, no external network or extra capabilities, fresh native state, and separate diagnostic directories. Mapping, saved grades, evaluator/reference/alternative trees, prior explanations, research history and host credentials were not mounted. The host relay used the existing OpenCode OAuth; its expired access token was refreshed before model work without a model request.

Preparation verified copies against the retained final deliveries, and create/overwrite/chmod/rename attempts failed with EROFS for base/X/Y. The unchanged installed scripted preflight passed: **8 local fixture requests, 0 OpenAI calls**. Node 24.19.0, npm 11.17.0 and offline pnpm 11.7.0 were verified in all six environments. Corepack initially tried a latest-version lookup for the small fixture; pinning its already-cached version in the experiment-only cache fixed preparation before any model work, without changing task, source, tests or prompt. The later runtime limitations above remain part of the measured result.

**Selector-export sensitivity:** excluding the disputed omitted-argument export boundary would make catalog X/H acceptable too, so the alternative candidate inventory is H 5/6 versus P 4/6. Actual selected acceptable deliveries still remain **4/6**, and the oracle remains **5/6**. Catalog then becomes a both-acceptable tie; the only uniquely solvable pair is legacy, whose choice did not finish. The negative product conclusion is unchanged. This is sensitivity analysis, not a rewrite of published V3 P4/6 and H4/6.

**Product decision:** do not promote this selector as a demonstrated complete-delivery improvement. It found real behavior differences without grader hints, but missed a required rejection and failed to turn one diagnosis into a timely delivery. If a future complete-path study is separately authorized, the minimal candidate mechanism remains **two independent native solutions by the same Luna → factual comparison → one original patch or explicit no acceptable result**. That scheme was not implemented end to end here. It needs new tasks and accounting for both generation costs; these six previously studied development pairs prove no general lift. No third candidate, stronger judge, additional reviewer, new H1, correction chain, merge, release or default change follows automatically.

The small [selection runner](run-selection.mjs) reuses the existing native phase launcher and the utility scheduler's provider/deadline/stop logic. [Preparation](prepare.mjs) and [container checks](container-setup.mjs) are experiment-only, using retained local V3 inputs; they are not an installed product mode. Raw sessions and full trees stay in ignored `local/native-task-selection-20260912/`. The historical archive is untouched.
