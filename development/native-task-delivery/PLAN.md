# Original-requirement completion: bounded development

This stage starts from ca68c72d07761c2aca964837df1276ae1f6f3f72. The closed
100-pair series stays incomplete_quota. Its reviewed outcomes are development
material only; no old slot, patch, grader or outcome is changed or resumed.

Selection, before new provider calls:

| Role | Task | Already assessed reason for selection | Independent evaluation |
| --- | --- | --- | --- |
| Missing production integration | portable-path-core | CLI still imports platform-default normalize; new POSIX core is disconnected | Frozen acceptance/preservation; inspect actual CLI delegation and requested CLI test/docs |
| Missing production integration | weighted-ballot-tabulation | tabulate still returns a single plurality round; integrated transfer policy absent | Frozen acceptance/preservation; inspect runElection/tabulate/renderReport and delivered transfer/round tests |
| Correct behavior, missing delivery | url-resolver-consumers | Behavior passed; project tests failed to assert original item immutability through buildMenu | Frozen acceptance/preservation; inspect consumer regression including original item fields and docs |
| Correct control | abortable-delay-consumer | Prior B final satisfied behavior, tests, docs and preservation | Same frozen checks and delivery rubric; inspect for introduced regressions |

Use the original initial trees and full TASK.md from native-task-comparison/tasks.
Only initial source, ordinary tests/instructions and the current harness enter
the native author environment. No saved D0/review, reference or independent
acceptance test enters while the model is active. Each is a fresh complete B run.
Existing offline evaluator runs only after verified model termination.

Version 1: one run per selected task. At most one substantive mechanism revision
and one further run of each task are permitted, with the decision/diff recorded
before results. Maximum 8 development runs. All started outcomes remain retained.
Do not interpret a fresh successful D0 as proof the continuation stage caused it.

Gate: at least two distinct previously incomplete tasks reach independently
verified complete delivery, and the control has no found regression. Otherwise
stop before comparison; do not create version 3. On confirmed quota exhaustion
stop all new provider requests and slots, retain partial work and leave unstarted
slots pending. No separate paid quota probe.

Only after this gate may a single runtime be frozen for 20 new tasks (5 each:
integration, state, API/consumer compatibility, behavior-preserving refactoring).
Before their 40 scored runs, record balanced AB/BA order, task/reference/check
validation, acceptable alternatives and the existing paired statistical method.
Primary endpoint is complete behavior + preservation + explicitly required
tests/docs; assess B/D0 separately. Keep this sample separate from development
and historical pilots. No scored retry or post-result rubric change.

Measurement binding: OpenCode 1.18.26, openai/gpt-5.6-luna, variant low, original
native tools and container boundary, 900 seconds including all stages per task.
The reusable runtime has no model binding. At most 48 total full runs. No manual
Actions, matrix run, merge, release, new branch archive or default change.

## Authorized preparation correction after pre-session failures

The four retained v1 startup failures remain immutable. The user explicitly
permits one fresh full run of each same task, in the same order, after correcting
container preparation. This exception applies only to those confirmed zero-session,
zero-request failures; no sent/uncertain request, timeout or model outcome is retried.
There is no additional mechanism revision or automatic development repeat.

Runtime source remains `328728b3ff1a416fb267d7de1b2b36b2b19cfbff` (runtime bytes
unchanged in published `1b0d144a40df8add9a22c81a0361c8b3d5358779`). Preparation is
recorded at its own commit before execution. The existing installation-control
preparation is promoted to `prepare-container-bundle.mjs`: copy the bundle,
pre-create `.gitignore`, map/validate config references under `/template`, preserve
runtime bytes and read-only mount. Record new config, runtime hashes and actual
container mounts before the first provider request. Old bundle/freeze is untouched.

The existing fixture provider/project now also supports the existing container
and native CLI adapters. Container preflight must observe real read/search/edit/test,
D0, review, terminal patch and verified cleanup, with no authentication read or
external provider forwarding. It is not a model-backed result.

New runs are recorded separately under `local/native-task-delivery/prepared`, linked
to the corresponding v1 failures. Shared startup failure pauses the remaining slots;
ordinary model failure does not. Existing quota pause still stops all new requests.
Each run retains the original 900-second whole-task budget and correction limits.

The full-delivery gate and conditional 20-task/40-run comparison remain unchanged.
Total limit: four retained failed starts + four new development runs + at most
40 conditional comparison runs. Scripted preflight is counted separately.
