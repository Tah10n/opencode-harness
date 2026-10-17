# Public context development v1

Preparation only. Quality: **NOT RUN**. New evaluation-model requests: **0**.
This four-task development screening cannot establish superiority or equivalence.
Candidate B remains opt-in. No model smoke/auth probe, retries, replacement,
resumption of stopped campaigns, merge, Ready, release or deployment is authorized.

## Prespecified selection

Before inspecting any gold/test patch or conducting an attempt, commit this plan
and campaign.json. Use the pinned Verified CSV and evaluator in campaign.json.
Exclude the union of all previously selected campaign/pilot IDs (including the
unrun confirmation selection, conservatively), indexed diagnostic cases and all
variants of source issue serverless/serverless#7008. Selection is new only within
our experiments, not independent of potential model training.

Sort eligible JS/TS rows by SHA256("public-context-development-v1\n" + instance_id),
then instance_id. Examine at most the first 12, in order, stopping once four pass.
Count every inspected candidate, including repository-cap and source failures.
Take the first qualifying rows with at most two per repository and one per source
issue. No model performance, expected core benefit, hidden patch match, evaluator
convenience or perceived usefulness is a selection criterion.

A candidate needs one unambiguous original public GitHub issue tied to the supplied
problem statement, independently verified first-solution-commit metadata, and
nonempty eligible comments within the existing collector limits. Resolve issue
identity from explicit references and original issue body, never hints_text or
solution code. Read PR/commit metadata only for source identity and cutoff; never
files/diffs. Use the earliest available author/committer timestamp over the solution
PR commits as a conservative boundary, cross-check the first commit by its commit
API metadata. Missing, inconsistent, truncated or ambiguous evidence rejects the
candidate with a recorded reason. Opening a PR is not the cutoff.

All eligible alternatives, contradictions and withdrawals are retained. Admit
only created_at <= updated_at < cutoff through the existing context module. No
summaries, selected interface, truncation or raised limits. This samples tasks
with accessible comments, not all coding tasks. If fewer than four qualify in 12,
report BLOCKED and stop selection. Once four IDs are fixed, preparation failures
block the whole series and never authorize replacements.

## Fixed design and inputs

campaign.json fixes the cell/mode/input mapping and four cyclic orders (16 slots,
one attempt each, sequential). P0/C0 receive identical original TASK.md bytes;
P1/C1 receive identical augmented bytes. Original text and environment facts are
an unchanged prefix. Only core presence and context presence differ. Source,
dependencies, tools, permissions, runtime and budget are otherwise equal.

Use environments.py's normal TASK.md, then public-context/prepare.mjs. Bind both
variant hashes, source manifests, successful receipt and snapshot hash to the
ordinary freeze. Replay v2 into a fresh directory offline and compare full bytes.
The augmented task limit remains 131071 bytes. Author mounts contain only the
appropriate TASK.md, never snapshot/audit/receipt/cutoff evidence, gold/test data,
historical solutions or reports. Each slot uses a new clean session/container;
no memory, solutions, tests or result transfer between cells.

Reuse materializer, runNativePhase, container-session, scheduler, transport,
recorder, capture, evaluator, stop policy and report fields. No new launcher or
wrapper bypass. Existing default preparation is P/H0/H1 and campaign preparation
is P/C/T; neither describes this experiment without explicit evaluation wiring.
No product/core/default/prompt/strategy/OpenCode/dependency/evaluator changes.
No D, TYPE_COMPAT, investigator, review or other opt-ins.

## Acceptance and future admission

Require repository checks, official baseline/gold controls per selected task,
actual isolated input/manifests, scripted four-cell real-launcher delivery with
whole TASK.md assertions and core only in C cells, exclusion assertions, and
existing container/capture/termination controls. Keep empty/contradictory/withdrawn/
hostile public-context controls. Scripted requests measure mechanics, not quality.
Author network none, isolated HOME/XDG, no host credentials/config or external
web/MCP tools; the relay is model-only. webfetch denial alone is insufficient.
No real-provider request is permitted during preparation.

The future command, only after a complete committed freeze and separate permission:

