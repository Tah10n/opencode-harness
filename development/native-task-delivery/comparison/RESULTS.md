# Fixed 20-pair native comparison: retained results

All 40 preregistered slots executed once. The user explicitly confirmed the prepared 20 projects / 40 sessions after the pre-launch approval refusal; automatic approval then admitted the same command. No access, account, model or boundary workaround was used. The original refusal remains recorded in [STATUS.md](STATUS.md).

Full delivery: A **19/20**, B **20/20**. B-only 1, A-only 0, both complete 19, neither complete 0. Difference B-A **5.0 percentage points**. Exact two-sided McNemar **p=1**; preregistered Tango score 95% interval **[-11.92, 23.61] pp**. This does not meet the preregistered positive-effect criterion. Nonsignificance is not equivalence.

Runtime source `328728b3ff1a416fb267d7de1b2b36b2b19cfbff`, preparation `08688642f9441b9b18d9ef31403fde748e1471a0`, dataset/preregistration `2f870ca025d711887f9a5bff5e2bc4ed5bd8b1ef`. OpenCode 1.18.26, openai/gpt-5.6-luna, configured low, 900 seconds total per slot, ten AB and ten BA pairs. Runtime, tasks and frozen evaluator were not changed during measurement. No scored retry, manual Actions, platform matrix, merge, release or default change.

## Every pair

Full means required behavior, original preservation, final ordinary checks, listed meaningful project tests, requested docs and explicit integration. Internal workflow status is separate. All frozen automatic acceptance/preservation/ordinary checks passed; the percentile A full-delivery failure below comes from the written contract and lost project coverage, not a changed grader.

| Task | A final | B D0 | B final | B workflow | After D0 |
|---|---|---|---|---|---|
| css-layer-bundle | full | full | full | reviewed_delivery | unchanged |
| inventory-kit-availability | full | partial | full | incomplete | changed; see assessment |
| terminal-table-render | full | full | full | reviewed_delivery | unchanged |
| calendar-week-summary | full | unavailable | full | incomplete | D0 unavailable |
| redirect-chain-report | full | full | full | reviewed_delivery | unchanged |
| seat-reservation-snapshot | full | full | full | incomplete | unchanged |
| inventory-count-delta | full | full | full | reviewed_delivery | unchanged |
| quiz-progress-migration | full | full | full | reviewed_delivery | unchanged |
| event-cursor-compaction | full | full | full | reviewed_delivery | unchanged |
| preference-tombstone-overlay | full | full | full | reviewed_delivery | unchanged |
| percentile-method-options | partial | full | full | reviewed_delivery | unchanged |
| duration-bigint-adapter | full | unavailable | full | incomplete | D0 unavailable |
| map-record-catalog | full | full | full | incomplete | unchanged |
| set-query-consumer | full | full | full | reviewed_delivery | unchanged |
| tuple-point-distance | full | full | full | reviewed_delivery | unchanged |
| roman-format-core | full | full | full | reviewed_delivery | unchanged |
| bracket-check-core | full | full | full | reviewed_delivery | unchanged |
| slug-token-policy | full | full | full | reviewed_delivery | unchanged |
| histogram-pure-core | full | full | full | reviewed_delivery | unchanged |
| luhn-checksum-core | full | full | full | reviewed_delivery | unchanged |

## Independent findings and stage contribution

B has 15 `reviewed_delivery` and five `incomplete` outcomes. Eighteen D0 snapshots exist: 17 equal the terminal patch and one changes only a project test. Two D0 snapshots are unavailable. There were **zero production repairs, zero implementation continuations and zero evidence-corrections** in these 20 B runs. Consequently this comparison does not establish the quality of an exercised implementation-continuation stage, although complete first-attempt delivery counts under the frozen endpoint.

Percentile A violates the original statement that an omitted method defaults: with `[30,10,20], 0.5`, omitted options returns 20, but `{}` and `{method: undefined}` throw `TypeError("method")`. B returns 20 for all three. A direct post-termination read-only, network-disabled container invocation confirmed this; frozen acceptance, tasks and candidates were unchanged. Its rewritten project test also drops the old unsorted-input assertion and only tests already sorted values. Both faults are assessed against requirements published before scoring. B is complete already at D0; its advantage on this pair is not caused by a production repair.

Inventory-kit B improved a required regression after D0: two kits now share the same stock item, exposing accidental cross-kit reservation. Production source was unchanged. The initial test used disjoint items and did not demonstrate the listed independence requirement. Final delivery is complete while the workflow remains incomplete because a required disposition/check was unresolved.

