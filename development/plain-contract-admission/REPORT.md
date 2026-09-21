# Bounded plain-task admission, 2026-09-21

No pair from different repositories passed contract admission. No new plain
OpenCode session or provider request was started. The allowed search stops at
these four candidates; this says nothing about tasks outside this list and
provides no evidence of harness lift or plain-model failure.

| Order | Candidate | Contract decision | Historical baseline → gold (pass/fail) |
| --- | --- | --- | --- |
| 1 | mui__material-ui-18141 | Relevant behavioral acceptance; provisional candidate only, F/E readiness not certified | 18/1 → 19/0 |
| 2 | coder__code-server-4923 | Excluded: missing owner/group and lifecycle acceptance; decisive new CLI spelling is not specified | 177/8 → 193/7 |
| 3 | microsoft__vscode-136347 | Excluded: decisive assertion requires new exact HTML/class/marker serialization absent from the request or baseline API | 68/1 → 69/0 |
| 4 | mui__material-ui-17301 | Excluded: acceptance exercises a broader refactor, not dark-theme visibility | 60/11 → 71/0 |

Counts are the saved parser outputs, not new executions or full-product proof.
All eight result hashes match the frozen manifest. Row hashes, evaluator SHA,
image digests and provenance bindings were checked afresh; receipts retain paths
and hashes of complete local outputs. No old result or score was recalculated.
The current host/images/toolchain were not recertified for execution: admission
already prevents forming a pair, so image restoration is unnecessary.

## Requirement → public behavior → assertion → actual observation

### Material UI 18141

The request explicitly wants an ID linking the TextField label to the native
select. `TextField.test.js` adds a fresh render with `id="labelled-select"`,
`label="Currency:"`, `select` and `SelectProps={{ native: true }}`. Its F2P
assertion calls `getByLabelText('Currency:')` and checks the returned control's
value is `dollar`. This queries the rendered object, not a prototype or unrelated
fixture. The saved baseline error is “Found a label … however no form control
was found associated to that label”; its DOM has `for="labelled-select"` and a
select without an ID. Gold preserves `InputMore.id` for native selects and the
same assertion passes.

`createClientRender` installs `afterEach` cleanup. No broad catch masks this
assertion and no previous test is needed to initialize its instance. The test's
`value="$"` differs from its sole option value `dollar`; the value check therefore
uses browser single-option behavior, not evidence of controlled-value correctness.
It still detects the reported missing label association. It does not explicitly
assert equality of the select ID and `htmlFor`, so it is not a complete proof of
every possible implementation of the literal ID requirement.

