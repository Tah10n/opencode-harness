# Six development pairs at the recovery baseline

Candidate: `cac39a0050189f2ddf01d4b88888494457b578a7`. The first candidate retains runtime and instruction bytes, including the closed H1 wording. This series measures development utility, not an independent benchmark. Historical results are not pooled.

The ordered schedule and complete tasks are in `plan.json` and `tasks/*/TASK.md`. Four public VibeRacing changes and two established local development fixtures supply two consumer integrations, two state tasks and two compatibility/refactoring tasks. Selection preceded every new model result. No preliminary plain run selected failures. The two small fixtures limit generalization; they are not represented as production repositories.

OpenCode 1.18.26, openai/gpt-5.6-luna, high effort, fresh sessions and copies, identical project information and permissions, 900 seconds total per task-run. Plain receives the original task through native `opencode run`; H receives it through installed `/harness-task`. No extra plain continuation, reviewer or model stage is introduced. All H stages share the deadline. Equal time is not equal tokens.

| Task | Independent behavior and preservation | Required delivered artifacts |
| --- | --- | --- |
| protocol-error-api | Valid status/code rejection; malformed/untrusted response rejection; original protocol cases; pairing, reconciliation, upload, retry/Retry-After, revocation, cancellation and hostile-response CLI checks | API and real consumer regression tests; connector README |
| catalog-cache | Representation-specific hash/headers/body; encoded regional client requests; bodyless 304; unchanged legacy client and routing | Handler and client tests; return-shape and matching documentation |
| legacy-runtime-reload | Complete historical flat layout including cursor; fresh-process and repeated runtime loading; original private-state rejection and unchanged bytes/modes | Migration acceptance/rejection and reload coverage; connector README |
| reconnect-revoked | 401 and 403 with old/new token phases; prior config has both retired/active mappings immediately before retirement; transient/malformed failures preserve state; pending state cleanup; lifecycle races | Real connect regressions and preserved independent reconnect scenarios; connector README |
| request-module-extraction | Original transport consumers; installed runtime loading; semantic review that request/retry moved to one cohesive library used by the CLI while protocol parsing stays in its layer | Transport and installed-runtime regression tests; connector README |
| dual-config | CommonJS and ESM named/default consumers; legacy strings; object indent including zero; invalid shapes; unchanged JSON serialization | Both-format consumer regressions; error and option documentation |

Full-patch acceptance requires all applicable behavior, preserved contracts, necessary delivered tests and docs, plus clean independent application. Source review checks scenario substance and extraction without requiring helper names, module names, internal fields or test shape. No implementation-specific Error subclass is imposed. Explicitly specified public error classes in dual-config remain part of its contract.

Autonomous delivery is separate: native completion/termination, H workflow status, actual terminal patch and no manual intervention between stages. An externally correct patch can coexist with an incomplete workflow. D0 and final are retained and graded separately; correction is not a required success event.

Before scoring, six reference implementations and six valid alternatives passed container checks; six unchanged inputs and six substantive mutants were rejected. The extraction unchanged input is rejected by required structural review although its existing behavior tests pass. Mutants cover lost retry metadata, reading a 304 body, overly broad legacy ownership, missing 403 recovery, a missing installed module and losing explicit indent zero.

Historical evaluator issues were corrected only in new local copies before scoring: legacy now exercises the complete flat layout and reload, unrelated UTF-16 reference changes are removed, and reconnect asserts its immediate saved-state precondition and distinguishes new authorization. Historical evidence is unchanged.

Author containers have no network, no host authorization file, no sibling projects, no source Git history, no evaluator/reference or research directory. Only public initial trees, ordinary dependencies and the materialized candidate are mounted. The existing host relay reads configured OpenCode OAuth and records response status, requests and usage without sharing authorization with authors. Runtime, inputs, instructions, evaluator and runner digests are frozen locally before provider calls.

The existing scheduler records and terminates each managed-deadline slot without retry. It continues only after confirmed local termination, capture and cleanup. Authorization/quota refusal, unknown submissions or unknown local execution stop scheduling. Missing usage stays unknown. Ten scripted scheduler scenarios and the actual installed container fixture passed; the latter made eight scripted requests and zero real provider calls. Its terminal patch also passed after application in a separate ordinary copy without harness administrative directories.

Development selection requires H >= 5/6 full patches, >= 2 task wins over P, no confirmed regression loss, and autonomous installed delivery. At most one evidence-based revision and another complete fresh six-pair development series are allowed. Only a qualifying candidate may enter forty new independent pairs; development and prior versions are excluded from their statistics. No manual Actions, merge, release or default change is authorized here.

Raw logs, source copies, private evaluator/reference material and detailed manifests are retained in `local/native-task-utility-20260911/`, not committed.