Percentile B investigated and rejected a reviewer expectation for an invalid options container, outside the frozen domain. Final review accepted that rejection; no patch change or production repair occurred. This shows a bounded disposition path, not a repair-quality win.

Calendar and duration B stopped on genuine native external-directory denial before D0. Their terminal code/tests/docs pass independent assessment; D0 is unavailable. Seat B cites a nonexistent required command ID. Map B cites `call_9TvgJwTjHhCxYyf6COpAR13`, whereas the completed diff ID is `call_9Tvg2JwTjHhCxYyf6COpAR13`; the missing reference is not successful evidence. These incomplete protocol outcomes remain incomplete.

Other outcomes and precise assessment limitations are retained in the per-delivery table below and [RESULTS.json](RESULTS.json). No new runtime revision or recovery run is authorized or performed by this report. Unchanged D0 does not establish that deleting review would preserve the same solution.

## Cost of every retained run

Elapsed time is the measured native process duration, including B stages. Provider usage includes auxiliary requests; cached/reasoning details are already nested and are not added again. Each slot has one observed tool-less effort-none auxiliary request in addition to the configured low work. No dollar price is inferred from OAuth quota.

| Task | A seconds / requests / tools / total tokens | B seconds / requests / tools / total tokens |
|---|---:|---:|
| css-layer-bundle | 57.775 / 10 / 15 / 75,535 | 139.167 / 15 / 18 / 139,955 |
| inventory-kit-availability | 51.525 / 10 / 14 / 73,731 | 143.405 / 19 / 20 / 221,519 |
| terminal-table-render | 61.982 / 11 / 15 / 86,838 | 113.762 / 16 / 25 / 162,034 |
| calendar-week-summary | 57.609 / 11 / 15 / 83,427 | 95.990 / 17 / 21 / 165,633 |
| redirect-chain-report | 60.586 / 12 / 17 / 95,471 | 102.510 / 17 / 22 / 165,057 |
| seat-reservation-snapshot | 68.835 / 10 / 13 / 73,676 | 96.810 / 17 / 23 / 160,827 |
| inventory-count-delta | 63.917 / 11 / 14 / 86,059 | 98.450 / 14 / 16 / 127,714 |
| quiz-progress-migration | 60.630 / 10 / 13 / 76,647 | 141.743 / 13 / 14 / 113,257 |
| event-cursor-compaction | 65.218 / 10 / 13 / 76,626 | 99.520 / 16 / 18 / 149,830 |
| preference-tombstone-overlay | 78.725 / 11 / 15 / 87,647 | 116.651 / 17 / 21 / 165,789 |
| percentile-method-options | 55.157 / 10 / 16 / 74,414 | 157.089 / 24 / 27 / 266,492 |
| duration-bigint-adapter | 67.773 / 13 / 18 / 108,936 | 80.040 / 14 / 17 / 120,398 |
| map-record-catalog | 61.627 / 11 / 16 / 87,251 | 107.165 / 16 / 19 / 153,344 |
| set-query-consumer | 58.605 / 10 / 13 / 75,723 | 104.746 / 14 / 17 / 119,167 |
| tuple-point-distance | 56.628 / 10 / 14 / 76,681 | 109.774 / 17 / 23 / 168,983 |
| roman-format-core | 53.985 / 10 / 13 / 74,911 | 95.650 / 14 / 18 / 128,703 |
| bracket-check-core | 63.973 / 12 / 15 / 94,115 | 94.181 / 16 / 18 / 145,112 |
| slug-token-policy | 61.515 / 12 / 17 / 98,917 | 98.687 / 17 / 19 / 154,898 |
| histogram-pure-core | 56.731 / 10 / 14 / 77,205 | 108.518 / 17 / 23 / 174,318 |
| luhn-checksum-core | 56.304 / 10 / 15 / 79,086 | 97.613 / 16 / 20 / 151,332 |

| Arm | Native seconds (sum) | Requests | Tool calls | Input tokens | Output tokens | Total tokens | Missing usage |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 1219.100 | 214 | 295 | 1,621,649 | 41,247 | 1,662,896 | 0 |
| B | 2201.471 | 326 | 399 | 3,079,891 | 74,471 | 3,154,362 | 0 |

Comparison total: **540 provider requests, 694 tool calls, 4,817,258 observed tokens and 3,420.571 native seconds**. B used 1.81 times A's native time and 1.90 times its tokens on this sample. These costs include unsuccessful protocol outcomes and do not establish cost effectiveness from one discordant pair.

