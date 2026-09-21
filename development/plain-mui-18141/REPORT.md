# One plain Material UI 18141 attempt

**The single plain attempt completed successfully in the frozen scope: Q=true,
T=true, D=true.** Its complete 1,703-byte patch applies unchanged; F passes 19/0
and E passes 20/0 with verified integrity and the literal ID observation.

This is a separate single-instance stage after the historical two-repository
admission stop. It is not a resumed pilot, independent confirming evaluation,
model error-rate estimate, harness comparison, or official PolyBench result.

## Contract and bounded acceptance

[PLAN.md](PLAN.md) fixes Q/T/D before the author result. F retains the complete
patch. E restores only [fe-manifest.json](fe-manifest.json)'s test surface and
uses the actual implementation from F. The separate
[id-observation.test.js](id-observation.test.js) comes from the literal issue,
not the official test patch. The scope is TextField native label/ID behavior,
ordinary TextField and the retained custom-select accessibility contracts.
It does not claim general controlled-value correctness or a platform matrix.

## Preparation

The first fresh calibration failed before test registration because moving the
unchanged custom reporter to /tmp changed Node's module lookup: `mocha` was not
found. A local load check reproduced MODULE_NOT_FOUND; the same reporter loaded
with NODE_PATH=/testbed/node_modules. The corrected command uses those same
pinned dependencies, leaving package.json, yarn.lock, Babel configuration and
assertions unchanged. First-attempt raw outcomes are retained privately under
`local/plain-mui-18141/calibration/`; they are preparation errors, not model
failures. Its historical guard also detected the separately authorized launcher
parameterization performed concurrently; the historical data preservation check
compares all old reports/results/prompts and pause hashes against the starting
state explicitly. No previous score has been recomputed.

The one scripted preflight completed using the actual plain launcher and local
SSE fixture: 5 native tools (read, toolchain check, apply_patch, public TextField
check, spill-output), 7 synthetic requests including title, native stop and full
capture/cleanup. It made zero real provider requests. The 39,690-byte spill is
byte-for-byte equal to the generated 2,400-line fixture, with retained SHA-256
and session/call links. The author inventory is the ordinary native tools,
without webfetch or harness_task. Original prompt bytes appear unchanged inside
OpenCode's native quote wrapper. Linux OpenCode version is 1.18.26; project
Node/npm are 18.8.0/8.18.0. The initial host --version command returned ENOEXEC
because the pinned executable is Linux; verification ran in its Linux image.

## Fresh calibration

| Case | F passed/failed | E passed/failed | E integrity |
| --- | --- | --- | --- |
| Baseline | 18/0 | 18/2 | verified |
| Gold | 18/0 | 20/0 | verified |
| Gold with author test assertions removed | not needed | 20/0 | verified |

Baseline E fails the unchanged label query and the separate literal ID check:
select.id is empty while label.htmlFor is labelled-select. Gold E observes both
as labelled-select and resolves the select by label. All 18 declared P2P and the
F2P are present in parsed results. Overlap restores the independent expectation
without modifying production. Source bytes/modes outside the surface, actual
module paths and unchanged assertions were checked; no production build output
is used by this Babel-register source test path. All calibration containers were
removed; nested creation/removal order is compared as a set of identities.

The successful calibration took 257.818 seconds including container preparation
and cleanup. [receipts.json](receipts.json) also retains the failed first
preparation's time and hashes separately. No historical 18/1 → 19/0 receipt was
changed. The old 12 unstarted slots and two unassigned admission slots remain
historical and are not the new slot.

## Unchanged author result

| Dimension | Result | Evidence |
| --- | --- | --- |
| delivery_apply | true | Complete binary/full-index patch strictly applied to exact B in an ordinary Git copy |
| F_checks | passed | 19 passing, 0 failing, exit 0; includes the author's added test |
| assessment_integrity | verified | Outside-surface bytes/modes unchanged, actual source imports, original execution config and unchanged expectations |
| acceptance_diag | true | 18 P2P + 1 F2P all present and passing; separate literal ID check also passes |
| Q | true | Frozen scoped contract and usable full delivery satisfied |
| T | true | One native session, real final response, normal stop, verified termination and complete capture |
| D = Q ∧ T | true | No interruption, continuation or repair session |

The author forwards `id` in the native branch of Select's input props. The fix
is in `Select.js`, rather than gold's chosen TextField location; acceptance does
not require a particular helper or implementation placement. The added public
TextField regression checks the actual select's ID and the label's `for`.
F retains it. E restores the independent TextField tests and test-only helpers,
so E's success is independent of the authored expectation.

The real E observation is `suppliedId=labelled-select`,
`selectId=labelled-select`, `labelHtmlFor=labelled-select`; getByLabelText returns
that same select. Ordinary TextField, custom-select accessible-name/aria links
and hidden-input ID exclusions remain passing in the declared P2P surface.
No broader controlled-value correctness or full Select API/platform claim is made.