The existing custom-select P2P renders `id="my-select"`, resolves actual
`aria-labelledby` references and asserts the accessible name `Release: Stable`
(with the test's explicit spaces). Another P2P verifies the hidden input has no
ID or `aria-describedby`. These preserve the non-native accessibility contract;
the issue's tentative suspicion about non-native selects is not permission to
break it. All 18 declared P2P IDs are present and passing in both receipts.
Internal placement of the native-ID fix is not prescribed by the assertion.

This is the only candidate worth carrying to further preparation, not a fully
admitted run: F/E calibration, an overlap control and complete-patch verification
were not performed once neither other repository could qualify. Even treating
this candidate as admissible cannot produce the required pair.

### code-server 4923

The request asks for socket permissions, user/group selection and socket cleanup
on shutdown/restart. Its comma-separated example is illustrative, not a stated
requirement to introduce `--socket-mode`. The two declared F2P assertions are in
`cli.test.ts`: exact parsed output for `--socket-mode=777`, and clearing that
property with `--link`. Baseline rejects the unknown option; gold adds it and
these assertions pass. They exercise the real parser but make gold's new option
spelling a decisive condition without a contract basis.

The added app test does call `createApp` and `stat` the actual socket, checking
`mode & 0o777 === 0o777`. It is useful behavioral coverage of chmod, but is not
one of the row's two declared F2P IDs. It neither requests nor asserts owner or
group, and calls `dispose()` without asserting subsequent socket absence or a
restart. Gold adds chmod and CLI wiring; it adds no owner/group support. The
baseline already unlinks before listening. Existing unlink coverage asserts a
spy call, not shutdown/restart lifecycle behavior. Neither that coverage nor
chmod establishes the whole original contract. No missing requirement was
silently removed or added to an author prompt.

Do not interpret the seven gold failures as seven product defects:

- Six route failures are also listed as F2F. The retained output shows HTTP 500
  or missing redirect query results. Their deeper environmental cause was not
  established in this task; they are not the reason for rejection.
- The failure named `should unlink a socket before listening on the socket`
  actually points to line 95 in the preceding invalid-port test. That test does
  not await/return `expect(...).rejects.toThrow(EACCES)`; the promise resolves.
  This is an asynchronous attribution/environment-assumption limitation, not
  evidence that the socket unlink assertion failed.
- All 186 declared P2P strings are absent as exact identifiers from the saved
  passed/failed lists. For example, the row has `cli.test.ts->should override
  with --link`, whereas output has `cli.test.ts->parser should override with
  --link`. The pinned scorer checks intersection with failed IDs, not presence
  of every P2P ID. Thus `no_p2p_failed=true` does not certify this inventory.
  This is an identifier mismatch, not a claim that all those tests did not run.

No parser, assertions or historical scores were changed.

### VS Code 136347

The requested behavior is visible control characters when
`editor.renderControlCharacters` is enabled, specifically U+202E and U+202C in
the transfer example. The issue's proposed classifier/root cause does not mandate
an internal implementation. The added F2P creates a fresh `RenderLineInput` for
that exact example with control rendering enabled and calls the real
`renderViewLine2` through its test alias. It directly compares `actual.html` to
one literal string, including exact span boundaries, `class="mtkcontrol"` and
`[U+202E]` / `[U+202C]` markers. There is no broad catch or dependency on another
test's mutable object at this assertion.

The baseline leaves the directional characters in the HTML; gold emits those
markers and passes. All 68 declared P2P IDs are present and passing. Four dataset
F2F disk-service entries are outside this saved renderer run, not four new
renderer failures. The prepared historical Electron dependency is recorded in
provenance; an earlier missing-Electron receipt is not substituted for this run.

Exact new serialization is not part of the user's request. Baseline renderer,
CSS and option sources do not define `mtkcontrol` or the new marker format; gold
introduces the class and its CSS together. Existing renderer snapshot conventions
do not turn this new class name into a previously public API. A consistently
renamed CSS class can preserve styling, visible text, widths and mappings yet
cannot equal this literal. That is a static contract argument, not a claimed
executed alternative control. No alternative gold implementation was run, and
no universal statement about evaluator correctness follows. The explicit ban
on unstated decisive formatting is enough to exclude this acceptance in scope.

### Material UI 17301

The request wants a darker SpeedDialAction button in a dark theme so the icon is
distinguishable. Baseline styles use `theme.palette.common.white` with secondary
text color; gold changes the background and hover basis to
`theme.palette.background.paper`. That is a plausible theme-aware fix, but it
is accompanied by a much larger API/ref/navigation refactor.

The ten declared F2P assertions concern keyboard navigation, focus opening,
`classes.fab`/`fabClosed`, propagation of `open`, and refs on SpeedDialAction and
Tooltip. For example, the modified test mounts a real action then checks
`buttonWrapper.hasClass(classes.fab)`, replacing the baseline `classes.button`
contract. Navigation fixtures switch `ButtonProps.ref` to the new `FabProps.ref`
and assert `document.activeElement` after simulated keys. These refer to real
rendered instances, but depend on the new refactor rather than dark-theme color.
No dark palette, computed background or icon visibility assertion occurs in the
changed test surface or baseline action tests. The exact gold color is therefore
not even the decisive oracle here, and is not adopted as a requirement.

The 11 saved baseline failures comprise the ten F2P failures plus the P2P Tooltip
long-press test. Gold passes 71 tests, including all 61 P2P IDs. This confirms the
larger gold refactor passes that surface; it does not demonstrate that the
baseline failures reproduce poor dark-theme visibility. New class names and
focus behavior are unstated success conditions, and the requested visual behavior
lacks ready acceptance. Excluded without altering assertions or building a new
visual evaluator.

## Stop, artifacts and verification boundary

The order and criteria were written in [PLAN.md](PLAN.md) before inspecting new
candidate results. Historical slots 19–30 are still `not_started`, zero requests,
null R/T/D in saved accounting; no corresponding directories exist under the
real batch runs. Scripted preparation directories are separate and are not
counted as paid author attempts. The old slot-18 pause and all old artifacts
remain untouched. [receipts.json](receipts.json) records the exact bindings.

Both new diagnostic slots remain unassigned and `not_started`. New task-runs,
provider requests, author tools, author elapsed time and author usage are zero;
no monetary estimate is made. Developing-agent reading, provenance verification
and report work are separate and not measured as author usage. Fresh evaluator
runs, alternative gold runs and scripted preflight runs are zero.

No full M exists, so no author patch can be applied, no author tests can be
reported as passing, and no F/E or `acceptance_diag` result is fabricated. There
are no two prepared prompts or freeze commit for model execution because the
admission threshold was not met. No container or background process was created;
local extracted diagnostic text is retained privately for review.

The delivered change is PLAN, this admission report and compact safe receipts.
Checks validate four row hashes, eight original result hashes with matching
provenance/image pins, twelve unstarted slots, arithmetic and unchanged old
tracked artifacts/local pause hashes. Source/assertion inspection is model-free
admission evidence, not fresh product execution, CI-pass or model evaluation.
`node scripts/verify-harness.mjs` passed locally; JSON/provenance and whitespace
checks passed. The full platform matrix was not repeated, as required.
No process mechanism is proposed: there is no new author trajectory or confirmed
plain-model defect to justify one. Search ends here as authorized.
