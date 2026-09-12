# Development after corrected container preparation

Four newly authorized full B runs used unchanged runtime
`328728b3ff1a416fb267d7de1b2b36b2b19cfbff` (identical runtime files in published
`1b0d144`), preparation `08688642f9441b9b18d9ef31403fde748e1471a0`, OpenCode 1.18.26,
openai/gpt-5.6-luna low, 900 seconds per whole task. The four original zero-request
startup failures in [RESULTS.md](RESULTS.md) remain unchanged and are not successes.

| Task | Behavior | Preservation | Required tests/docs | Full delivery | Workflow | Seconds | Requests | Tools | Observed total tokens |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| portable-path-core | 4/4 | 1/1 | Yes / Yes | Yes | reviewed_delivery | 114.699 | 19 | 26 | 197901 |
| weighted-ballot-tabulation | 3/3 | 1/1 | Yes / Yes | Yes | reviewed_delivery | 161.915 | 17 | 21 | 194891 |
| url-resolver-consumers | 4/5 | 1/1 | Yes / Yes | No | reviewed_delivery | 121.276 | 15 | 22 | 150880 |
| abortable-delay-consumer | 5/5 | 1/1 | Yes / Yes | Yes | incomplete | 88.230 | 14 | 17 | 126885 |

Total: 486.120 measured native-process seconds, 65 forwarded provider requests,
86 native tool calls, 670557 observed total tokens. Usage was returned for every
request. Cache/reasoning are included in provider totals, not added again. This
is not total operator/preparation wall time or a dollar cost estimate.

Portable CLI now delegates to the extracted POSIX core, with real CLI output/status
and no-write-on-invalid-input tests. Weighted tabulation implements the transfer
policy through the existing election/report consumer, with complete round/report,
exhaustion, ties and invalid-input regressions. Both were fully delivered in D0;
D0 and terminal patches are identical. No continuation benefit is inferred.

URL delivery supports normal URL-object consumers and includes frozen input and
URL-identity/immutability tests/docs, but `buildMenu(invalidBase, [])` skips base
validation. The original independent empty-menu test fails on its first invalid
file URL, so later invalid-base assertions in that test are not credited as reached.
D0 and final have the same defect. Reviewed status did not establish correctness.

Control code/tests/docs pass the frozen independent checks. Its current `npm test`
ran successfully after source edits. The author then requested `git diff --check`
with the parent of the delivery worktree as cwd and received a genuine native
external_directory denial. Subsequent tools were blocked. This is not a false
permission classification and no permissions were relaxed. No D0 or review was
captured; terminal delivery was independently evaluated, not replaced by baseline.

The development gate is met by two distinct previously incomplete tasks reaching
full delivery and no found code/coverage regression in the control. The control's
workflow incompleteness remains separately reported. No mechanism revision or
additional development model repeat was made. The permitted comparison is
preregistered in [comparison/PLAN.md](comparison/PLAN.md).

Preparation uses the successful installation-control logic in one helper, creates
`.gitignore`, validates mapped instruction/plugin paths, and retains `/template`
read-only. Two runs of the same small scripted scenario (after final environment
allowlisting) passed: each 9 scripted requests, no auth read or real requests. The
final run exercised native read/glob/edit/test, D0, review, terminal patch and cleanup
in the measured container/native CLI path. Targeted preparation/startup/quota tests
and one preparation diff review passed. Historical tasks/evaluators/patches and
runtime `lib/` files are unchanged. Private detailed captures remain under
`local/native-task-delivery/prepared`; no candidate was copied into user files.
