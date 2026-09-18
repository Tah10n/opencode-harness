# Native task utility development

The retained native implementation is **`afa20bff3283fad5aeacf7b840f8e6affa7396f8`**: conflicting native tool calls wait in order instead of failing admission. The latest measured execution revision is **v3, `3a5699bf3c6f34ea94edbeff7f6b9a5be98cc00f`**, which fixes container orphan reaping for both arms without changing the native runtime or prompts. It remains experimental. **The requested useful autonomous advantage was not achieved.**

| Version | P full patches | H full patches | H wins / losses / ties | H autonomous complete delivery |
| --- | --- | --- | --- | --- |
| v1 recovery baseline `cac39a00` | 6/6 | 2/6 | 0 / 4 / 2 | 0/6 |
| v2 admission queue `afa20bff` | 5/6 | 4/6 | 0 / 1 / 5 | 2/6 |
| v3 container init `3a5699bf` | 4/6 | 4/6 | 1 / 1 / 4 | 0/6 |

H minus P is −66.7 percentage points in v1, −16.7 in v2 and 0 in v3. These are separate six-case development observations, not independent estimates, proof of equivalence or causal attribution. All **36/36 authorized development runs** are complete, with no model retries. Independent pairs: **0**. V3 wins on legacy migration but loses on catalog compatibility; both dual-config patches lack explicitly required consumer tests. No version satisfies the unchanged gate. The original 24 runs and the separately authorized additional 12 are exhausted; no further revision or author attempt is started.