```sh
POLYBENCH_CAMPAIGN=evaluation/polybench/campaigns/public-context-development-v1/campaign.json \
  node evaluation/polybench/run.mjs local/public-context-development-v1/batch --authorize-model-runs
```

This is a planned command, not a claim that admission is ready or model available.
Use OpenCode 1.18.26, openai/gpt-5.6-luna, high, 1800 seconds per complete attempt.
No automatic substitution. Existing taskStarted/deadline includes startup,
title/parent/author requests, native tools, checks and delivery after timer start.
Preparation, evaluator, capture and cleanup are separately recorded using existing
timing fields; never subtract post-start overhead retrospectively.

Stop admission on missing/changed freeze, failed controls, isolation/capture/
termination failure, credential/runtime/model mismatch, unknown provider submission,
recording loss, preparation/evaluator errors or existing scheduler stop conditions.
No retries, extra candidates or silent continuation past an unreviewed disposition.

## Prespecified reporting

Retain official resolved as R; actual complete autonomous patch delivery as T
(with terminal/capture/roundtrip/applicability evidence); correct delivery D = R
AND T. Unknown R/T stay null unless a known false determines the conjunction.
Confirmed model errors and official evaluator FAIL remain failures, not unknown.
Report preparation/evaluator errors separately; preserve not_started, incomplete,
unknown, every failed attempt and full patches including authored tests without
repair/filtering. No synthetic zero-score results are created before attempts.

Use results.py paired counts for P1 versus P0, C1 versus C0, C0 versus P0 and C1
versus P1 for R/T/D: win/loss/tie when both values are booleans, otherwise unknown.
Never attribute C1 versus P0 to harness alone. This is descriptive development
screening, with no confirmatory superiority claim on four tasks.

Use existing timing and usage fields for every actual provider request, including
title/parent/child. Cached and reasoning tokens are included subsets, not extra
summands. Missing usage/cost stays unknown; scripted usage is separate. Positive,
negative, harmful and unchanged results are all valid. Positive results can only
motivate separately authorized evaluation on a fresh set; no automatic expansion
or enabling B by default.

## Reproduction sequence

Use this branch's adapter, with product extracted from the accepted SHA. Verify
`selection.json` against the exact CSV with `verify.py --consolidated-dataset`;
`selection.public_context_pool` reconstructs the bounded metadata candidate order.
Source/cutoff metadata and API snapshots are private preparation evidence. They
must be reviewed before `prepare-context.mjs` and never mounted for participants.
Do not replace selected IDs or silently regenerate existing outputs.

Set `POLYBENCH_CAMPAIGN` to this directory's `campaign.json`, `POLYBENCH_MODEL` to
`openai/gpt-5.6-luna`, and `POLYBENCH_VARIANT` to `high`. The supported sequence is:

1. Finish pinned evaluator checkout, Python 3.12 and requirements.lock installation;
   verify evaluator integrity and exact CSV/subset bytes before controls.
2. Run `remaining_controls.py`, `runtime.mjs`, `prepare_diagnostic.py`, then
   `prepare_authors.py`. Inspect every fixed-task disposition before continuing.
3. Run `prepare-context.mjs` to invoke the existing public-context prepare CLI,
   offline replay and actual augmented-input preflight. Originals stay unchanged.
4. Run `preflight_ready.py` for the four-cell real scripted launcher and unchanged
   official patch-export control. Run `verify-container.mjs container-preflight-final`
   (includes exact capture roundtrip), `verify-output-boundaries.mjs` with the
   immutable diagnostic image, and `verify-recording.mjs` in the private directory.
5. Run repository/installed checks, commit adapter changes, then `freeze.mjs`.
   Review and commit its public manifest byte-for-byte as `frozen-manifest.json`.
   The real launcher requires all four tasks ready and the committed freeze.

Do not use `prepare.py --full` for this experiment: it would invoke shared
preflight before the two context inputs exist. The sequence above uses the same
preparation modules and the same launcher; there is no alternate launch wrapper.
Only TASK.md is duplicated into the context source. Source/dependency manifests
must match after excluding precisely that file, and same-variant P/C cells share
one identical source path. All four cells use only plain or core bundles.
