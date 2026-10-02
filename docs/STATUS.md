# Project status

The maintained product is the native materializer and native runtime. Technical
implementation and model effectiveness are separate claims. Historical results
are bound to their original commits in [RESULTS](RESULTS.md); they are not a
current-head test receipt.

| Capability | Implementation/status | Technical evidence |
| --- | --- | --- |
| Two-file native instructions/config | Supported | `verify-native-template.mjs`: collision, symlink, settings, exact bundle |
| Read-only native review | Experimental opt-in | `verify-native-review.mjs`; installed `verify-native-review-fixture.mjs` |
| Isolated task and patch delivery | Experimental opt-in; effectiveness unconfirmed | `verify-native-task.mjs`; installed fixture checks actual patch application, staged index, concurrent saves, permissions, cancellation/deadline |
| Check/context/type/sensitivity/investigation feedback | Experimental, default-off where originally default-off | Retained native regression suites; no general quality claim |
| SWE-PolyBench adapter | Maintained external evaluation path | Model-free selection/export/accounting, scheduler/recorder, container boundary checks |
| Legacy core/quality/assurance/verified-change/v3 runtime | Archived, unsupported | Original commits and reports in [ARCHIVE](ARCHIVE.md); old checks no longer validate the current product |

## What is usable now

The [quick start](../README.md) installs native instructions. Explicit `--task`
and `--review` add experimental commands. The chosen model remains an OpenCode
setting. The adapter exposes preparation, explicit model admission, official
evaluation and summaries; this consolidation performs no new model evaluation.

The subsequent evidence-backed-core assignment completed 18 fresh development
attempts and their official evaluation. H1 did not pass screening and was removed
from active instructions; the ordinary materializer again emits C0 core bytes.
Task/review remain experimental opt-ins. This bounded rejection and its separate
costs are in [RESULTS](RESULTS.md); no independent quality confirmation ran.

## Verification of this consolidation

The PR and its required **Harness verification** check are the version-bound
technical receipt: [PR #25](https://github.com/Tah10n/opencode-harness/pull/25).
A check is evidence only when its job actually executes and passes at the
reviewed head. Until that happens, current-head CI is pending, not a historical
PASS. Local model-free verification on 2026-09-29 passed all 18 groups;
the installed OpenCode 1.18.26 task fixture passed 35 scenarios with 268
loopback requests and zero real provider calls. Container isolation, detached
workload termination and private capture also passed. These preliminary local
results are followed by a clean-clone run and actual CI at the PR head; consult
the linked PR for their final disposition. Full official dataset preparation
and model-backed evaluation were not run during consolidation.

The maintained `npm run verify` includes native behavior/security tests,
bundle/import/export/link checks, scheduler deadlines and unknown outcomes,
loopback recorder failures, and model-free PolyBench selection/export/accounting.
`npm run verify:installed` uses pinned OpenCode with a local scripted provider.
The container check exercises network/mount boundaries, descendant termination
and private output capture, not just a process exit code.

## Known limits and remaining effectiveness work

No sustained benchmark lift is established. Official PolyBench evidence includes
separate historical stopped and completed campaigns and the latest six-task
development rejection. Their versions and samples are not pooled. The original
pilot's 12 assigned slots remain not started; its historical model, runtime and
sample do not validate the current runtime or another model.
Native permission tests are not proof of protection from arbitrary hostile host
processes. The retired quality runtime's Linux cgroup/Windows Job Object/macOS
containment claims do not transfer to native execution.

Future effectiveness work requires a separately authorized frozen comparison,
explicit model/variant, equal public inputs, official evaluator and complete
usage/unknown-outcome reporting. Do not resume stopped campaigns or tune on old
results and describe them as independent confirmation.
