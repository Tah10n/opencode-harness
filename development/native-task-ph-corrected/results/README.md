# Four authorized continuations from the actual saved D-final patches

The corrected four-run diagnostic series is complete. **Neither P nor H produced a
fully acceptable patch on either selected task (P 0/2, H 0/2).** H's two corrective
replies did not convert the incomplete reconnect delivery into a complete one.
These reused known failures do not establish general lift, and the added correction
bound has no demonstrated complete-delivery benefit here. The workflow remains an
experimental, explicitly selected candidate; no fourth correction or new evaluation
is authorized by these results.

This series was explicitly authorized after disclosure of the [four invalid-input
attempts](../../native-task-ph/results/README.md). Those attempts and their expenditure
remain unchanged. Historical A/D, A/B/C, 20-pair and incomplete-quota artifacts were
not relabeled, replaced or revised. Statements in those immutable historical reports
about authorization and unfinished work describe their earlier point in time.

## Inputs, execution and local mechanism evidence

The [predeclared plan](../plan.json) and [freeze](../freeze.json) bind candidate
`2da6dfe47f0c8c92630146eb29b2daf9fbb05aac`, OpenCode 1.18.26,
`openai/gpt-5.6-luna`, low, 900 seconds per run, four attempts and zero retries.
Order: runtime P then H; reconnect H then P. Every public input file and executable
mode matched the saved D-final source; P/H received identical task text and ordinary
check results. Four separate Git-free source copies were checked inside the actual
container, with Git root `/work/repo` and zero provider requests. The shared inputs
are retained for [runtime](../inputs/legacy-runtime-reload/TASK.md) and
[reconnect](../inputs/reconnect-revoked/TASK.md), alongside `INITIAL_CHECKS.md`.
In particular, the supplied reconnect check was failing before either author started.

The current candidate's same-container scripted preflight passed (8 scripted requests,
0 real requests). Existing [local mechanism evidence](../../native-task-ph/local-validation.json)
records real controller tests, 18 installed scenarios/114 scripted requests,
template/review checks and the retained reconnect replay. The final caption-only
change was checked with the installed two-fix/permission scenarios (15 scripted
requests). No runtime code changed for this corrected series, and those successful
mechanism checks were not repeated without a new code change. Structural/fixture
success is separate from the model-backed outcomes below.

Existing host OpenCode/OpenAI authorization was used only for the permitted public
inputs/tools, with no auth store or grader mounted in author containers. All four
processes terminated within their deadline; no quota/refusal stop, retry, manual
patch repair, earlier-patch substitution, quota polling, manual Actions dispatch or
full platform matrix occurred. Each H run used one author session and worktree.

## Outcomes and cost

| Task | Arm | Seconds | Provider requests | Native tools | Corrections | Observed total tokens | Complete delivery |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| legacy-runtime-reload | P | 196.625 | 25 | 44 | — | 882,728 | No: required delivered migration/fresh-process regression missing |
| legacy-runtime-reload | H | 257.927 | 36 | 45 | 0 | 1,542,369 | No: rejects full legacy layout; regression bypasses migration |
| reconnect-revoked | H | 319.324 | 44 | 52 | 2 | 1,836,043 | No: delivered reconnect still fails; cleanup contract weakened |
| reconnect-revoked | P | 190.639 | 32 | 39 | — | 1,231,494 | No: green test loses independent disconnected scenario; cleanup contract weakened |
| Corrected series | | 964.515 | 137 | 180 | 2 | 5,492,634 | P 0/2; H 0/2 |

Both native H statuses are `incomplete`. Runtime H retained three host-rejected
parallel Git calls as uninterpreted failures, despite successful supported tests.
Reconnect H retained the real failing required reconnect check and stopped after two
consecutive corrective replies without substantive progress. Native statuses do not
replace independent patch acceptance.

[Outcomes](outcomes.json) preserve all frozen final/D0 check results and token fields.
[Expenditure](expenditure.json) keeps the old invalid series separate: its 133 requests
and 4,625,290 tokens plus this series total **270 requests and 10,117,924 observed
tokens**. Every forwarded request has usage. Cached inputs, reasoning and native
auxiliary requests are included; H and P did not have equal token/compute budgets.
The provider supplied no billed monetary amount, so monetary cost remains unknown.

## Actual correction contribution

Runtime H stopped after D0; no corrective reply contributed to its patch.
Reconnect H had the same substantive failure at D0, D1 and D2:

