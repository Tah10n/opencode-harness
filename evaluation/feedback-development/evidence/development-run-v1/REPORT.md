# Feedback development v1: stopped before real provider execution

The requested sixteen real task-runs did not complete. The single authorized
campaign entered native slot 1, direct, then stopped before any upstream request.
The other fifteen assignments remain not_started. There is no direct/D quality
comparison and no conclusion about the usefulness of D corrections.

## Exact stop and request accounting

The first actual relay frame was a title request for `gpt-5.6-luna` with
`reasoning.effort=none`. The committed experiment requires
`openai/gpt-5.6-luna`, `high` for every request. The existing scheduler recorded
the mismatch and persisted `boundary_refusal`, slot 1, before reading credentials
or forwarding the request. Six subsequent work frames requested the configured
model/high but were refused as `series-paused`. They are accounted as blocked
relay frames within that same native attempt, not additional real task-runs.

There are **7 recorded relay frames, 0 real provider requests, 0 returned provider
model IDs, 0 author stages and 0 tool calls**. Authorization and real model
availability were never tested. The installed scripted fixture had used the
explicit fixture model; its successful title/author/correction traffic did not
prove the real named model's title effort. Actual request capture exposed this
coverage gap. No effort exception, substitute model, live probe, extra reviewer,
retry of the campaign, or change to runtime/configuration was introduced.

OpenCode exited 1 after 72.059 seconds. Native normal completion is false.
External termination, complete capture, relay removal and zero active handlers
are verified in the [safe delivery evidence](delivery-evidence.json). The scheduler's one completed.json means local termination was
confirmed; it does not mean an author completed or a task was delivered.

The complete captured patch is [empty](patches/01-invoice-discount-direct.patch).
Its roundtrip reproduces the untouched baseline. An offline evaluator applied
the full unchanged patch and completed the independent checks:
[R=false](independent-evaluation.json), delivery=false, Q=false. This is a
technical-stop artifact, **not a demonstrated model solution failure**. Neither
acceptance nor another attempt's results reached an author/provider.

## Frozen provenance

- Accepted stage-2 head: `f63bee5853a0babff838e53b23b9820b1043c667`.
- Verified executable source: `8b5609dd556d05d10057cb3c8390534675c1b9f4`.
- Pre-run commit, including the safe execution seal:
  `36b9b714037ec84e805e45420ce3808b258d3b88`.
- Private execution freeze SHA-256:
  `b1cac1a464b60277fc16e85758d5fd5a1239ae80bcd96287ab3c8f7262e2fc4b`.
- New immutable image:
  `sha256:6ddc119af8a204548428504ef970a44640edfaa3238deacb558825ee25bce181`.
- Actual contained toolchain: Node 24.19.0, OpenCode 1.18.26, npm 11.17.0,
  Git 2.39.5. OpenCode binary SHA-256:
  `096d32aa9778f98981390a0602c1f8af55ee5f1d6d5c58206f8fb2743c90eafe`.

The [safe committed seal](../execution-freeze.json) contains model/variant,
image/toolchain/bundle/dependency/input hashes, fresh preflight receipt hashes
and all sixteen ordered assignments. The full execution freeze, source paths,
recordings and runtime state remain private, outside Git. This image was built
once for this campaign; it is not presented as either historical fixture image.

Comparison with the accepted head confirms unchanged product core/native
runtime, all eight source trees, public/acceptance tests, gold/wrong controls,
permissions, interventions, direct/D distinction, order, scoring and 600-second
budget. Source and public protocol were committed before admission. Both arms
use the same native runner, materialized bundle and provider recorder. Product
and global OpenCode settings were not changed. No executable adapter change was
made after admission.

