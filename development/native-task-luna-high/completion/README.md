# Luna/high: completed four-slot development diagnosis

All four originally scheduled slots now have retained results. **One patch meets the
frozen whole-delivery rubric: reconnect P.** Runtime P remains incomplete; runtime H
made no changes after a native permission denial; reconnect H passes the frozen
checks but retains a stateful regression-coverage gap and timed out during its third
correction. The observed whole-delivery count is **P 1/2, H 0/2** on these selected
known tasks. This is not an independent benchmark or evidence of general model lift.

This report adds the three originally unstarted slots to the same series. The
[first stopped-run report](../README.md), its patch, original plan, freeze, usage and
correct stopping decision are unchanged. The user's [authorization amendment](../resume-authorization.json)
accepted unknown server completion/extra usage and allowed the remaining first
executions in their original order. No model run was retried, resumed or replaced.

## All four original slots

| Slot | Task | Arm | Execution / H workflow | Frozen scoped checks | Whole delivery | Seconds | Requests (missing usage) | Known total tokens |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |
| 1 | legacy-runtime-reload | P | Timeout; old unknown-submission stop preserved | Pass | Incomplete: retained old launcher is installed as current | 900.107 | 51 (1) | 4,528,972 |
| 2 | legacy-runtime-reload | H | Process exit 0; workflow `incomplete`, native permission boundary | Fail: migration and legacy acceptance | Incomplete: supplied input unchanged | 341.348 | 32 (0) | 1,670,393 |
| 3 | reconnect-revoked | H | Timeout; last saved workflow `incomplete`; 3 corrections admitted, 2 completed | D0, D1, D2 and final pass | Incomplete: disconnected regression starts after prior revocation removed its subject | 900.157 | 90 (1) | 9,253,983 |
| 4 | reconnect-revoked | P | Process exit 0; final response delivered | Pass | Complete within the frozen task scope | 404.761 | 39 (0) | 3,698,782 |

Execution success, workflow status and patch quality are separate. A timeout remains
a timeout even when useful patches and completed author replies were captured.
`incomplete` is the last saved H status, not an invented completed tool result for
slot 3. Process exit 0 in slot 2 does not make its workflow successful.

Cumulative patches apply to the original public task baselines and include each
supplied historical D-final input:

- [Runtime P, unchanged original result](../results/patches/legacy-runtime-reload/P-final.patch)
- [Runtime H final](patches/legacy-runtime-reload/H-final.patch)
- [Reconnect H final](patches/reconnect-revoked/H-final.patch)
- [Reconnect P final](patches/reconnect-revoked/P-final.patch)

[Outcomes](outcomes.json), [metrics](metrics.json) and the [new patch manifest](patch-manifest.json)
provide machine-readable records. The first slot's metrics and assessment are copied
unchanged from its original result; its original patch remains at the original path.

## Runtime: failure retained in both arms

P fixed the directory-link rejection and added a repeat-preparation/fresh-process
regression. Its frozen counts remain exactly as published. However, its test copies
the current launcher into the historical layout and misses the mismatch between old
launcher bytes and current libraries. The existing supplemental CLI test fails with
`RETAINED_OLD_LAUNCHER`; whole delivery remains incomplete.

H's final public bytes and executable modes equal its supplied input. An early
concurrent tool call was rejected by the sequential-tool guard. A later compound Git
read was denied by native `external_directory` permissions, after which the frozen H
boundary refused subsequent tools. This is a native tool-permission failure, not an
OpenAI authorization or quota refusal. No denial was bypassed and no correction was
admitted. The author returned, but H did not capture a D0 patch. The terminal patch
was retained; no D0 result or author-delivered fix is manufactured.

H's ordinary and restored tests pass, but the frozen full-layout migration fails:
`Vibe Racing state contains an unrelated entry: lib`. The same unchanged supplemental
old-launcher test also fails at this earlier migration boundary, so it cannot reach
the installed-launcher assertion. It is applied symmetrically and remains separate
from frozen scoring. [Supplemental results](supplemental-diagnosis.json) and the
[original test bytes](../results/legacy-source-diagnostic.test.mjs) are retained.

## Reconnect: useful correction, remaining coverage gap

Both final patches pass the frozen independent scenarios: correctly initialized
disconnected reconciliation, 401/403 recovery without an abandoned pairing, mandatory
config-removal failure stopping before pairing, and transient-error preservation.
They also pass the restored lifecycle/race/source-preservation routes. The rubric
additionally requires a meaningful delivered regression and preservation of existing
coverage; these are assessed from the delivered test's actual starting state.