| Reconnect H stage | Seconds | Provider requests | Observed tokens | Patch contribution |
| --- | ---: | ---: | ---: | --- |
| D0 | 212.114 | 30 | 1,073,328 | Implementation still leaves delivered reconnect failing |
| Correction 1 / D1 | 61.013 | 8 | 500,755 | Indentation only; same failing required check |
| Correction 2 / D2 | 39.111 | 3 | 236,327 | No patch change; no substantive new evidence |

The two corrections consumed **100.124 seconds, 11 requests and 737,082 tokens**
without completing the patch. D1 and D2 hashes match. The controller stopped for
no progress before a third correction. [Stage usage](stage-usage.json) attributes
forwarding timestamps to newly added native message windows; three auxiliary
requests per H run stay in the total rather than being dropped or attributed to
correction. Timing attribution is accounting, not a causal estimate of effectiveness.

## What the independent checks do and do not establish

All final patches and available H D0 snapshots were checked in observer copies
only after the author stopped. Delivered tests ran before preservation/reference
tests were injected. No author received the grader, reference patch or these findings.
[Manual assessment](manual-assessment.json) separates working behavior, delivered
coverage, preserved behavior and static findings.

**Runtime P:** the existing independent full-layout migration case passes. A separate
exact-layout fresh-process preparation/reload and installed CLI check also passes.
Its delivered test, however, writes the marker before preparation and reloads modules
through query-string imports in the same process. It does not supply the required
unmarked migration or fresh-process regression. Runtime H retains a directory
`nlink === 1` condition: full-layout migration and fresh-process preparation both
fail with an unrelated `lib` entry. Its added test also uses a prewritten marker and
same-process imports, so its green suite misses the actual failure.

Two limitations in the **unchanged frozen runtime grader** were identified and are
not reclassified as passes. Its old reload fixture supplies only the launcher and
`lib/config.mjs`, then expects acceptance, contrary to the current exact-full-layout
contract. Both patches reject that fixture. Its rejection case expects a leaf name
in the error, while both reject the parent `lib`; later byte/mode assertions in that
case are therefore not reached. The reported frozen failures remain in outcomes;
they do not by themselves establish a required acceptance defect or complete
rejection-path verification.

The separately retained [exact-layout supplemental test](exact-layout-reload.test.mjs)
was introduced after reading the frozen fixture and completed model patches. It
uses the same fresh-process path with all files explicitly required by the task.
[Its results](supplemental-runtime.json) are P pass / H fail. This is disclosed
post-run diagnosis, not a replacement scored run, changed rubric, delivered author
regression or independent benchmark. It does not change either full-delivery verdict.

**Reconnect H:** independent 401/403 recovery and five lifecycle/source/ownership
checks pass, but its delivered reconnect suite is 4 pass / 1 fail. The disconnected
block executes after revoked pairing changed the available mappings, without
restoring the required starting state. **Reconnect P:** all frozen scoped checks
pass, including 401/403 and lifecycle checks. Its fixture now omits the retired mapping
when the preceding revoked pairing has already removed it. The subsequent green
`disconnected` block consequently no longer tests retiring an unavailable source
from its original independent state. Preserving its name/assertions is insufficient.

Both reconnect authors changed `disableLocalConnection` so `removeConfig()` failures
are counted with auxiliary warnings via `Promise.allSettled`, instead of propagating
before proceeding. Callers can then continue pairing or report authorization removed
although removal failed. This is a source-established contract regression; the frozen
checks do not inject that removal-failure path, so it is not presented as a dynamic
failure result. Neither patch can be accepted as a whole on the strength of green
401/403 examples. The ordinary/preservation suites also each contain one platform
skip; skipped coverage is not a pass. No universal safety or completeness claim follows.

## Retained deliveries and integrity

Final patches below apply to the original public task baselines and include the
saved D-final input plus each author's continuation. H phase patches in the
[manifest](patch-manifest.json) instead apply to the supplied saved D-final input.
All four stage patches were reconstructed on that exact input, not the old baseline.

- [Runtime P final](patches/legacy-runtime-reload/P-final.patch)
- [Runtime H final](patches/legacy-runtime-reload/H-final.patch)
- [Reconnect H final](patches/reconnect-revoked/H-final.patch)
- [Reconnect P final](patches/reconnect-revoked/P-final.patch)

[Artifact verification](artifact-validation.json) confirms reapplication bytes and
executable modes, verified termination, all four model containers removed, both H
original checkouts unchanged, 9,110 current frozen files, 9,099 historical A/D frozen
files, 7,774 prior invalid-series frozen files and 54 prior published evidence files
unchanged. [Resource verification](resource-validation.json) confirms all 19 recorded preparation,
preflight, author and offline observer containers for the corrected series are removed.
Raw sessions/tool outputs remain local. Results are observational evidence
from four selected continuations, not a demonstrated general benefit or a release gate.