[Complete unchanged M](model.patch) has SHA-256
`eb850fc680f60bf4b7b55ff490edd232f53bd8fc324e93c3123003bd7b0a33a2`.
There are two modified 100644 files, no added/deleted paths or mode changes.
Raw native captures, provider bodies and session evidence stay private in
`local/plain-mui-18141/batch/runs/mui__material-ui-18141-P/`.
[Safe result and artifact hashes](result.json) bind the patch and all retained
records. No separate spill file was produced in this run: the complete native
output inventory is empty, has no missing references, and capture passed.
The one scripted preflight separately demonstrated actual spill retention.

## Author checks and boundaries

The author's final response reports TextField 19 passing, Select 60 passing,
ESLint and diff whitespace success. Native receipts confirm both final Mocha
commands used `--exit` and returned 0, as did changed-file ESLint and
`git diff --check`. An earlier combined Mocha command printed 79 passing but
remained alive until its 180-second tool timeout; it is not counted as a normal
successful command. The author independently followed it with the two final
terminating checks inside the same task-run. No external repair or command hint
was delivered. Those author checks are separate from the fresh F/E evaluator.

No user-contract defect is established. This result calls for recording the
successful plain delivery, with no new nudge, process implementation, harness
comparison, extra slot or replacement attempt. One known development task does
not estimate model reliability or harness advantage.

## Requests, time and resources

- Exactly one real task-run; 15 provider requests: 14 author/work and one title.
  All have terminal usage; unknown usage requests: 0.
- Input: 472,182 tokens, including 146,432 cached tokens. Output: 5,002 tokens,
  including 2,525 reasoning tokens. Subsets are not added again. No monetary
  estimate is available.
- Native tools: 33 (2 apply_patch, 10 bash, 1 glob, 6 grep, 11 read, 3 todowrite).
  One session, no reviewer/finisher/continuation; no harness tool or advisory.
- Native execution: 471.502 s within the 1800 s budget. Setup before native
  execution: 19.552 s. From native process exit through capture/container cleanup:
  0.937 s, including the separately measured 0.058 s native workload cleanup.
  End-to-end launcher time: 491.991 s. These overlapping measurements are not
  added twice. Output inventory/export took 0.072 s within capture/cleanup.
- Preparation calibration: 187.093 s for the preserved failed reporter setup,
  then 257.818 s for successful calibration (444.911 s total). Final F/E evaluation:
  87.177 s. These are local evaluator costs, not author execution or model usage.
- The single scripted preflight used 7 synthetic requests and 5 tools, zero real
  provider requests; native execution/cleanup was 23.412 s. Other preparation
  overhead is not measured by the author launcher. A separate pre-publication
  [developing-agent snapshot](developing-agent-accounting.json) records the
  platform goal metrics: 387,907 tokens used and 1,936 seconds. These are not
  author provider tokens, billable usage, or an invoice; later publication work
  is outside that snapshot.
- Every calibration/evaluation container and the author container was removed.
  Capture and termination receipts confirm no active provider handlers, closed
  forwarding and removed relay. Foreign resources were not cleaned up.

## Freeze, permission and verification

Local freeze commit `e0ebb4fe` precedes every real request. Two automatic permission
reviews initially rejected dispatch before creating a process; the user then
explicitly confirmed the stated public payload/destination, and the same frozen
slot ran once. The earlier `not_started` receipt is preserved as pre-dispatch
history. No endpoint/account change or permission workaround was used.

Original prompt bytes, public baseline/dependency hashes, pinned images,
OpenCode 1.18.26, Node 18.8.0/npm 8.18.0 and offline permissions were preserved.
Actual author-container inventory matched all 57,047 expected files before any
request. Gold, official test_patch, acceptance manifests and past solutions were
not mounted into the author environment. Credentials were only host-side OAuth
headers on the explicitly authorized route.

Local preparation/capture, immutable patch, test-inventory, accounting and
Q/T/D verification passes (`verify.py`, `verify-result.py`); JavaScript/Python
syntax, static `verify-harness.mjs` and scoped source whitespace checks pass.
The raw model.patch contains a required context-space on a blank diff line,
which ordinary Git whitespace checking flags when the patch is added as a file.
Its bytes are preserved; added hunk lines pass whitespace checking and the full
patch already applied unchanged in F/E. The source diff check excludes only this
immutable patch artifact. A final scoped
diff review and receipt-export repeatability check passed; repeated export
preserves the historical pre-dispatch receipt. These local checks are not a CI-pass
or a full platform matrix; the unchanged controller/nudge suites were not rerun.

The old admission report, historical patches/scores, pause files, 12 unstarted
pilot slots and two unassigned admission slots are unchanged. This new slot is
separate. The authorized final publication retains draft PR #25 and its base;
no force push, merge, release, package or leaderboard publication is authorized.
