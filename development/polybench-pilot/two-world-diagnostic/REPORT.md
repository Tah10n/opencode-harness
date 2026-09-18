# Two-world post-hoc diagnostic

**Decision A: the two-copy protocol works on both pinned instances.** All six
complete deliveries apply, their F checks run, and independent E preparation
preserves production and executes the ready-made acceptance. None of the six
meets the unchanged independent criterion. This validates the diagnostic method
in this bounded scope, not the historical deliveries or a model improvement.

This stage applies the same precommitted protocol to the six retained P/H0/H1
deliveries for Serverless 6534 and Svelte 1190. It is post-hoc: these patches and
their application conflicts were already known. It changes neither model code
nor the historical official result, and supports no arm/lift comparison.

## Protocol and provenance

B is the exact dataset base, M the complete historical patch, and S is strict
B+T using the unchanged dataset test_patch. F is strict B+M, retained as an
immutable Git tree/archive. Tests execute on disposable copies. E starts with
the entire F archive in another isolated original-image container; only the
predeclared assessment surface is materialized exactly from S. New author files
inside the surface disappear only from E; all other source bytes, modes,
additions and deletions must match F. There is no T→M application, hunk repair,
production-only prediction, changed expected value or score threshold.

The plan and two manifests were committed at `35939cc5` before six-arm evaluation.
Historical M bytes match both `9317ccc9` and decoded predictions; the measured
harness runtime remains `e18db1fe`. Evaluator/parser/scoring is pinned to `9c836c5d`, dataset to
`b3fca77b637379f0c01ad86d18753a7ac1998b53`. Exact image digests, B commits, M/T
hashes, F trees and execution records are in the manifests and machine evidence.

Serverless restores only mergeIamTemplates.test.js, whose imports are chai and
local production modules. Svelte restores test/ (including all helpers, setup,
fixtures and sample discovery) and mocha.opts. Its source-side __test__.js
discovery is required empty; no author test can silently enter independent E
outside the declared region. No universal filename classifier is used. The
manifests explain each T path's role. Sourcemap output.* and SSR _actual.* are
written diagnostic products, unlike expected.css/html/js and _expected.*.

Svelte's original image package.json/yarn.lock and Serverless's Dockerfile are
separate hashed execution overlays, not B or M. Overlay/config intersections
with M are unsupported; none occurs in these six deliveries. The existing
Svelte lint=noop execution setting is disclosed, not counted as successful lint.
All compiler/SSR/shared/store outputs and generated shared declarations are
removed and rebuilt by the original npm pretest recipe on the current copy.
Source inventories, build-input/output hashes and require.resolve/realpath
checks bind execution to /testbed. No gold copy/build, host mount, shared writable
build directory or previous process cache is available. Original image
dependencies are retained, without installs.

Every path outside the assessment surface is compared before execution. Expected
files, assertions and setup are checked again afterwards; only declared image
and generated diagnostic outputs may change. F's immutable source is never
modified by E preparation or by its disposable execution copy. Process limits
are unchanged in scope: 1200 seconds, 8 GiB, four CPUs, 1024 PIDs, amd64, network
none, cap-drop ALL, no-new-privileges. Only stage-owned containers are removed.

The original test_command, parser and F2P/P2P calculation run on E, without
calling upstream run_evaluation.py. Because preparation differs, its result is
**acceptance_diag**, never official resolved/R/D_bench. All 25 Serverless and
all 1655 decisive Svelte names must be observed, including 2/48 F2P respectively;
missing names, parser/build/preparation errors or incomplete runs cannot yield
an ordinary boolean acceptance. Full executed test sets are published separately.

## Calibration

| Instance | Baseline E pass / fail | Gold E pass / fail | Original acceptance |
|---|---:|---:|---|
| Serverless 6534 | 23 / 2 | 25 / 0 | baseline false; gold true |
| Svelte 1190 | 1618 / 59 | 1666 / 11 | baseline false; gold true |

The exact gold and unfixed baseline were also tested after a local author
replacement removed assertions from an overlapping test file. E restores S and
produces the same source inventory and build outputs as the corresponding
unmodified control: gold still passes, baseline still fails. These are existing
benchmark tests, not new acceptance assertions. Two small preparation controls
reject an outside-surface production rollback and a /gold import target. Their
scope is the driver's boundary checks, not a universal hostile-code sandbox.

Svelte gold's eleven nondecisive failures are retained: eight custom-elements
10-second test timeouts; one runtime binding-select assertion; two related
"already failed" errors. The outer command completes with its full JSON report.
These failures are outside F2P/P2P; the historical criterion permits them.
The runner also reports 53 original pending Svelte tests; they did not execute
and are not counted as passing or failing. No attempt was made to fix the
browser environment or change the acceptance set.

## Six complete deliveries

| Delivery | Historical R / T | Full M applies | F checks: pass / fail | E integrity | acceptance_diag: pass / fail |
|---|---|---|---|---|---|
| Serverless 6534 / P | false / true | yes | pass: 23 / 0 | verified | false: 24 / 1 |
| Serverless 6534 / H0 | false / true | yes | pass: 24 / 0 | verified | false: 24 / 1 |
| Serverless 6534 / H1 | false / true | yes | pass: 23 / 0 | verified | false: 24 / 1 |
| Svelte 1190 / P | false / true | yes | fail: 1666 / 11 | verified | false: 1654 / 23 |
| Svelte 1190 / H0 | false / false | yes | fail: 1670 / 11 | verified | false: 1654 / 23 |
| Svelte 1190 / H1 | false / false | yes | fail: 1667 / 14 | verified | false: 1651 / 26 |