The four development runs remain separate: 65 requests, 86 tools, 670,557 total tokens and 486.120 native seconds; outcomes are unchanged in [PREPARED-RESULTS.md](../PREPARED-RESULTS.md). The four prior startup failures consumed zero provider requests and remain failures. This exhausts the authorized 4 old startup + 4 new development + 40 comparison slot envelope. Scripted preparation checks are separately model-free.

## B stage attribution

Cells are requests / observed total tokens. Provider forwardedAt is assigned only when it falls in exactly one stage interval from the native user-message creation through the recorded final assistant completion. The tool-less effort-none requests are separately observable auxiliary overhead. Other unmatched requests remain unattributed, including incomplete stages without a terminal message; no cost is invented or allocated by proportion. Review/disposition review and preparation can be separated in JSON.

Attributed totals: initial implementation 209 requests / 2,091,266 tokens; initial review 24 / 359,018; preparation and disposition review 8 / 155,012; observed auxiliary requests 20 / 11,705. The remaining 65 requests / 537,361 tokens are not assigned to stages. A zero attributed implementation cell for calendar/duration means attribution is unavailable, not that implementation was free or absent.

| Task | Initial implementation | Review | Preparation / disposition | Auxiliary none | Unattributed |
|---|---:|---:|---:|---:|---:|
| css-layer-bundle | 11 / 109,972 | 1 / 15,457 | 0 / 0 | 1 / 585 | 2 / 13,941 |
| inventory-kit-availability | 10 / 97,350 | 1 / 15,300 | 5 / 93,483 | 1 / 585 | 2 / 14,801 |
| terminal-table-render | 11 / 116,658 | 2 / 30,867 | 0 / 0 | 1 / 585 | 2 / 13,924 |
| calendar-week-summary | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 587 | 16 / 165,046 |
| redirect-chain-report | 13 / 134,414 | 1 / 16,106 | 0 / 0 | 1 / 585 | 2 / 13,952 |
| seat-reservation-snapshot | 12 / 118,037 | 2 / 28,348 | 0 / 0 | 1 / 586 | 2 / 13,856 |
| inventory-count-delta | 10 / 97,664 | 1 / 15,372 | 0 / 0 | 1 / 586 | 2 / 14,092 |
| quiz-progress-migration | 9 / 84,962 | 1 / 13,793 | 0 / 0 | 1 / 585 | 2 / 13,917 |
| event-cursor-compaction | 12 / 120,652 | 1 / 14,631 | 0 / 0 | 1 / 585 | 2 / 13,962 |
| preference-tombstone-overlay | 12 / 120,299 | 2 / 30,957 | 0 / 0 | 1 / 585 | 2 / 13,948 |
| percentile-method-options | 16 / 159,831 | 2 / 29,826 | 3 / 61,529 | 1 / 585 | 2 / 14,721 |
| duration-bigint-adapter | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 585 | 13 / 119,813 |
| map-record-catalog | 12 / 123,659 | 1 / 15,238 | 0 / 0 | 1 / 585 | 2 / 13,862 |
| set-query-consumer | 10 / 92,321 | 1 / 12,279 | 0 / 0 | 1 / 586 | 2 / 13,981 |
| tuple-point-distance | 12 / 123,642 | 2 / 30,849 | 0 / 0 | 1 / 585 | 2 / 13,907 |
| roman-format-core | 10 / 100,053 | 1 / 14,239 | 0 / 0 | 1 / 585 | 2 / 13,826 |
| bracket-check-core | 12 / 117,062 | 1 / 13,583 | 0 / 0 | 1 / 585 | 2 / 13,882 |
| slug-token-policy | 13 / 126,425 | 1 / 13,906 | 0 / 0 | 1 / 585 | 2 / 13,982 |
| histogram-pure-core | 12 / 126,217 | 2 / 33,525 | 0 / 0 | 1 / 585 | 2 / 13,991 |
| luhn-checksum-core | 12 / 122,048 | 1 / 14,742 | 0 / 0 | 1 / 585 | 2 / 13,957 |

## Delivery assessment details