**P** restores the disconnected scenario before any revoked-authorization recovery.
The old config still contains both mappings, so the test exercises removal of the
explicitly disconnected, unavailable source. It checks the pairing source set and
foreign-hook preservation there. Subsequent 401 and 403 calls each begin with valid
connected config; the 403 case explicitly seeds dirty and pending state. Server-side
pairing assertions verify revoked config and automatic state are already absent.
The malformed hook remains intact and the auxiliary-cleanup warning is asserted.
Non-revoked/malformed and transient paths retain config, hooks and zero pairing starts.
This is substantive regression coverage through the real connect CLI, without a new
requirement for a separate test function or separate temporary home per scenario.
P also factors the existing 401/403 predicate and documents lifecycle responsibility.

**H D0** adds 401/403 handling for malformed protocol responses, auxiliary cleanup
assertions and README detail. Its authored combined test still runs disconnected
mode after 401 and 403 have replaced config with only the active source. Its newly
filtered reconciliation response returns mappings only for requested source IDs;
therefore the last disconnected call has no retired mapping left to reconcile. The
final active-only assertion can pass without exercising the original disconnected
removal path. This retains the input's coverage gap; it is not a newly observed
runtime regression and is not repaired by an independent evaluator passing.

**H D1** adds one real, independent account-deletion regression: a connected temporary
installation, malformed 403 response, no abandoned pairing, preserved installation
and source identity, removal of dirty/pending state, and a real successful CLI connect.
The author ran it to a pass. D1 changes the test only relative to D0; production code
is unchanged. This is a useful correction, but it does not reinitialize the combined
disconnected scenario. D1, D2 and final have identical public bytes and executable
modes. No new patch regression was found between those snapshots in the frozen
checks and scoped review. Whole delivery remains incomplete under the original
stateful-regression rubric, independently of the timeout.

The frozen H requested the literal reconnect route without `--test-concurrency=1`
after D0, even though the route with that flag had passed. After the added D1 test,
the unflagged route passed on current bytes, but H also retained the earlier flagged
route as stale. D2 returned a summary without a tool call and changed no files. A
third correction began and lost its in-flight response at the task deadline. These
are recorded workflow facts, not a claim that the task required both command spellings.
The runtime is frozen and was not repaired based on this result.

[Workflow facts](workflow-facts.json) retain stop reasons and stage observations.
[Author check facts](author-checks.json) preserve failed intermediate checks and later
passes separately. H attempted `corepack pnpm verify`, but offline Corepack could not
bootstrap pnpm; it did not execute the full matrix and is not part of this scoped
acceptance. Prior runtime P full-connector scheduler timeouts remain in the original
report. No new failure is silently reclassified as a pass.

## Frozen offline checks

Counts are per check route and overlap; they must not be added as unique coverage.
The one skip in ordinary/preservation routes is platform-specific, not passing
Windows evidence. The evaluator bytes and check definitions were unchanged.

| Snapshot | Ordinary pass/fail/skip | Delivered config route pass/fail | Restored preservation pass/fail/skip | Independent checks | Lifecycle / preserved consumers |
| --- | --- | --- | --- | --- | --- |
| Runtime P final (original) | 24/0/1 | 3/0 | 23/0/1 | migration 1/0; legacy 9/0 | runtime consumers 2/0 |
| Runtime H final | 23/0/1 | 2/0 | 23/0/1 | migration 0/1; legacy 8/1 | runtime consumers 2/0 |
| Reconnect H D0 | 24/0/1 | 5/0 | 24/0/1 | 4/0 | 5/0 |
| Reconnect H D1, D2, final | 24/0/1 | 6/0 | 24/0/1 | 4/0 | 5/0 |
| Reconnect P final | 24/0/1 | 5/0 | 24/0/1 | 4/0 | 5/0 |

[New grading results](grading-results.json) retain per-phase observations. D2 reuses
D1's result after an exact source/mode digest match; D1 and final were both evaluated.
[Snapshot comparison](snapshot-comparison.json) separately verifies Git-relevant
executable modes and all public source bytes. [Original P grading](../results/grading-results.json)
was not rerun or rescored.

## All known usage and correction cost

Every one of the **212** forwarded requests used `gpt-5.6-luna` with outgoing
`reasoning.effort: high`. Usage is reported for 210 requests; two remain unknown
(runtime P and reconnect H). Totals are incomplete lower bounds. Monetary billing
and any extra server computation after local cancellation are unavailable.

