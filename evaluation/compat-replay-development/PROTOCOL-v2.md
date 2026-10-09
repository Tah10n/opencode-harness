# Compatibility replay development v2

This is one newly authorized development rerun after the readiness repair,
not a continuation or independent confirmation of v1. The immutable
[v1 protocol](PROTOCOL.md), seal and evidence retain their original identity.
V1 is terminally closed even if its local admission marker is unavailable.
Do not pool its two started attempts with these twelve positions.

The six tasks, alternating control/candidate order, D author/correction prompts,
public corpus, independent evaluator and definitions of R, delivery, Q and pair
admission in the v1 protocol are unchanged. Each task/arm gets one attempt with
openai/gpt-5.6-luna/high, OpenCode 1.18.26, Node 24.19.0 and 600 seconds total,
including probe and corrections. No retry, fallback, extra inference probe or
third campaign is authorized. Ordinary proven solution failure does not stop the
scheduler; technical admission/containment/termination failures do, with remaining
slots not_started. After the first request, no executable inputs may change.

Identity: `compat-replay-development-v2`; canonical directory:
`local/compat-replay-v2/batch`; execution seal and report:
`evidence/development-run-v2/`. Historical readers select identity from the freeze,
without reinterpreting v1 paths as v2.

## Mandatory sequence

The model-free `prepare-ready.mjs` launcher waits for every command to exit:

1. Install locked root and sensitivity dependencies, materialize the pinned bundle.
2. Complete `npm run verify`, including repository wrapper import and admission tests.
3. Complete `verify:installed` with the pinned host OpenCode.
4. Complete existing actual container boundary, six-task experiment controls,
   installed corrective delivery and both native deadline controls.
5. Execute all twelve slots with scripted responses via prepare, runPrepared,
   shared scheduler, capture and independent report; all six candidate repairs
   must consume a concrete mismatch and finish with a fresh matched snapshot.
6. Obtain actual completed/success GitHub run/jobs/steps for all three required
   checks on this source head, retain job logs and verify checkout commit inputs.
7. Atomically publish readiness only after unchanged source/runtime manifests.
8. Prepare the real freeze, commit its execution seal and recheck admission before
   accessing credentials, creating the exclusive marker or issuing a request.

Missing/running/failed/interrupted checks and changed source, verification scripts,
locked dependencies, bundle, toolchain or image reject admission. Authorization to
use a model cannot bypass readiness. Fixture execution never uses credential
loading and must supply the local scripted transport; real fetch is rejected.

Readiness names a checked source commit separately from later evidence commits.
Only the declared v2 JSON evidence and REPORT.md may differ after that source;
all executable manifests must still match. Logs remain private; published receipts
retain their paths/hashes and GitHub metadata. An incomplete launcher saves step
failure evidence, never a successful readiness receipt. Rerun preparation on a
fresh owned directory after a technical fix before any real request.

Report v2 separately from technical tests and v1 costs. Scripted wins test wiring,
not model quality. If no additional repair is observed, state:
«На этом development-наборе добавочная польза не показана».
Any improvement is at most a limited development signal, not superiority over
Plain. Keep the component experimental. Stop after the report; no promotion,
Ready, merge, release or deploy.