[Install, invoke `/harness-task`, and apply its terminal patch](../../docs/native-task/README.md#install-and-use). The model and effort remain caller choices. The [revision rationale](REVISION.md) was recorded before editing; the runtime and H1 instruction bytes then remained frozen throughout v2. See [method and acceptance](METHOD.md), [v1 plan](plan.json), [v2 plan](plan-v2.json), [v1 results](results-v1.json), [v2 results and counters](results-v2.json), [revision checks](revision-validation.json), [v2 preservation/application checks](validation-v2.json), [v3 plan](plan-v3.json), [v3 results and counters](results-v3.json), and [v3 preservation/application checks](validation-v3.json).

## Authorized follow-up

After the original stop, the user authorized **one additional revision and twelve fresh development runs**, raising the total development allowance to 36. The completed v3 comparison corrects a reproduced container defect: the relay ran as PID 1 and left exited scheduler descendants as zombies. Docker `--init` now reaps them; termination retains only the exact relay PID reported at trusted startup and still stops every workload. A process-state parser regression found during the one review is fixed with an executable regression.

The native harness runtime, H1, author/correction prompts, model, effort, 900-second deadline, tasks, order and gate remain unchanged. Both P and H receive the corrected environment. This is an execution-environment revision, not evidence of a semantic harness improvement. The [rationale](REVISION-V3.md) preceded the edit; [local validation](revision-v3-validation.json) is separate from the model comparison. Original v1/v2 outcomes stay intact. A previously disclosed legacy reference defect is corrected only in new private calibration copies before scoring; author snapshots and acceptance contracts are unchanged.

## Patch results

Every linked patch applies independently at its task's initial snapshot. `pass` includes required behavior, preserved contracts, necessary delivered tests and documentation; it does not imply autonomous workflow completion. D0 means the initially completed author solution. A missing D0 is not fabricated from an interrupted tree.

### V3

| Task | P final | H D0 | H final | H delivery outcome |
| --- | --- | --- | --- | --- |
| protocol-error-api | [pass](patches/v3/protocol-error-api-P-final.patch) | [pass](patches/v3/protocol-error-api-H-D0.patch) | [pass](patches/v3/protocol-error-api-H-final.patch) | Incomplete; no current successful check, two corrections; pnpm download failure retained |
| catalog-cache | [pass](patches/v3/catalog-cache-P-final.patch) | [fail](patches/v3/catalog-cache-H-D0.patch) | [fail](patches/v3/catalog-cache-H-final.patch) | Checks passed, but old exported `selectCatalog(catalog)` behavior regressed |
| legacy-runtime-reload | [fail](patches/v3/legacy-runtime-reload-P-final.patch) | [pass](patches/v3/legacy-runtime-reload-H-D0.patch) | [pass](patches/v3/legacy-runtime-reload-H-final.patch) | Correct migration; incomplete because pnpm download failure remains unclassified |
| reconnect-revoked | [pass](patches/v3/reconnect-revoked-P-final.patch) | [pass](patches/v3/reconnect-revoked-H-D0.patch) | [pass](patches/v3/reconnect-revoked-H-final.patch) | Correct cleanup before pairing; incomplete because pnpm download failure remains unclassified |
| request-module-extraction | [pass](patches/v3/request-module-extraction-P-final.patch) | [pass](patches/v3/request-module-extraction-H-D0.patch) | [pass](patches/v3/request-module-extraction-H-final.patch) | Incomplete; retained early missing-module test failure and pnpm download failure |
| dual-config | [fail](patches/v3/dual-config-P-final.patch) | [fail](patches/v3/dual-config-H-D0.patch) | [fail](patches/v3/dual-config-H-final.patch) | Checks passed; ESM pretty+indent:0 regression missing and old ESM compact render assertion removed |

All six H runs produced terminal patches and D0s without an outer deadline or observer reconstruction. Four D0s and four finals are accepted; the two protocol corrections do not convert a failed D0 to a successful final. The two `checks_passed` tasks fail independent full acceptance, while the four acceptable patches have `incomplete` workflows. Thus H has zero autonomous complete deliveries in this series. P has six native completions, four with accepted patches.

The frozen executable checks pass all six H tasks and five P tasks. Full acceptance additionally rejects H catalog and both dual-config patches. H catalog breaks the old omitted-argument selector export even though the handler, which explicitly passes null, works. The post-execution preservation check passes the initial tree, reference, valid alternative and P, and rejects both H endpoints. This new finding is recorded separately; raw grades are preserved. If that exported-helper boundary is excluded, H becomes 5/6 versus P 4/6 with one win and no reverse loss: the two-win and autonomous-delivery gate still fails. Both dual-config coverage failures follow explicit TASK wording, not an invented assertion count.

Legacy H now selects both current libraries and the current launcher, preserves the complete historical layout and verifies preparation again in a fresh process. Legacy P still reads current libraries from the retained old launcher location, with tests using the current URL. Both reconnect patches now clear pending state before pairing; H also observes the absent config/dirty/pending prerequisite at pairing start. P's later pending assertion and mismatched dirty/state fixture remain coverage limitations under the same interpretation used in v2.

The fixed init environment removes the reproduced zombie-process obstacle. It does not resolve the whole installed workflow: pnpm downloads fail inside the network-isolated container, diagnostic failures remain unclassified, and protocol's successful checks are stale after later edits. The run retains these actual failures; no new exception, network permission or fourth revision is introduced after results.

### V2

| Task | P final | H D0 | H final | H delivery outcome |
| --- | --- | --- | --- | --- |
| protocol-error-api | [pass](patches/v2/protocol-error-api-P-final.patch) | [pass](patches/v2/protocol-error-api-H-D0.patch) | [pass](patches/v2/protocol-error-api-H-final.patch) | Incomplete; unresolved broad config checks, three corrections, outer deadline; terminal patch retained |
| catalog-cache | [pass](patches/v2/catalog-cache-P-final.patch) | [pass](patches/v2/catalog-cache-H-D0.patch) | [pass](patches/v2/catalog-cache-H-final.patch) | Checks passed; no correction |
| legacy-runtime-reload | [fail](patches/v2/legacy-runtime-reload-P-final.patch) | [fail](patches/v2/legacy-runtime-reload-H-D0.patch) | [fail](patches/v2/legacy-runtime-reload-H-final.patch) | Migration source path fails; deadline; final reconstructed by observer |
| reconnect-revoked | [pass](patches/v2/reconnect-revoked-P-final.patch) | [fail](patches/v2/reconnect-revoked-H-D0.patch) | [fail](patches/v2/reconnect-revoked-H-final.patch) | Pending survives revoked cleanup; unresolved scheduler checks; three corrections |
| request-module-extraction | [pass](patches/v2/request-module-extraction-P-final.patch) | unavailable | [pass](patches/v2/request-module-extraction-H-final.patch) | Native permission denial during attempted external baseline check; terminal patch, no author completion |
| dual-config | [pass](patches/v2/dual-config-P-final.patch) | [pass](patches/v2/dual-config-H-D0.patch) | [pass](patches/v2/dual-config-H-final.patch) | Checks passed; no correction |

H has three accepted D0s among five available and four accepted finals. Corrections improve some delivered tests but do not turn a failed D0 into an accepted final on these tasks. Extraction supplies an acceptable terminal capture without ever completing D0. Only catalog and dual config finish the autonomous checked path. P has six native completions, five with accepted patches. No manual intervention occurred between author stages.

Legacy fails for different reasons: H reads missing current libraries from the historical source when `prepareRuntime()` receives the retained old launcher, and permits partial historical layouts. P selects current libraries but copies the old executable; its delivered fixture masks this by using current launcher bytes. H reconnect calls `disableLocalConnection()` without `true`, leaving pending uploads before fresh pairing. Delivered tests miss these boundaries. Additional config/scheduler failures remain unresolved within H, even where independent scoped checks accept the patch. The extraction permission boundary was preserved; no new recovery exception was added.

### V1

| Task | P final | H D0 | H final | H delivery issue |
| --- | --- | --- | --- | --- |
| protocol-error-api | [pass](patches/v1/protocol-error-api-P-final.patch) | [pass](patches/v1/protocol-error-api-H-D0.patch) | [pass](patches/v1/protocol-error-api-H-final.patch) | Workflow retains check/diagnostic failures |
| catalog-cache | [pass](patches/v1/catalog-cache-P-final.patch) | [fail](patches/v1/catalog-cache-H-D0.patch) | [fail](patches/v1/catalog-cache-H-final.patch) | Legacy one-argument 304 changes return/error semantics |
| legacy-runtime-reload | [pass](patches/v1/legacy-runtime-reload-P-final.patch) | [fail](patches/v1/legacy-runtime-reload-H-D0.patch) | [fail](patches/v1/legacy-runtime-reload-H-final.patch) | Old executable copied into current runtime; observer capture after timeout |
| reconnect-revoked | [pass](patches/v1/reconnect-revoked-P-final.patch) | [fail](patches/v1/reconnect-revoked-H-D0.patch) | [fail](patches/v1/reconnect-revoked-H-final.patch) | Pending payloads survive revoked cleanup |
| request-module-extraction | [pass](patches/v1/request-module-extraction-P-final.patch) | [pass](patches/v1/request-module-extraction-H-D0.patch) | [pass](patches/v1/request-module-extraction-H-final.patch) | Workflow cannot establish final supported check evidence |
| dual-config | [pass](patches/v1/dual-config-P-final.patch) | [fail](patches/v1/dual-config-H-D0.patch) | [fail](patches/v1/dual-config-H-final.patch) | Missing explicitly required negative tests through both real consumers |

All six H workflows were incomplete; five supplied terminal patches, one reached its managed deadline. D0 and final acceptance were identical.

## Resources and evidence limits

| Series / arm | Provider requests | Native tool calls | Total elapsed seconds | Observed input / output tokens |
| --- | ---: | ---: | ---: | ---: |
| v1 P | 164 | 314 | 2,372.20 | 11,306,475 / 95,767 |
| v1 H | 257 | 392 | 3,325.14 | ≥21,567,840 / ≥126,443 |
| v2 P | 150 | 296 | 2,218.41 | 11,266,500 / 88,879 |
| v2 H | 235 | 349 | 3,251.96 | 21,412,389 / 126,779 |
| v3 P | 140 | 275 | 1,957.85 | 9,506,365 / 75,989 |
| v3 H | 182 | 313 | 2,664.28 | 12,896,311 / 101,996 |

V3 H uses 30.0% more provider requests, 13.8% more tools and 36.1% more elapsed time than its fresh P. All 322 usage records are present, with no deadline or unknown server-completion flag. V2 H uses 56.7% more provider requests, 17.9% more tools and 46.6% more elapsed time than its P. Usage includes repeated/cached input; cache and reasoning counters are in the results. Monetary charges are unavailable. V1 has one request with missing usage, retained as unknown; v2 has all 385 usage records, although the legacy timeout still leaves remote server completion uncertain. Equal 900-second deadlines are not equal token budgets. All managed timeouts have confirmed local termination/capture/cleanup; every author container is absent.

The frozen executable evaluator passed five H tasks in each original series and all six in v3. Independent full acceptance was lower. Post-v1 checks exposed missed legacy old-launcher and legacy catalog-304 contracts; the old-launcher check also rejected the calibration reference and alternative. Raw outcomes remain unchanged. These supplemental contracts were frozen before v2 and applied equally to P/H and available D0/final, without model retries. This is a disclosed evaluator gap, not a hidden rescore.

V2 P reconnect seeds pending but asserts its absence only after full connect. The reviewer proposed stricter coverage rejection; adjudication records the gap without adding an unstated per-boundary test requirement after results. Required real revoked/error scenarios are delivered, the source awaits cleanup before pairing, and the independent boundary check passes. Under that stricter reading P would be 4/6, H 4/6 and zero wins; the development gate still fails. Unspecified combined-invalid error precedence is not scored. Same-version cached-runtime replacement in extraction remains a conditional unverified concern outside the fresh-install scope declared before v2.

All 53 endpoints (18 v1, 17 v2, 18 v3) apply to separate ordinary copies without harness administrative directories. Original H trees and frozen files remain unchanged in all three series. V3 verifies all 12,756 frozen files and the absence of all twelve author containers. Four tasks share public VibeRacing history and two are small known fixtures; no generalization or independent statistical claim is made. Scoped Linux/Node checks and delivered regression execution do not establish the full config/web/pnpm/platform matrix. Known `verify-native-task-format.mjs` baseline failure remains separate and unchanged. No full-suite-green claim, manual Actions, release, merge or default change.

Raw logs, native sessions, evaluator/reference trees and complete source copies remain in ignored `local/native-task-utility-20260911/`, `local/native-task-utility-v2-20260912/` and `local/native-task-utility-v3-20260912/`. One v1 state reviewer performed a bounded memory search without arm mapping/outcomes/reference; findings were independently verified. All three v2/v3 reviewers used their assigned packets only, after authors terminated, with no hints passed into the measured workflow.
