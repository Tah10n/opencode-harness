# Fixed native task comparison

This directory contains the prepared projects and pre-run analysis for one
user-authorized comparison of plain OpenCode (A) with installed full
`/harness-task` (B). The unit is one complete project task: 100 pairs, 25 tasks
in each of integration, state, API compatibility and refactoring. These compact
synthetic projects do not represent all production development.

Preparation is not a model-quality result. No confirmatory verdict is available
until all 100 assigned pairs have trustworthy outcomes and independent grading.
The candidate runtime is fixed at
`3750b0d448fbfa7db80c459029a98fd221e86f94`; publishing corpus/report changes in
PR #25 does not change the evaluated runtime. OpenCode is 1.18.26,
`openai/gpt-5.6-luna` low. Each full task-run has one shared 900-second deadline;
B retains its ordinary two-repair, one-evidence-correction and format limits.
There is no imported D0/review, forced repair, observer intervention or scored retry.

Read [ANALYSIS-PLAN.md](ANALYSIS-PLAN.md) for the primary endpoint, paired
McNemar/Tango analysis, power calculation and failure handling. The practical
+10 percentage-point guide is separate from statistical significance. Historical
pilots and continuations are excluded from this sample.

Each `tasks/<id>/` uses the existing task layout:

- `initial/`: complete visible TASK, initial project, instructions and ordinary tests;
- `reference/`: a checked implementation with the explicitly requested tests/docs;
- `acceptance/`: independent behavioral checks;
- `grading.json`: frozen behavior, preservation and meaningful tests/docs rubric,
  including explicit `manualBehavior` source requirements where present;
- `preflight-cases.json`: a permitted alternative and two substantively wrong variants.

Only `initial/`, the common installed tools and the selected arm's instructions
enter the model container. Reference, acceptance and answer-bearing rubric files
are never mounted during model work. After verified process termination, the
existing runner captures delivery and injects independent checks. A/final, B/D0
and B/final use the same rubric; internal reviewer status is not a grader.
Manual delivery assessment hides arm/status where practical and does not require
reference test names or internal implementation. A missing mandatory source
criterion, test or document prevents complete delivery even if functional checks pass.

The existing materializer, native runner, container relay, capture and task format
are reused. Both arms use the same pinned offline Node image, native binary,
dependencies and ripgrep 15.1.0. Installed scripted preflight covers read, glob,
grep, write/edit, bash, Git and project tests. That evidence establishes wiring,
not semantic repair quality. Host OAuth is used only for authorized forwarding;
authentication storage is not included in prompts or public artifacts.

Before any scored slot, all inputs, candidate bytes, environment, slot order and
analysis are hashed and published. The runner admits only never-started assigned
slots, preserves unsuccessful slots, and verifies cleanup before continuing.
A 503 alone does not erase a trustworthy delivery. Requests denote observed host
forwarding attempts, not proof each reached the provider. Unknown usage stays
unknown; cache/reasoning subsets are not added twice to totals. Observed elapsed
run time includes final workload termination, while container setup and independent
grading are outside the model deadline and reported separately where available.

## Preparation review and limits

Individual read-only reviews checked each visible contract against reference,
alternative, negative controls and tests/docs. A broader novelty review also
compared older development corpora. Five initially prepared scenarios were removed
before freeze or model outcomes because their central mechanisms overlapped with
previously authored tasks: dependency layers, locale fallback, symbol postings,
lease fencing and decimal quantity parsing. Their offline preparation artifacts
remain local; they are not scored tasks or replacement outcomes. The current
replacements concern antimeridian viewports, source-map span composition, weighted
ranked-choice tabulation, resumable reservoir sampling and Bloom filter state.

The older `verified-change` corpus README describes offline preparation without
final model outcomes; this is not a claim that all five overlapping scenarios had
been scored. Locale fallback additionally has a retained development repair.
Shared primitives such as hashing or iteration are not by themselves duplicate
task families. Task selection was not based on preliminary plain-model failures.

The original macOS containment incident remains unexplained: it did not reproduce
on the control run, which does not establish a fix. Historical A 5/6–B 4/6 and
transfer A 5/6–B 6/6, their patches and continuations remain unchanged. The unavailable
historical operational host adapter is not used by the installed native path tested
here. No release, merge or default-branch change is part of this comparison.
