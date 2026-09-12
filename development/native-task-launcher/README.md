# Future external launcher revision

`run-pilot.mjs` is the future revision of the existing local comparison launcher.
It exports `runPilot({root, startContainer, captureCandidate, runOpenCode,
stopWorkload, readAuth, fetchImpl})`. Supply the existing container/native adapters
and normal OAuth reader from the external launch environment. The fixed model,
runtime, budget, freeze checks, capture and offline grading boundaries are retained.
There is no CLI that starts a paid run merely by importing this module.

Use a separately prepared and authorized future root. Do not point it at the
historical comparison or resume its 200 assigned slots. The historical local
runner, freeze and outputs have not been modified. This revision does not grant
permission for another evaluation.

At HTTP 429 the relay reads at most 8192 diagnostic bytes. A structured
`error.type=usage_limit_reached` is quota exhaustion; other, malformed or truncated
429 bodies pause scheduling as unknown. The bounded type/message, HTTP status,
slot and truncation flag are retained in `scheduling-paused.json` and request
metadata. Headers, authorization and complete response bodies are not published.
The first refusal closes forwarding before invoking the existing `stopWorkload`
boundary. The native runner then completes its existing termination/capture path;
container teardown still runs on errors. Partial candidate and observed usage
remain in the current slot. No directory/result is created for the next slot.
A pause marker also refuses automatic restart; it is not automatically cleared.
Missing usage remains unknown. A capture/termination error remains an error and
cannot permit the next slot.

`node scripts/verify-native-launcher.mjs` exercises this actual launcher with
scripted dependencies and the saved public quota type/message. It performs no
provider requests and establishes scheduling/retention behavior, not model quality.

## CI policy

Ordinary Verify runs select scope from changed paths. Only the five named
comparison report/data files are report-only; arithmetic and consistency checks
run on Ubuntu. Native task/review modules and their verifier scripts also select
installed native checks. The macOS and Linux helper builders select their respective
operational job. Unknown files, prompts, AGENTS.md, other Markdown, evaluators,
shared containment code and workflow changes select the full checkpoint.

A manual `mode=full` run preserves all existing operational assertions and exact
SHA/run-attempt receipt aggregation. Do not dispatch it after each commit or
PR-body edit. Ordinary PR/push triggers remain limited to main, preventing an
extra automatic run alongside the single manual diagnostic for PR #25's current
non-main base. Push-to-main and PR checks cover distinct commits; obsolete ordinary
runs on the same branch are cancelled. Manual checkpoint/evidence runs and the
separate model-backed workflow are not cancelled by this concurrency policy.

The required main-branch context is `Harness verification` (strict, GitHub Actions).
Its gate validates every selected producer result, including missing, skipped,
failed and cancelled producers. Full receipt aggregation runs only for a full
checkpoint and continues to require all four receipt producers. A manual
`mode=targeted` runs one short Ubuntu diagnostic job only; it does **not** publish
a successful `Harness verification` context and cannot serve as merge evidence.
The actual PR base is currently unprotected. Branch protection is unchanged.
