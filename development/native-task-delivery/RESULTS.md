# Original-requirement completion: development v1

The runtime change is implemented and passes model-free controller and installed
checks. **The requested real model effectiveness result is not established.**
All four predefined v1 slots failed before an OpenCode session/provider request
because the observer prepared the container bundle incorrectly. No successful D0,
continuation or final delivery exists for this development version.

Runtime: `328728b3ff1a416fb267d7de1b2b36b2b19cfbff`, based on
`ca68c72d07761c2aca964837df1276ae1f6f3f72`. Selection and evaluation were recorded in
[PLAN.md](PLAN.md) before execution. These are development outcomes, not scored
comparison pairs and not replacements for historical runs.

## Product change and local verification

Missing explicit original production obligations now admit ordinary implementation
continuation after current native source inspection and substantive grounding.
Existing behavior findings still require current sensitive reproduction; unsupported
reviewer expectations do not become implementation permission. The author receives
the complete original task, missing requirement/basis, current patch and inspected
paths, actual checks and limitations. The existing author/reviewer sessions,
worktree, tools and final checks are retained.

Implementation continuation and behavior repair share two correcting cycles.
There is no additional model stage or separate repair budget. No file progress
stops repeated continuation. Missing/duplicate dispositions remain unresolved and
prevent successful status while retaining other admitted work and its patch.
The author must deliver consumer/project regression and preservation checks after
the last change. These semantic requirements still need independent assessment;
source inspection and reviewer agreement are not proof of complete delivery.

Local Node 24.19.0 checks passed:

- `node scripts/verify-native-template.mjs`
- `node scripts/verify-native-task.mjs`
- `node scripts/verify-native-review.mjs`
- `node scripts/verify-native-launcher.mjs`
- `NATIVE_TASK_FIXTURE_CASES=obligation-integration,obligation-test,obligation-extra,obligation-complete,obligation-no-progress,obligation-deny,exception-named-nested,evidence-replay,cancel node scripts/verify-native-task-fixture.mjs`
- Final diff review and `git diff --check`.

The installed fixture used OpenCode 1.18.26: nine scenarios passed, 85 scripted
requests, zero real provider requests. It observed actual temporary project edits,
consumer checks and preserved helper/legacy tests; it does not measure model quality.
The external runner's existing hardcoded 200-slot/old-runtime freeze validation
was narrowly extended for the requested four-task development and conditional
40-run comparison schedules. The frozen historical runner was not changed.

## Actual v1 outcomes

Each fresh slot used its original initial project/full task, OpenCode 1.18.26,
`openai/gpt-5.6-luna`, variant low, and a 900-second whole-task budget. No saved
D0/review/reference/grader was supplied to a model. All returned exit code 1:

| Task | Native process elapsed | Provider requests | Native tool calls | Result |
| --- | ---: | ---: | ---: | --- |
| portable-path-core | 649 ms | 0 | 0 | Startup failure; no D0/delivery |
| weighted-ballot-tabulation | 727 ms | 0 | 0 | Startup failure; no D0/delivery |
| url-resolver-consumers | 654 ms | 0 | 0 | Startup failure; no D0/delivery |
| abortable-delay-consumer | 635 ms | 0 | 0 | Startup failure; no D0/delivery |

Total measured native process time: 2,665 ms (not total preparation/container
wall time). Provider and relay requests: 0. Native sessions and tools: 0. No token
usage was returned; there was no provider inference. No quota exhaustion was
observed. Workload termination and container cleanup were verified for all four.
The scheduler's `finished` means its four slots were consumed, not task completion.

Every stderr contained the primary failure:

```
Unknown: FileSystem.writeFile (/template/.gitignore)
```

The observer materialized a host configuration into a read-only container mount
without preserving the pre-created `.gitignore` used by the preceding qualified
container bundle. The new configuration also retained host-absolute instruction
and plugin paths. This is an installation preparation error in this development
execution, not evidence against or for the continuation mechanism, a quota failure,
or an unexplained platform flake.

A separate model-free control prepared `.gitignore` and mapped instructions/plugin
to `/template`, then successfully ran `opencode debug config` in the same read-only
container. No environment restrictions or authorization changed. This establishes
configuration loading only, not a successful task execution. The original v1
bundle/freeze/outcomes remain unchanged; all frozen input hashes were rechecked.

## Retained records and stopping boundary

Private records remain under `local/native-task-delivery/v1/`: `freeze.json`,
per-slot `started.json`, `result.json`, `provider-metadata.json`, native evidence,
original candidate capture, stderr, termination and cleanup. They are deliberately
not committed. The separate model-free installation control is under
`local/native-task-delivery/installation-control*`. No live temporary container
was retained. No task patch was applied to the user's checkout.

The development gate has not been met: no two independently complete previously
incomplete tasks and no evaluated control. No comparison tasks/runs or effectiveness
statistics were produced. No v2 real runs were made: the startup error does not
establish a concrete defect in the new continuation mechanism, which was the
condition for the permitted second development measurement. A new successful
full-run measurement remains necessary; configuration loading cannot substitute.

The closed 100-pair series remains `incomplete_quota`. Historical pilots,
continuations, patches, graders and costs are unchanged. No re-audit of 255 states,
manual Actions, full matrix, merge, release or default change was performed.
