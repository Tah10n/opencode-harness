# Fixed native-task comparison: incomplete after quota exhaustion

The intended 100-pair model-backed comparison was **not completed successfully**. All 200 assigned slots have terminal records, but provider quota exhaustion interrupted slot 167 and prevented model work in slots 168–200. No scored slot was restarted, replaced or rerun. No confirmatory effect estimate, McNemar p-value, confidence interval, or positive/negative quality verdict is published.

The recorded failure is HTTP 429, `usage_limit_reached`, with the message **“The usage limit has been reached”**. This is not a model-quality failure or an unknown provider flake. The frozen runner stopped scheduling on relay rejection and HTTP 401/403, but did not stop on HTTP 429. It therefore attempted the remaining assigned slots after the quota refusal. That is an execution-control deviation from the requested stop boundary, not successful completion of the series. The runner and authorization were not changed to bypass the refusal. OpenCode's internal retries remained inside each original slot; there were no additional scored attempts.

All 200 schedule identities, saved process-termination records and container cleanup results were verified. No evaluation process or container remained at the final check. Sixteen B slots have no trustworthy delivery; they remain unavailable and are not substituted with the initial project. Slot 167 retained a patch whose executable checks pass, but its completed manual review found insufficient identity assertions and source contract violations. Missing usage is preserved as unknown.

## Available evidence and remaining review

- [All 100 assigned pairs](PAIRS.md), including unavailable and unassessed endpoints.
- [Detailed endpoint checks, unmet requirements, costs and stage observations](paired-results.json).
- [Execution audit, quota boundary, accounting and coverage](execution-summary.json).
- [Pre-run analysis plan](ANALYSIS-PLAN.md), unchanged.

There are 255 available inspection packets: 100 A/final, 84 B/final and 71 B/D0. The same independent reviewer completed all 255 opaque-packet reviews. It initially stopped at 236 because of its quota limit; after the user requested continuation, it resumed the remaining 19 without changing model/account or restarting any scored slot. The earlier partial report is retained in Git history. The final independent recheck is complete: all 25 original discordant pairs, all 68 source adjudications and saved accounting were checked; [review scope and limitations](independent-review.json) are published. No open findings remain in the reviewed scope.

Among independently reviewed available final endpoints, A has 50 complete and 50 not complete; B has 42 complete and 42 not complete. Sixteen further B slots have no trustworthy delivery and count as unavailable/not complete, with behavior and manual fields left unavailable. All 100 assigned pairs therefore have descriptive operational dispositions: both complete 34, B-only 8, A-only 16, neither complete 42. These include quota-affected attempts and are not the planned complete model-backed sample. No effect estimate or confirmatory test is inferred from this operational table; the practical +10 percentage-point criterion remains unevaluated.

The final independent review found an additional contract violation in both saved B endpoints of `iterable-stream-adapter`: invoking an iterator method through its mutable `.call` property fails for a valid callable method with `call=null`. The original blind reviews remain preserved; the source adjudication revision removes this pair from B-only. No task, evaluator, patch or scored run changed.

The frozen statistics controls still pass, including zero discordance and planning power 0.8367351211564439. The resumed independent review also verified these controls through separate constrained-likelihood and exact-enumeration calculations. This does not supply missing model work.

## What happened after B/D0

All 71 available D0s were assessed under the same rubric as final. Thirty-eight were already complete and stayed complete; two changed from not complete to complete; thirty-one remained not complete. There was no complete-to-not-complete transition among these 71, but that does not establish absence of all regressions.

The two full-delivery improvements were project-test delivery in `array-like-slice-consumer` and `structured-redaction-walk`. Fifteen tasks had post-D0 file changes: tests in all fifteen and documentation in one. **Production repair count was zero across all 100 B slots.** This comparison therefore provides no successful production-repair demonstration. Positive initial implementation would have counted under the frozen endpoint; repair was never required to be the source of a win.

Three previously passing ordinary suites failed after post-D0 test additions:

- `portable-path-core`: an incorrect expected path was added; the disconnected CLI implementation also remained unresolved.
- `bigint-wire-boundary`: a rejection expectation outside the stated ordinary JSON input domain was added. It is not a new grading requirement.
- `function-receiver-wrapper`: a valid sensitive test exposed the existing mutable `fn.apply` lookup defect. The reviewer correctly found it. Initial cited evidence only printed TypeError with exit 0; the one evidence-correction used an assertion expression, but the call threw TypeError before the assertion executed. Controller admission still rejected `no_executed_failing_assertion`; no production repair followed. The added test is useful evidence, and the defect remains unfixed.

