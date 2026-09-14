# Explicit launcher amendment: continue only original slots 19–48

This amendment is authorized by the user's 2026-09-14 instruction, before any
new provider call. Publication starts from `2a3fc3098998f6eef7ad648ded0b09a55b760233`.
The measured H00 remains `1cebebb082163250a0f78269acc164edfc3c6268`: direct,
A=0, B=0. This is the remainder of the same 48-slot sample, not another campaign.

## Defect and bounded change

The old `run-comparison.mjs` catch overwrote a previously observed completed
provider response with unknown submission after AbortError. Its own-deadline
branch also wrote unknown without considering an already parsed terminal event.

The existing parser/forwarding path now binds response lifecycle events to the
current request's response ID, recognizes actual `response.completed`,
`response.failed` and `response.incomplete` forms, and persists those facts
before forwarding a chunk can fail. SSE boundaries may span chunks and use LF
or CRLF. Terminal status is independent of transport errors, usage and native
completion. Duplicate terminal delivery is idempotent; conflicts, invalid
binding or malformed lifecycle data cannot establish known terminal completion.

Known usage is retained once, including cache/reasoning subsets; absent usage
remains unknown. No synthetic native stop, success exit, response or replay is
introduced. A late transport error may end a failed slot; subsequent admission
still requires verified local termination, closed forwarding, saved captures and
container removal. Auth/quota status remains a scheduling stop even if reading
the refusal body is interrupted by our deadline. Active/unverified tools stop
scheduling independently of provider completion.

The changed executable entry points are `development/native-task-ab/run-comparison.mjs`
and `run.mjs`; the existing `verify-scheduler.mjs` is updated for the observed
protocol and deadline cases. Two directly related model-free check scripts test
real native lifecycle and continuation admission. Exact before/after hashes are
in [manifest.json](manifest.json); H00 modules and all other frozen bytes retain
their original hashes. This does not fix H00's incomplete reporting or webfetch.

## Explicit continuation admission

The original freeze, pause, outcome, first 18 attempt records/captures/patches,
quality decisions and prior public reports remain unchanged. Slots 9 and 18
remain their recorded failures and are never resent or resumed.

Run the existing entry point with the original root and the explicit private
amendment file as its second argument. It verifies the original freeze/pause,
launcher versions, all 18 historical identities and stop facts, capture and
preservation hashes, and absence of historical containers. Unknown run
directories or any historical artifacts for slots 19–48 are rejected. The
continuation output directory must not already exist. Its own admission, runs,
pause and outcome are written under `continuation-19-48/`; the old pause is never
deleted. A subsequent restart is rejected rather than automatically resumed.

Only original slots 19–48 run, in their original order: finish repetition one,
then run repetition two. Fresh source/session/home/XDG state is used for every
attempt, with the original image, executable, dependencies, full user task,
permissions, Luna/high and 900-second inclusive deadline. Both P and H00 use
this same corrected launcher. No scores, sensitivity probes, references or
previous session state enter an author container. Real extra smokes and retries
remain zero. Unknown live execution, isolation breach, auth refusal and quota
stop new attempts; no endpoint/account/permission bypass is authorized.

## Analysis of two execution periods

Preserve and display slots 1–18 as the pre-amendment period and slots 19–48 as the
post-amendment period, with no favorable selection. The combined result is an
**analysis of a series with a launcher amendment**, not uninterrupted execution
under one unchanged protocol. The correction can affect operational stop rates.

Use the original Q/D rubric, equal task means over both independent repetitions,
and the preregistered paired project-block analysis. Do not treat runs as
independent tasks or select the better repetition. No new interval or sample
size is chosen after outcomes. Retain raw evaluator results; the already
disclosed callback-order interpretation applies uniformly. The denque
calibration gap, fallible controls, assessor limitations and retained-image
reproduction limitation remain explicit. Statistical intervals cannot remove
those limitations or automatically establish the original product objective.

After execution publish all 48 slot states, separate periods, repetition changes,
Q/D, loss categories, time/requests/tools and known/unknown usage. Preparation,
local fixtures and Codex orchestration remain separate costs. Preserve existing
reports; publish continuation results alongside them. No merge, release, default
change, package publication, manual Actions or full platform matrix.
