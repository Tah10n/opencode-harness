# Technical preparation

Status: **READY for separate model-run authorization**.
Quality: **NOT RUN**. New evaluation-model requests: **0**.

The accepted product and freshly fetched origin/main both were
`ffbf979b4fdae958b71796e22e6b7a81a0edce50`. Preparation uses a separate worktree
and `experiment/public-context-development-v1`; existing worktrees were neither
switched nor cleaned. Product/core/defaults/prompts, dependency versions, official
evaluator, patch ordering, parser/scoring and historical artifacts are unchanged.

The [selection](selection.json) fixes four tasks after inspecting six of the
maximum twelve candidates. The [plan](PLAN.md) and configuration were committed
as `5c7cb47b` before candidate inspection; IDs and 16-cell order were committed
as `244f8009` before official controls. The six-candidate metadata prefix is
reproducible from the pinned CSV and seed. Sixty historical selections were
excluded conservatively, including the unrun confirmation set. Normalized
statements were also compared with that historical set; no selected statement
matches. Source issue identity is separately bound by public PR reference and
issue body. The Material UI 22696 issue title differs only in capitalization.

| Fixed task | Original issue | Eligible comments at screening |
| --- | --- | ---: |
| sveltejs__svelte-1116 | [svelte#1107](https://github.com/sveltejs/svelte/issues/1107) | 2 |
| mui__material-ui-22696 | [material-ui#19654](https://github.com/mui/material-ui/issues/19654) | 7 |
| sveltejs__svelte-6525 | [svelte#6462](https://github.com/sveltejs/svelte/issues/6462) | 3 |
| mui__material-ui-12236 | [material-ui#12216](https://github.com/mui/material-ui/issues/12216) | 6 |

Full-task collection confirmed the same eligible-comment counts; all four
receipts are complete and offline replay v2 reproduced exact TASK/context bytes. Cutoffs
use the earliest author/committer timestamp over complete PR commit metadata,
with an independent Git commit metadata check. No solution files/diffs or hints
were used to construct participant tasks. Administrative source/cutoff evidence,
raw API snapshots, excluded comments and request logs remain private outside
all author mounts. Four tasks with accessible comments do not represent all
coding tasks or establish independence from possible model training.

## Setup dispositions retained

- The operator started the first control before the evaluator clone completed.
  Integrity checking failed on `git rev-parse HEAD` before official execution.
  The queue was stopped; original failure/accounting logs were preserved.
  After clone, pinned dependency imports and evaluator integrity passed, the
  previously unexecuted controls ran for the same fixed IDs. No model retry or
  task replacement occurred.
- An initial CSV projection normalized embedded CRLF. The ordinary exact-row
  comparison rejected it. The original projection and hashes were retained;
  the subset was regenerated with CSV newline preservation before controls.
  No dataset fields or patches were manually edited.
- The existing host OpenCode was 1.18.34; the installed fixture rejected it
  before any scripted request. A separate pinned 1.18.26 package was used.
  The user's installation was unchanged.
- The dedicated Docker builder initially did not load its output into Docker.
  The empty image-ID/tar failure was retained; enabling `default-load=true`
  completed the same cached diagnostic build. No global builder setting changed.
- A recorder fixture initially received sandbox `listen EPERM` on loopback.
  Its failed output was retained and the unchanged fixture passed with permitted
  loopback access. It made no external model request.

These are preparation/operator environment errors, not benchmark/model outcomes.
The final readiness decision requires all fixed-task dispositions and complete
frozen input/cell checks; a successful generic fixture alone is insufficient.

## Official controls

All four baseline/gold pairs passed the unchanged official acceptance checks.
Counts below are overall parsed tests, not a claim that every gold suite is green.

| Task | Baseline resolved; passed / failed | Gold resolved; passed / failed |
| --- | --- | --- |
| sveltejs__svelte-1116 | false; 1561 / 10 | true; 1562 / 9 |
| mui__material-ui-22696 | false; 93 / 2 | true; 95 / 0 |
| sveltejs__svelte-6525 | false; 4311 / 4 | true; 4313 / 2 |
| mui__material-ui-12236 | false; 17 / 2 | true; 19 / 0 |

These controls calibrate evaluator/input preparation. They contain no candidate
model attempt and are not solution-quality results for P0/P1/C0/C1.

## Completed technical checks

- `npm ci --ignore-scripts` and pinned sensitivity dependency installation: PASS.
- Final `npm run verify` at adapter code `b26806cc`: PASS, exit 0, including
  four-cell scheduling/report regressions and existing public-context adversarial,
  contradictory, withdrawn, empty and delivery-bound controls.
- `npm run verify:installed` with a separate OpenCode 1.18.26: PASS, exit 0;
  local scripted providers only, including the full 131071-byte task boundary.
- Official baseline/gold: all eight controls PASS (table above).
- Four original and four augmented inputs: actual isolated manifest/Git capture
  checks PASS. P0/C0 share exact original bytes; P1/C1 share exact augmented bytes.
  All non-TASK source/dependency entries, modes and symlink targets match.
- Plain/core runtime comparison: 3797 shared dependency/tool entries identical;
  differences are only materialized core.md, its instruction config and the
  startup .gitignore required by the read-only core mount.
- Existing container/output/termination controls: PASS, including actual socket
  egress denial (ENETUNREACH), read-only mounts, isolated history, detached workload
  termination, output containment and complete patch roundtrip. Recorder: PASS.
- Real-launcher P0/P1/C0/C1 scripted check on the first selected task: PASS.
  Each fresh cell made 5 scripted requests, 3 tool calls and one native session;
  all four ended normally with verified termination and complete marker patch.
  The complete task envelope was checked in actual author requests; core was
  present only in C0/C1. Every request was checked for excluded comment text and
  administrative cutoff/solution identifiers. No task/review/investigator or
  TYPE_COMPAT execution was enabled in these cells.
- Unchanged official export control: the identical full marker patch from all
  four cells applied successfully and retained baseline resolved=false. One
  official invocation covered the identical hashes. This is not a quality score.
- No-authorization negative control: the real launcher refused before credential
  access without the explicit flag. Model availability/authentication: NOT RUN.

| Task | Original TASK bytes | Augmented TASK bytes | Replay |
| --- | ---: | ---: | --- |
| sveltejs__svelte-1116 | 2321 | 4865 | identical |
| mui__material-ui-22696 | 723 | 6757 | identical |
| sveltejs__svelte-6525 | 7392 | 10524 | identical |
| mui__material-ui-12236 | 1699 | 6198 | identical |

Only the four cell mechanisms were exercised with scripted responses; this does
not claim 16 model attempts or understanding/compliance by a real model. Scripted
usage is kept separate. The historical sandbox sensitivity FAIL is unchanged
and is not reclassified by these fresh checks.

## Planned runtime and admission

Product: accepted `ffbf979b4fdae958b71796e22e6b7a81a0edce50`.
The clean frozen adapter SHA is `16d390e7458383fd94efb67c4bd76e1ee498a198`.
The [ordinary frozen manifest](frozen-manifest.json) records both input variants,
snapshots, images and installed runtime hashes. Freeze SHA-256:
`ab80a1800f9b4a5622a33e80eb87c8be63c85fc16f1acc3c596a7f732ca8579b`. The earlier runtime preparation
receipt retains its then-current Git HEAD separately; evaluation changes were
subsequently committed at `b26806cc`. Product extraction always used the accepted SHA.

OpenCode 1.18.26; model openai/gpt-5.6-luna; reasoning high; 1800 seconds per
complete attempt; 16 one-shot slots; sequential; no retries or substitution.
Model availability and quality remain untested. The exact future command and
prespecified comparisons/stop rules are in [PLAN.md](PLAN.md).

No real model requests, stopped-campaign resumption, manual external review,
merge, Ready, release, deployment or branch deletion were performed.

## Final admission and cleanup

The ordinary freeze passed all controls and the actual frozen schedule verifier;
its 16 slots contain exactly four ready tasks with the prescribed order. Its public
manifest is copied byte-for-byte into this commit. The private real batch contains
only freeze.json and manifest.json: no attempts, scores or provider records.
The final origin/main refresh still resolves to the accepted product SHA.
Later report/manifest commits do not change the frozen executable adapter files.

Removed the dedicated preparation builder and its reported 25.02 GB BuildKit cache,
3,145,807,275 logical bytes of owned temporary archives/caches/verification installs,
and the unneeded diagnostic fixture image. No containers remain; the owned builder
is absent. Existing unrelated builder registrations/volume were left untouched.
Retained about 6.3 GiB of private preparation, principally 4.8 GiB of the eight
frozen source/dependency inputs, the pinned evaluator/Python runtime, materialized
bundles, Linux OpenCode and minimal controls/receipts. The four official images and
four author images are retained for the separately authorized run. These are live
frozen launch inputs, not report-only copies. Raw scripted requests and source
snapshots stay private and outside author mounts; no credentials are published.

Local checks above passed. Remote CI is reported on the Draft PR for its exact
head; it is separate from these preparation results and from model quality.
