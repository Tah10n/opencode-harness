# Independent diagnostic ledger review

This development study checks the existing `/harness-review` on two saved full
implementations of the same original task. It does not repair implementations,
change the reviewer, or establish improved delivery. PR #25 retains its draft
state and `feat/native-template-regression-workflow` base.

The planned order is fixed: slot 1 candidate-A (unchanged historical AR0), slot 2
candidate-B (historical reference plus the previously saved compatibility patch).
Both derive from VibeRacing baseline
`2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd`. The control is calibrated against the
checked contracts, not proven universally correct. Provenance and the private
assessment are outside all reviewer mounts. The preparing agent knows the
mapping; only reviewer context is isolated, and diff shape may reveal clues.

Use the exact 1,468-byte `plain-ledger-native-high/original-task.txt`, including
all preservation and verification requirements. Preserve complete patches,
project tests/docs, modes, deletions and new files. A fresh ordinary Git baseline
plus candidate working diff supplies two commits inside the existing container
relay. No origin, old history, evaluator or author conversation is included.
`TASK.md` is excluded from Git so it does not alter the implementation diff.

Materialize native core with `--review`, without `--task`. The existing command
reads `HARNESS_REVIEW_BASE` and `HARNESS_REVIEW_TASK_FILE`; installation paths only
are mapped to `/template`. The reviewer prompt and read/glob/grep permissions are
unchanged. Bash/edit/write/task/todo remain denied. No tests run in reviewer
sessions; absent check evidence is NOT RUN. No APPROVED/SAFE verdict is requested.

Both planned fresh sessions use OpenCode 1.18.26, openai/gpt-5.6-luna, high,
600 seconds including auxiliary requests, the existing configured OAuth route,
and pinned image `sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`.
Keep network none, UID node, read-only mounts/rootfs, two CPUs, 3 GiB memory,
1.5 GiB work tmpfs, 512 PIDs and the existing transport/collector. No additional
model, author, repair, retry, availability or smoke runs are authorized.

Before any real request, one small neutral scripted preflight must verify task,
base, complete snapshot, a native read, tool denial, recording, normal termination
and cleanup. Only after it passes may a local freeze commit bind assignments,
task/diff/runtime hashes and criteria. The real launcher also requires that
committed manifest. Unknown submission, auth/quota, incomplete evidence or any
admission closure stops new sends; remaining slots stay not_started.

After both sessions, validate only actual substantive findings on separate
copies: contract, input, entry point, observed behavior, reproduction and limits.
Classify confirmed, unsupported, incorrect, unverified or hypothesis. Deduplicate
root causes without altering original responses. Do not require a reference
layout or exact diagnostic-code spelling. Use the previously saved four concrete
AR0 violations for misses; retain source-review overflow concerns as hypotheses.
A real new control defect limits calibration rather than automatically becoming
a false positive. No patches are repaired and no historical scores change.

A minimal positive diagnostic signal requires both normal completions, at least
one independently found concrete reproducible AR0 contract violation, and no
confirmed false mandatory control finding. Mixed results stay mixed. Even a
positive signal neither enables a default reviewer nor proves improved complete
delivery. Report per-slot time, requests, native reads, input/output tokens and
cached/reasoning subsets separately, including unknown usage. Preparation and
this developing agent are outside reviewer usage. No monetary estimate.

## Actual admission outcome

The single scripted preflight failed during installed permission discovery,
before any provider request or native session. The startup error was
`FileSystem.writeFile (/template/.gitignore)`: the development preparation copied
dependencies but omitted this OpenCode initialization file before the read-only
mount. Runtime and permissions were not changed. No second preflight was run.
Both real slots remain not_started; a real-execution freeze was never admitted.
The initial snapshot/capture failure and recovery are retained separately.
This is a preparation blocker, not evidence about reviewer utility.

## Authorized continuation after preparation failure

The user subsequently requested the fix after the explicit continuation question.
One corrected preflight is authorized, followed on success by the original two
real slots and one additional publication. The failed preflight and its closure
remain historical and are never resumed. A separate corrected bundle adds only
OpenCode's initialization `.gitignore`; no prompt/runtime/permission changes.
The corrected preflight passed with one native session, three scripted requests,
one read, full task/base/tracked-untracked snapshot, complete raw recording and
verified unchanged state/cleanup. Both real slots are still not_started at freeze.
The original decision criteria, 600-second budgets and no-retry rule remain.