| Task / arm | Behavior | Tests / preserved coverage | Docs | Integration | Basis |
|---|---|---|---|---|---|
| css-layer-bundle / A | yes | yes | yes | yes | Current-ready topological sort integrated into bundle; cycle and frozen block/edge input regression; old assertion preserved; docs cover full contract. Unused names assertion not treated as evidence.  |
| css-layer-bundle / B | yes | yes | yes | yes | Dynamic ready sorting handles duplicate edges; bundle delegates. New tests cover dependency output, frozen arrays/records and cycle failure, old test unchanged, docs cover policy. D0 equals final.  |
| inventory-kit-availability / A | yes | yes | yes | yes | Own-key aggregate capacity integrated through quote; duplicate-parts and same-SKU independent frozen-stock tests; legacy retained; requested documentation complete.  |
| inventory-kit-availability / B | yes | yes | yes | yes | kitCapacity sums repeated own-key requirements and quote delegates. Final same-SKU frozen-stock two-kit regression proves non-reservation; D0 used different SKUs and did not discriminate reservation. Only this new test changed after D0; initial legacy assertion retained. Missing duplicate obligation disposition keeps workflow incomplete.  |
| terminal-table-render / A | yes | yes | yes | yes | render uses visibleWidth for sizing/padding; SGR/code-point and rendered original-color-string assertions, non-SGR width, legacy preserved; full requested docs. No input mutation in inspected code.  |
| terminal-table-render / B | yes | yes | yes | yes | Correct SGR/code-point width integrated into table sizing/padding, rendered colored Unicode assertions and non-SGR controls, empty shapes, original test retained; required docs. D0 equals final.  |
| calendar-week-summary / A | yes | yes | yes | yes | UTC Monday core integrated into sorted weekly summation; week boundary, leap/year and frozen-input preservation tests; legacy and docs complete.  |
| calendar-week-summary / B | yes | yes | yes | yes | UTC weekStart used by aggregator; correct week/year/leap cases and frozen-input assertions, legacy retained, requested docs. Terminal independently passes; genuine permission denial halted workflow before D0/review.  |
| redirect-chain-report / A | yes | yes | yes | yes | Own-property traversal integrated into report; chain/cycle and own special-key/empty-target project assertions, legacy retained, requested docs. Inherited start is shadowed in project fixture and not counted as a direct inherited-ignore test; independent acceptance and inspected hasOwnProperty establish that behavior.  |
| redirect-chain-report / B | yes | yes | yes | yes | follow uses own keys and per-walk visited state, report delegates. Tests directly cover chains/cycles, inherited-ignore, own special-key and empty target; legacy/docs retained. D0 equals final.  |
| seat-reservation-snapshot / A | yes | yes | yes | yes | Atomic Set reservation and numeric detached snapshots; tests cover conflict/duplicate/empty, sorted snapshot and independent restore/release, legacy/docs retained. Independent numeric multi-digit case passes; project sorting example itself uses single-digit IDs.  |
| seat-reservation-snapshot / B | yes | yes | yes | yes | Atomic duplicate/conflict validation, idempotent release and copied numeric snapshots. Tests detect partial conflict, duplicate request, snapshot/restore isolation and numeric sorting; legacy/docs complete. D0 equals final; reviewer check accounting remains incomplete.  |
| inventory-count-delta / A | yes | yes | yes | yes | Sorted own-key signed deltas, sequential negative validation and safe defineProperty writes. Project round-trip includes removals; intermediate-negative test checks input unchanged. Legacy and specified docs retained.  |
| inventory-count-delta / B | yes | yes | yes | yes | Correct signed own-key delta and safe sequential apply; round-trip/removal, intermediate negative/input preservation and special-key assertions; old test/docs retained. D0 equals final.  |
| quiz-progress-migration / A | yes | yes | yes | yes | Codec delegates migration; preregistered JSON-copy alternative preserves allowed values. Project tests cover v1 extras/encounter order and v2 nonrenumbering/deep identity, original assertion and docs retained.  |
| quiz-progress-migration / B | yes | yes | yes | yes | Migration used by encode/decode, extras retained, v2 values preserved with independent JSON copies (preregistered allowed alternative). Tests verify codec v1 ordering/extras and nested v2 ownership, old assertion/docs retained. D0 equals final.  |
| event-cursor-compaction / A | yes | yes | yes | yes | Cumulative compaction preserves next and validates before mutation; structuredClone at append/restore/snapshot. Project tests cover compaction restore, invalid ack state, nested ownership; legacy and docs retained.  |
| event-cursor-compaction / B | yes | yes | yes | yes | Correct cumulative cursor and cloned state. Delivered compaction/restore, invalid ack unchanged state and nested ownership tests; legacy/docs preserved. D0 equals final.  |
| preference-tombstone-overlay / A | yes | yes | yes | yes | Recursive own-key copying and safe property definition implement owned overlay and tombstone-preserving composition. Project tests cover sequential equivalence, preserved nulls, special keys and mutation independence; original scalar assertion preserved. Required semantics documented.  |
| preference-tombstone-overlay / B | yes | yes | yes | yes | D0 equals final. Own-key overlay, deep ownership and retained composition tombstones implement the contract. Project regressions exercise sequential composition, replacement ownership and special keys; original scalar assertion preserved. JSON copy is within the frozen domain. Documentation explains shallow replacement and tombstones.  |
| percentile-method-options / A | no | no | yes | yes | Frozen automated acceptance/preservation/ordinary checks pass, but explicit TASK domain says missing method defaults. Source sets method=options.method whenever options is supplied and then rejects undefined, so percentile([30,10,20],0.5,{}) throws TypeError(method). This is a pre-existing written requirement absent from frozen acceptance, not a new rubric. Delivered default test uses sorted values and removed the original unsorted-input assertion, losing its sorting coverage. Required interpolation and empty-validation regressions and documentation are otherwise delivered. No evaluator or candidate changed.  |
| percentile-method-options / B | yes | yes | yes | yes | D0 equals final. Missing method explicitly defaults, numeric copy sorting and interpolation implement the written domain. Original unsorted nearest assertion is intact; separate meaningful interpolation and empty-validation tests and required documentation are delivered.  |
| duration-bigint-adapter / A | yes | yes | yes | yes | Exact bigint quotient/remainder and display preserve numeric public types. Original numeric assertions are unchanged; regression tests cover large precision, errors through both exports and zero bigint. Documentation specifies types, precision and no coercion.  |
| duration-bigint-adapter / B | yes | yes | yes | yes | Terminal delivery passes frozen acceptance, original preservation and ordinary checks. Numeric/bigint split and exact display preserve result types; original assertions, large bigint precision and type/range validation tests retained. Required docs delivered. Workflow stopped on true native permission denial before D0; D0 is unavailable and no continuation or repair occurred.  |
| map-record-catalog / A | yes | yes | yes | yes | Source validates each record/Map entry and returns fresh rows in native order; total delegates to rows. Original record assertions retained. Map ordering/totals and invalid-key/nonfinite-price regressions are meaningful. The result-mutation regression checks a fresh equivalent record through total, so it does not directly test the original input identity; frozen independent checks and source establish actual ownership. Required ordering/type/ownership documentation delivered.  |
| map-record-catalog / B | yes | yes | yes | yes | D0 equals final. Both exports share entry validation and preserve record/Map ordering; rows owns new records. Original assertions retained; project tests exercise Map order/totals, invalid entries and independence on the same input. Docs delivered. Workflow incomplete on reviewer-required check: reviewer labels final git diff as discriminating evidence, which does not establish behavioral execution. Primary concrete mismatch: review cites call_9TvgJwTjHhCxYyf6COpAR13, absent from journal. Actual completed git diff ID is call_9Tvg2JwTjHhCxYyf6COpAR13. Prior assessment note about a diff not proving behavior remains valid, but the missing ID already explains rejection. |
| set-query-consumer / A | yes | yes | yes | yes | Required Set conversion and AND matching reach existing names through select. Original array test intact. Tests distinguish partial matches, retain strict row identity and frozen inputs, and cover empty requirements; documentation covers duplicate-array semantics as requested. No new requirements for every negative case beyond the listed regression categories.  |
| set-query-consumer / B | yes | yes | yes | yes | D0 equals final. Set and array AND selection reaches names, preserving original objects and order. Original array assertion retained; meaningful Set contrast, frozen inputs, strict identity, duplicate and empty regressions delivered. Required semantics documented.  |
| tuple-point-distance / A | yes | yes | yes | yes | Both exports validate mixed tuples/records with finite coordinates and exact tuple size, including singleton length. Original record assertion preserved; project tests exercise mixed polyline, unchanged singleton and invalid singleton. Independent frozen checks additionally cover frozen inputs. Required Euclidean and validation docs delivered.  |
| tuple-point-distance / B | yes | yes | yes | yes | D0 equals final. Mixed tuple/record finite validation and Math.hypot length implement domain, including singleton. Original record assertion intact; additional tests cover mixed paths, frozen tuple/record ownership, nonfinite singleton and bad tuple shapes. Required docs delivered.  |
| roman-format-core / A | yes | yes | yes | yes | Existing label delegates directly to pure extracted roman; duplicate algorithm removed. Original assertion unchanged; direct subtractive cases, default/custom/empty prefixes and rejection through both exports exercise integration. Required docs delivered.  |
| roman-format-core / B | yes | yes | yes | yes | D0 equals final. label directly calls the extracted pure roman core; no parallel conversion remains. Original chapter assertion intact. Direct subtractive/boundary core checks, custom/empty consumer prefixes and errors through both exports are tested and documented.  |
| bracket-check-core / A | yes | yes | yes | yes | Pure inspect maintains UTF16-indexed bracket stack and earliest remaining opener; check delegates without duplicate balancing. Original balanced assertion intact. Project regressions cover astral-prefix mismatch through consumer and ignored text/earliest opener through core. Required semantics documented.  |
| bracket-check-core / B | yes | yes | yes | yes | D0 equals final. Existing check calls extracted pure inspect with UTF16 indexing and earliest remaining opener; no duplicated stack logic. Original balanced assertion retained; meaningful astral-prefix mismatch and quoted-but-not-special ignored-text regressions delivered with required docs.  |
| slug-token-policy / A | yes | yes | yes | yes | Existing slug calls the extracted pure token function; tokenization is not duplicated. Original assertion retained. Project tests cover ASCII/lowercase/separators, consumer truncation then hyphen stripping, empty fallback and repeat ownership. Required docs delivered.  |
| slug-token-policy / B | yes | yes | yes | yes | D0 equals final. Existing slug calls pure tokens and preserves truncation-before-trailing-hyphen removal and fallback. Original hello-world assertion intact. Direct ASCII/underscore/non-ASCII token checks, consumer truncation, max-zero fallback and repeat ownership are tested. Required policy docs delivered.  |
| histogram-pure-core / A | yes | yes | yes | yes | summary directly consumes fresh pure counts output; Map preserves core first occurrence and consumer applies numeric frequency/UTF16 tie sorting to its own fresh array. Original summary assertion intact. Project regressions contrast core/consumer order and test frozen input and special strings through both exports. Stateless/ownership semantics documented.  |
| histogram-pure-core / B | yes | yes | yes | yes | D0 equals final. summary calls stateless counts and ranks its fresh results without shared mutable state. Original assertion intact; project tests contrast first-order/ranked results, special keys, frozen inputs and repeated-result ownership. Required ordering/type semantics documented.  |
| luhn-checksum-core / A | yes | yes | yes | yes | describe directly uses pure extracted validDigits and preserves UTF16 masking even for invalid strings. Original known-digits assertion intact. Correct parity, all-zero/strict ASCII cases and consumer masking tested; requirements documented. Numeric inputs are outside the frozen string domain and do not create a new criterion.  |
| luhn-checksum-core / B | yes | yes | yes | yes | D0 equals final. describe delegates to extracted pure ASCII-digit Luhn core; correct right-to-left parity and original UTF16 suffix masking remain. Original known-digits assertion preserved. New tests cover valid/invalid checksum, invalid-input masking, zero strings, whitespace and non-ASCII digits; exact semantics and non-payment scope documented.  |

## Evidence retention and limits

All 40 native journals contain a successful `npm test` after every successful file write. The post-model frozen evaluator independently ran acceptance, original preservation and final ordinary suites. All 4,013 frozen files match their pre-run SHA-256 values; all slots terminated within 900 seconds and all 40 task containers are absent after cleanup. The existing `development/native-task-comparison/verify-statistics.mjs` passed its ten fixed controls. The preparation targeted tests and scripted container preflight remain the previously recorded passing checks; no runtime change required repeating them. Final publication is a report-only change, not merge-checkpoint evidence.

Original trees, D0/terminal patches where created, captured candidate archives, independent test output, native command/session accounting and provider usage remain in the existing private `local/native-task-delivery/comparison-scored` directory. JSON publishes artifact SHA-256 fingerprints and bounded assessments, not raw sessions, credentials or unrestricted logs. Model termination and container cleanup were verified for every slot before grading/next scheduling; frozen file hashes were rechecked after the series.

These are selected small synthetic tasks, with a high baseline completion rate. Twenty pairs give little power for small effects; this is not general effectiveness evidence, not a counterfactual ablation of review, and not an update to any historical 100-pair/255-state audit or earlier pilot. No real model calls beyond the fixed single attempts were used for evaluation.