Other retained limitations include omitted obligation dispositions, incorrect or stale cited command IDs, real permission denials caused by paths outside the permitted worktree, missing sensitive tests, and unsupported reviewer extensions of stated input domains. Detailed per-task notes retain these distinctions. No runtime change or historical-status recomputation was made in response to these outcomes.

B native statuses were 53 `reviewed_delivery`, 46 `incomplete`, and one `environment_error`. Of the 53 reviewed deliveries, independent grading found 35 complete and 18 not complete. Seven internally incomplete patches were independently complete. Status does not replace patch assessment.

## Observed cost

The following totals cover all assigned slots, including quota-failed requests. They are not the cost of 100 successful model-backed pairs.

| Observation | A | B |
|---|---:|---:|
| Sum of task-run elapsed seconds | 7,793.977 | 11,705.550 |
| Median task-run seconds | 77.015 | 108.781 |
| Provider requests | 1,164 | 1,651 |
| Native tool calls | 1,391 | 1,790 |
| Observed provider total tokens | 8,933,144 | 16,063,749 |
| Input tokens | 8,698,246 | 15,675,069 |
| Output tokens | 234,898 | 388,680 |
| Cached input, already included | 4,976,128 | 5,373,952 |
| Reasoning output, already included | 33,986 | 70,050 |
| Requests with no observed usage | 153 | 156 |

Overall: 2,815 provider requests, 3,181 tool calls and 24,996,893 observed total tokens; 309 requests lack usage. All 309 have HTTP 429. The other 2,506 requests have complete numeric input/output/total usage; no partial usage objects were observed. Unknown usage is not imputed as zero. B used 7,130,605 more observed tokens in the recorded series; this difference is descriptive and quota-affected. No dollar charge is inferred from OAuth quota.

Native-message attribution for B is separate from provider accounting:

| Attributed stage group | Saved stage records | Seconds | Native observed tokens | Native tools |
|---|---:|---:|---:|---:|
| Implementation | 72 | 6,555.917 | 9,908,931 | 1,351 |
| Review / disposition review | 81 | 1,606.691 | 1,928,966 | 76 |
| Format correction | 5 | 69.841 | 17,746 | 0 |
| Reproduction / evidence correction | 16 | 431.187 | 1,268,400 | 56 |

These are only stages with saved identity-based attribution. B native usage outside those stages is 2,890,548 tokens: 1,168,835 in wrapper sessions and 1,721,713 still unattributed. The provider-minus-native observation is 49,158 tokens. These quantities are not added to the provider total. Stage durations do not partition the full wall time; setup and unassigned execution remain outside them. The observations do not identify the counterfactual cost or quality of removing review.

Auxiliary requests used the same configured model with observed effort `none`: A 134, B 132. Requests with effort `low`: A 1,030, B 1,519. This includes failed requests. The report does not claim that every provider request was a low-effort author/reviewer turn. Observer and independent-reviewer reasoning usage is outside this OpenCode relay accounting.

## Verification and limitations

The exact candidate was 3750b0d448fbfa7db80c459029a98fd221e86f94; the frozen preparation was published as 6db1bbdb0e795343c54c76761ec7425d7e5c98da. All 9,034 local frozen file digests still match after execution. The original runtime, model, task bytes, references, graders, rubric, schedule and statistical plan are unchanged. The public result files are added separately from frozen inputs.

Local observer corrections are retained with their original records: the first D0 packet used an enclosing Git repository and was reconstructed from the same saved patch; one interrupted packet export was archived and recreated after accepting the runner's actual nested termination record while requiring completed/finished/cleanup confirmation. A regex finding was rejected by a JavaScript primitive check; grammar, large-argument, typed-array and rendered-Markdown adjudications were resolved against the original contracts. Two documentation reviews were corrected after actual Markdown rendering exposed an erroneous backslash in the stated grammar. These were observer corrections, not new model runs or changes to grading conditions.

Current report and independent-review summary checks: `node development/native-task-comparison/verify-results.mjs`, frozen statistics controls, and local observer metadata/export controls. Exact-head CI is reported through the PR checks; the earlier preparation CI was run [34375932875](https://github.com/Tah10n/opencode-harness/actions/runs/34375932875). Green model-free CI cannot fill the missing model work.

The historical A5/6 B4/6 pilot, A5/6 B6/6 transfer pilot and all continuations remain separate and unchanged. The old macOS incident remains an unknown-cause failure; a control non-reproduction is not a demonstrated fix. No merge, release, default-branch change, quota reset, model change or new campaign was performed.

The requested full model-backed comparison and product-effect verdict remain unproven. This report preserves the failed execution and available evidence rather than converting them into a positive result or starting another series.