PR #32 was made Ready at the accepted head. Its three CI jobs passed, but merge
requires one qualifying approval; reviews were empty and REVIEW_REQUIRED
blocked integration. This Draft [PR #33](https://github.com/Tah10n/opencode-harness/pull/33)
is consequently stacked on `eval/feedback-development-v1`. No protection bypass,
force push, PR #30/#31 operation, release or package publication was performed.

## All sixteen assignments

F = false; ? = unknown; NS = not_started. Time is native execution, including
startup and the failed local attempt. The token columns show actual provider
traffic, which is zero. Original nullable request/token/status/correction fields
are separately preserved in [machine-readable results](results.json), together
with explicit observed counts and reasons. Missing values are not synthetic
passes or task failures.

| Slot | Task | Mode | State | R | delivery | Q | Internal status | Corrections | Time, s | Provider requests | Input/output tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | 01 invoice discount | direct | technical_stop | F | F | F | ? | ?; 0 author stages | 72.059 | 0 | 0 / 0 |
| 2 | 01 invoice discount | D | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 3 | 02 CLI limit | D | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 4 | 02 CLI limit | direct | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 5 | 03 wallet cancel | direct | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 6 | 03 wallet cancel | D | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 7 | 04 invite redeem | D | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 8 | 04 invite redeem | direct | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 9 | 05 query arrays | direct | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 10 | 05 query arrays | D | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 11 | 06 once events | D | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 12 | 06 once events | direct | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 13 | 07 config merge | direct | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 14 | 07 config merge | D | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 15 | 08 options refactor | D | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |
| 16 | 08 options refactor | direct | NS | ? | ? | ? | ? | ? | — | 0 | 0 / 0 |

Started native attempts: **1**; normally completed: **0**; locally terminated and
captured: **1**; not_started: **15**. All **8 pairs are unknown**. Candidate
wins/losses/ties are **0/0/0 because no pair completed**, not an equality result.
Q rates, delta Q, and relative D time/tokens are unknown. Correct delivered model
solutions have no observed samples in either mode. D correction attempts are
zero. There are no differing author trajectories, common model failures or
model corrections to interpret; the saved trajectory contains only the title
boundary refusal and subsequent closed-admission frames.

## Costs and independent verification

Participant provider input/output/cached/reasoning tokens are zero because no
request was forwarded. Cached and reasoning tokens remain included subsets.
Money is unknown without billing evidence. Per-attempt preparation, independent
scoring, capture and cleanup durations are separate in results.json. The 72.059 seconds
of failed native execution are not an observed D overhead.

Model-free controls use synthetic tokens; they are not participant model
expenses. Developer Codex usage and CI compute costs are unmetered/unknown;
neither had additional real experiment reviewer/diagnostic model requests.

- PASS: fresh contained eight baseline/gold/wrong triples and two additional
  negative controls, preservation baselines, public gold checks in the same
  image, and existing scoring/completion controls.
- PASS: existing installed scripted direct/D; direct R=false/delivery=true,
  D R=true/delivery=true with one correction; repeated-slot refusal before auth
  or provider access. These are synthetic fixture outcomes only.
- PASS: unchanged five-second stop controls for both arms in a fresh directory.
  The first invocation stopped before reaching its hanging command; that initial
  failure is retained, not relabelled as a pass.
- PASS: all five verify:installed components, including 39 native delivery
  scenarios, using loopback providers.
- PASS: 19 native/structural/evaluation components in the frozen Linux image;
  Python PolyBench verification and final adapter checks on the host complete
  coverage of all 21 components after the last executable edit.
- FAIL: initial macOS npm run verify at unchanged sensitivity cancellation;
  its addressable recheck also failed. The PID was subsequently absent.
- FAIL/environment unavailable: Linux aggregate completed 19 components then
  found no Python executable. No package or runtime was installed into the
  already frozen campaign image to alter it.

PASS: all three hosted CI jobs on the pre-run head in
[run 37156236626](https://github.com/Tah10n/opencode-harness/actions/runs/37156236626).
Final-head CI is reported in the [Draft PR checks](https://github.com/Tah10n/opencode-harness/pull/33/checks)
and publication handoff separately from these local checks.

## Evidence retention and owned cleanup

The [cleanup receipt](cleanup-evidence.json) records archive hashes and verified
removal. All raw evidence, private freeze and recordings are retained in
`local/feedback-development-run-v1/private-evidence.tar.gz`, outside Git.
Every archived member's bytes and modes were checked before deleting its source.
The exact image archive was loaded once and recovered the frozen image digest.
The assets archive roundtrip matched the complete frozen bundle manifest,
dependency files, symlinks, modes and OpenCode binary hash.

All 70 recorded attempt/evaluation containers are absent. The owned builder,
its state volume, and the campaign image tag were removed. The builder's recorded
logical cache size was 491.3 MB; physical Docker space reclaimed is not inferred
by summing shared layers. Owned copied assets, duplicate binary/package files,
npm cache, fixture/check directories and the retained failed sensitivity fixture
were removed: 628,817,615 logical bytes, 641,462,272 allocated file bytes
(611.7 MiB). No roundtrip temporary directory remains.

Three verified private archives retain 208,801,122 bytes (199.1 MiB) for exact
environment reproduction and raw evidence, alongside the small batch data,
admission marker and persisted pause. Existing shared dependencies, base images,
other users' resources and earlier campaign artifacts were preserved. No global
prune was performed.

Run `python3 evaluation/feedback-development/evidence/development-run-v1/verify-evidence.py`
from the repository root to check the published slot identities, stop, complete
patch, scoring and immutable source bindings without any provider or runtime run.