| Arm / task | Input | Output | Known total | Cached input subset | Reasoning output subset | Tools | Sessions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Runtime P | 4,494,812 | 34,160 | 4,528,972 | 1,521,152 | 22,755 | 99 | 2 |
| Runtime H | 1,658,022 | 12,371 | 1,670,393 | 591,360 | 8,722 | 48 | 2 |
| Reconnect H | 9,221,268 | 32,715 | 9,253,983 | 5,479,936 | 18,351 | 103 | 2 |
| Reconnect P | 3,683,434 | 15,348 | 3,698,782 | 1,248,768 | 9,078 | 69 | 1 |
| Total | 19,057,536 | 94,594 | **19,152,130** | 8,841,216 | 58,906 | 319 | 7 |

Cached tokens are already in input; reasoning tokens are already in output. Neither
subset is added again. Request metadata is the accounting source, avoiding double
counting OpenCode's separate native reasoning/cache counters.

| H stage | Recorded author seconds | Requests | Known total tokens | Captured patch |
| --- | ---: | ---: | ---: | --- |
| Runtime implementation | 332.521 | 29 | 1,655,941 | No D0; final equals input |
| Runtime bootstrap, return and title | — | 3 | 14,452 | — |
| Reconnect implementation / D0 | 462.868 | 47 | 3,678,639 | D0 |
| Reconnect correction 1 / D1 | 407.435 | 39 | 5,389,053 | D1: added independent 403 regression |
| Reconnect correction 2 / D2 | 20.023 | 1 | 178,910 | D2 identical to D1 |
| Reconnect correction 3, interrupted | No completed-stage duration | 1 | Unknown | No D3; final identical to D2 |
| Reconnect bootstrap and title | — | 2 | 7,381 | — |

Stage attribution uses forwarding timestamps within native author-session user-turn
windows; each request is assigned once. It includes the unfinished third correction,
whose missing usage is not mislabeled as zero or bootstrap cost. Task elapsed time
includes host scheduling and shutdown, so it need not equal summed author durations.
Each arm has one auxiliary title request: runtime P 1,185 tokens, runtime H 675,
reconnect H 678, reconnect P 1,132. Titles are separately grouped in metrics and
included in the all-request totals. No compaction model/session was observed.

H's known reconnect total is about 2.50 times P's, with one additional unknown request.
This is observed compute on one pair, not a monetary ratio or general overhead estimate.
The runtime H run consumed less compute because its tools stopped working; that does
not establish efficiency. Two selected tasks, one attempt per arm, unequal actual
compute and incomplete runs cannot support statistical lift or a model-default change.

## Preservation, scheduling and limits

All remaining slots used the frozen H source from
`44f6a4b1a73ed8347b852247bbc533fa04497080`, OpenCode 1.18.26, high effort, the same
historical D-final inputs, 900-second task deadline and maximum three H corrections.
No new P-final, old P conversation, supplemental finding or grader reached H.
Actual container inputs matched before the first provider request (220 runtime /
224 reconnect files including identical task/check scaffolding). Separate containers,
author sessions and H worktrees were used. Original H checkouts are unchanged.

Only the external scheduler's stop classification was amended. The
[scripted fixture](../resume-scheduler-fixture.json) passes ten cases with zero real
provider calls: controlled deadline and a blocked late response permit the next
unstarted slot; unattributed timeout, a foreign abort near deadline, unknown local
execution, unexplained disconnect, quota refusal, authorization refusal, capture
failure and cleanup failure stop scheduling. The [amended launcher](../run-comparison-resume.mjs)
and [fixture source](../verify-resume-scheduler.mjs) are additive files; original
launcher/stop records are preserved. The published launcher copy only relocates its
relative import for this directory; its published fixture was also run successfully
against the preserved local preparation, with zero real provider calls.

Slot 3's own deadline was verified; tools terminated, patch capture completed,
forwarding closed, relay removed and active provider handlers reached zero before
slot 4 began. [Artifact validation](artifact-validation.json) confirms all three new
patches apply cleanly with exact bytes/modes and no whitespace errors, the 18 selected
old-result records remain unchanged, and all nine new model/observer/supplemental
containers are absent. Existing evidence covers old cleanup; no full historical
thousands-file audit was repeated. Late responses have no local executor or writable
candidate to reach. Server terminal state/usage for the two interrupted requests
remains unknown; no cancellation/status endpoint or alternate access was used.

Raw payloads, private reasoning, auth storage and session logs remain local and are
excluded from publication. No measured patch was manually fixed. Product runtime,
prompts, default model/effort, automatic checks and historical results are unchanged.
Manual Actions and full platform matrix executions: **0**. No merge, release or
further model attempt is part of this diagnosis.
