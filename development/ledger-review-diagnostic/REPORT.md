# Ledger diagnostic review: blocked before model execution

**Reviewer utility is unproven. Neither real reviewer slot started.** The one
permitted scripted preflight failed before sending any request. This report
preserves the prepared objects and the exact preparation failure; it is not a
negative model result or a completed two-review experiment.

| Object | Normal completion | Confirmed findings | Unsupported / incorrect | Unverified / hypotheses | Known violations missed | Time / requests / tokens |
| --- | --- | --- | --- | --- | --- | --- |
| candidate-A, historical AR0 | not_started | not assessed | not assessed | not assessed | not assessed; no reviewer output | 0 s / 0 / 0 |
| candidate-B, calibrated reference-derived | not_started | not assessed | not assessed | not assessed | not assessed; no reviewer output | 0 s / 0 / 0 |

No reviewer responses or findings exist, so no findings-validation reproductions
were run and no additional implementation audit was undertaken. Absence of a
review is not a missed-finding measurement. Historical AR0/AR1 Q=false, T=true,
D=false and raw 20/23 and 17/23 remain unchanged; those are not metrics for this
review stage. The earlier plain run and its costs also remain unchanged.

## Prepared evidence

[Plan](PLAN.md), [provenance](provenance.json) and [safe receipts](result.json)
bind two complete implementations to the common historical baseline and exact
1,468-byte original task. candidate-A applies the unchanged saved AR0.patch.
candidate-B restores the historical reference archive and applies only the
previously saved reference-compatibility.patch. Its full file/mode inventory
matches the previously calibrated copy; all referenced historical receipt hashes
and available lengths match. Those receipts are reused, not rerun or rescored.
No universal correctness or current full-gate claim follows from calibration.

Each private candidate has one new baseline commit, its complete working diff,
no origin or reflog, and no evaluator/author history. The existing container relay
adds the reviewed candidate commit. The model would receive original task,
explicit baseline and complete tracked/untracked snapshot through the existing
command. Host structural checks exercised snapshot assembly with supplied allow
rules; they do not prove installed permission discovery or model delivery.

The installed core bundle was materialized with `--review` only. Reviewer/core
prompt bytes, snapshot implementation, transport, collector, evaluator, defaults
and lib/ are unchanged. Only generated installation paths were remapped to the
container mount. The small scheduler change admits exactly this two-slot plan
and its one neutral scripted preflight, with the stipulated 600-second budget.
No admission was borrowed from an author experiment.

## Actual blocker and cleanup

The preflight failed during `opencode debug agent harness-reviewer`, before the
native review launch. The snapshot returned `Native reviewer permissions
unavailable`; direct read-only diagnosis of the retained container returned
exit 1 with `Unknown: FileSystem.writeFile (/template/.gitignore)`.

The development preparation omitted `.gitignore` before mounting the bundle
read-only. OpenCode attempted to initialize that file. This is a preparation
error, not missing credentials, a provider refusal, a model finding, or evidence
that the diagnostic role cannot work. The existing auth was present/unexpired
and the pinned image existed, but no availability request was made.

The same snapshot prerequisite prevented the wrapper's initial capture. The
scheduler closed admission and retained the stopped container as
`evidence_incomplete`. The existing `native-output-retention/recover.mjs` then
copied the existing empty native records and fixture patch/output evidence,
verified capture and removed that exact container. Initial failure receipts were
not overwritten or relabelled as a successful preflight. Local workload stop,
closed forwarding and zero active handlers were recorded. No unknown provider
submission exists because no request was forwarded.

The permitted one preflight attempt was used; no retry, model session, author
run or repair was performed. No real-run freeze was created, and preparation
still has `preflightPassed:false`. Continuing would require a separately
authorized corrected preparation/preflight; this report schedules nothing.

## Verification and resource accounting

- Structural input/tree, complete patch custody, original task, saved calibration
  receipts, unchanged bundle components and private accounting checks pass via
  `node development/ledger-review-diagnostic/verify.mjs`.
- One scripted preflight attempt: 4.890 s, zero native sessions, zero local
  provider requests, zero real provider requests. Startup diagnostic and recovery
  are separate preparation operations, not reviewer attempts.
- Real reviewer input/output/cached/reasoning tokens: all zero, with zero unknown
  usage requests. Cached/reasoning are subsets, not additional totals. No cost is
  inferred; developing-agent/preparation work is excluded from reviewer usage.
- Installed task/base delivery, actual read-tool inventory, a native read,
  reviewer request/response recording and normal review completion: **NOT RUN**.
  The preflight stopped before these observations. Model usefulness and findings
  validation: **NOT RUN**.
- Existing scheduler regression checks pass: 16 mock scenarios, 13 synthetic
  fetch dispatches, zero real requests. This is separate from the single
  installed preflight and creates no native reviewer sessions.
- Syntax and scoped whitespace checks plus one final diff review pass. No full
  controller suite, retention matrix or pnpm verify was run for unchanged runtime.
  Local checks are not CI evidence.

The positive diagnostic criterion cannot be evaluated. Both slots remain
not_started; no review→repair pipeline, automatic reviewer or next campaign is
introduced. Private projects, patches, assessment and raw captures stay outside
Git. Publication is limited to the authorized partial report in draft PR #25.
