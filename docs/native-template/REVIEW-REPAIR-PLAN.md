# Separate native review and bounded repair: development plan

Source report: `42af300a5bcf17da7c542879d7a20a61305b556d`.
Recorded before provider execution, 2026-09-08. This is mechanism development on
three reused tasks, not an independent evaluation or a lift estimate.

Exactly the three on patches from the published second batch are used, without
selection. Historical instructions, patches, worktrees and outcomes stay unchanged.
New copies have neutral labels and only original/supplied Git history. Fixed review
order: collectors candidate, ledger control, Cursor candidate, collectors control,
ledger candidate, Cursor control. All six inputs, task bytes, prompts, runtime
config, runner and this rubric are hashed before the first provider request.

Controls use public corrections `0f8b1c7`, `9e389a6`, `bbff8e4`. Collectors uses
seven adapter/shared files, diagnostic definitions and public reader/diagnostic
tests. Ledger uses those adapter/shared files, diagnostic definitions and nine
public ledger regressions with their migration fixture; existing preservation
tests remain. It does not import the broader PR's Codex, server, release or
persistence changes. Its verified scope is adapter accounting only, subject to
preflight; full collection/config delivery remains unproven. Cursor uses its
version implementation, parser/CLI/sync tests and four support documents, excluding
release and wrapper changes. Public provenance does not establish correctness.
Any new control finding must be validated on its own merits.

Each review is one fresh ordinary native OpenCode session, build agent, native
tools, unchanged materialized core, OpenCode 1.18.26, gpt-5.6-luna / low, maximum
900 seconds. Review-only instructions supersede implementation language in the
quoted original task. `/input` is the read-only supplied tree; `/work/repo` is a
separate diagnostic copy. No other case, arm labels, author completion message,
research documents, external probes or reference patch are mounted. The same
model in a separate context is not an independent model architecture.

The reviewer checks the original requirement, not arbitrary improvements. A
finding needs a violated obligation, code/coverage location, reproducible example
or checkable explanation, expected behavior grounded in the public contract, and
explicit uncertainty. No findings is permitted and does not prove correctness.

After all six reviews, adjudicate each atomic finding as confirmed defect,
confirmed missing obligation, unsupported assumption, or false requirement. Track
misses separately using unchanged independent checks and source inspection. Do
not alter this rubric or retry a review after seeing its result. Missing new tests
are a delivery obligation only where explicitly required or needed to demonstrate
the requested behavior; optional test style is not a mandatory requirement.

At most one fresh native repair session per candidate having a concrete justified
reviewer finding, up to three. Give it original task, saved candidate, its review
and reviewer-generated diagnostics only. Do not add evaluator findings, omitted
bugs, references or a ready fix. Assumptions are not repair commands. Preserve
both patches; run independent functional and preservation checks afterward, with
shipped tests checked for valid expectations and sensitivity on original source
where relevant. Successful text or unit checks do not imply complete delivery.

Save private raw artifacts locally; publish only source-grounded findings, test
counts and limits, hashes and accounting. Count sessions, provider requests,
wall time and token/cache fields separately; unavailable billing remains unknown.
No new initial implementation, runtime/plugin, core edit, second reviewer,
repeated attempt, historical rescore, p-values, general lift, default change,
merge, release or large evaluation. Propose integration only if observed repairs
justify it, checking installed SDK/events before implementation.

## Preflight boundary recorded before reviews

Collectors control: 93/93 ordinary reader/diagnostic checks. Cursor control:
all three supplied suites passed. Ledger control: nine selected public accounting
regressions passed; combined ordinary checks 210/212. The retained Qwen old-state
component regression and cutover-confirmation test fail. These are explicit
unresolved control limitations, not hidden correct-delivery claims. The positive
control scope is the nine checked ledger sequences only; its two failures must
not inflate false-positive counts. No source changes were made to rescue preflight.