F counts describe the executed public/author suite, not complete task correctness.
F/E counts are passed/failed tests, not model attempts. All six historical R and
D_bench remain false. Svelte H0/H1 retain historical T=false: recovered patches
from interrupted author executions cannot acquire autonomous-delivery credit.

## Observed failures

All three Serverless deliveries pass F but fail the same independent mixed-name
test. Both Resource arrays contain the same custom/canonical ARN strings, in
opposite order from the frozen expectation. Safe sequences and equality of the
rendered line/resource multisets are retained in failure-analysis.json. The
original order-sensitive deep equality and score remain untouched. This is an
exact acceptance mismatch; this observation alone does not establish different
IAM permissions or exhaustively certify the implementation.

Svelte/P's independent E adds twelve exact-output mismatches to the eleven gold
failures: eight CSS-suite HTML comparisons put the scoping class before rather
than after existing classes; two JS snapshots differ in generated helper/code
structure and scoping IDs; two SSR snapshots differ in scoping IDs. Its delivered
F fixtures accept that output and have only the same eleven failures as gold.
These are observed mismatches against the ready-made acceptance, not proof that
all those textual differences change browser behavior. No class sorting, hash
normalization or rewritten snapshot was introduced.

The final H1 F pass also confirms a behavioral regression in the unchanged
runtime event-handler-event-methods sample: the static first button loses its
class="allow-propagation", so querySelector returns null and dispatchEvent
throws. Generated output shows `<button>click me</button>`; the second button
retains stop-propagation. H1's Element.ts serializer skips classAttribute even
when _needsCssClass is false. This is distinct from class-order/hash snapshots.
The two following variants report "already failed". Final repeated-run evidence
for this finding is bound in [failure-analysis.json](evidence/failure-analysis.json).

P and H0 have no additional F failures over gold and twelve additional E
failures. H1 has three additional F failures and fifteen additional E failures.
H0/H1 each deliver a new two-file css-scoping-class runtime sample: all four
additional discovered tests remain in F. E removes that author sample uniformly,
restoring the original independent test population. Every E executes the same
1677 Svelte test names as gold (25 for Serverless). F/E production build inputs
and fresh build outputs match for every arm. The final completed test outcomes
also reproduce the earlier completed outcomes; the two earlier preparation
errors are not selected or converted into scores.

## Development attempts, checks and limits

An initial read-only inspection script was named inspect.py, shadowing Python's
standard module; it failed before creating a container. Renaming it allowed the
two image inspections. The first calibration omitted the upstream container-exit
log envelope required by the original parser: four Serverless commands and the
first Svelte baseline produced real reports but were classified as parser errors.
They are not credited as successful calibration. The next overlapping Svelte
control was interrupted once the shared cause was established; two later controls
were not started in that attempt. All eight containers from that attempt were
removed. Its outputs and summary remain in local/, with safe hashes/accounting
in development-attempts.json. A complete corrected calibration preceded the
first M checks. During that first
six-arm pass, H0/H1 Svelte E failed closed in integrity preparation. Deleted new
author tests caused tar to emit missing-file diagnostics; mixing stderr into its
binary archive truncated the inventory and falsely reported missing late paths
(yarn.lock/tsconfig.json). A preparation-only reproduction confirmed identical
production with separate stdout/stderr. The first reproduction additionally
compared checkout modes to archive modes; the second used the exact F archive
and isolated the two false omissions. Neither ran tests or scored a patch.

The snapshot reader now separates streams and accepts only explicit missing-path
diagnostics for the requested inventory; truncation, permission errors and other
unexpected diagnostics are rejected. A local control covers removal plus the
last production entry. All first-pass outputs remain retained; final calibration
and all six F/E checks are repeated under the corrected reader. No outcome is
selected as the best of repeated runs.

The final valid evidence is 8 calibration commands plus 12 F/E commands,
using 10 + 14 containers. Across preparation and every retained attempt:
**62 containers**, all removed; **43 completed test commands** and one
interrupted command. The interrupted initial control has no persisted partial
stdout/completed result. Recorded driver wall time totals **2368.509 seconds**
(39.48 minutes), including setup/teardown. Image inspection and ordinary
shell verification time are outside that timing; CPU-seconds and monetary cost
were not measured. See [development-attempts.json](evidence/development-attempts.json).

[Machine evaluation](evidence/evaluation.json), [calibration](evidence/calibration.json),
[test populations](evidence/test-sets/), [failure analysis](evidence/failure-analysis.json),
and [bounded review](evidence/review.json) bind these conclusions.
Run the [one-command reproduction and verifier](README.md).

The final bounded review checks equal arm treatment, whole-source equality,
current implementation imports/builds, unchanged expectations, explicit failure
classes, exact historical hashes, test counts, original scoring arithmetic and
six-row completeness. Syntax and local controls are checked; this is not a full
aggregate/platform CI pass. Automatic repository checks are not disabled, and
no manual Actions or platform matrix is launched. Existing containment,
declarations and webfetch limitations are not changed.

No new author sessions, provider probes/calls, scripted authors, paid reviewers
or continuations occurred. Developing-agent work and local suite costs are
separate from historical Luna usage. All old patches, predictions, R/T/D,
official outputs, freeze/pause records and twelve not_started slots remain
unchanged. Draft PR #25 and its base are preserved; no merge, release,
leaderboard submission, new campaign or product change is authorized here.
