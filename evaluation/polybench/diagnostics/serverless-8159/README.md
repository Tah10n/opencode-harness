# Serverless-8159: selective removal versus disabling every template

**Decision B: a missing public contract clarification is a testable candidate.**
C/T miss selective removal and fail on a null-valued member. This is executable
production behavior, not patch rejection, missing delivery or TAP identity.
The original issue has a pre-PR clarification showing that precise per-member
interface; the preserved dataset contains it in `hints_text`, but the identical
frozen author prompts omit comments. This supports investigating bounded public
issue clarification input, not a causal claim or an immediate product change.
No reproducible defect of the active harness mechanism is established.

This is a new, model-free diagnosis of three saved solutions in
[consolidated-remaining-v1](../../campaigns/consolidated-remaining-v1/REPORT.md),
not another participant attempt, campaign, official score or quality estimate.
Harness baseline and branch parent: `662ce2a20a22af4b180158de88f4770e0f8c8aee`.
No product instructions, defaults, strategies, budgets, dependencies or launcher
mechanisms change. No real model requests were made for this diagnosis.

## Contract, complete solutions and historical outcomes

The [public issue](https://github.com/serverless/serverless/issues/7008) describes
an application supporting JSON, with an unwanted form-content mapping causing
API Gateway's exported Swagger to advertise both content types. The requested
observable distinction is to remove form while retaining JSON. The issue body / supplied statement
does **not** prescribe `null`, `false`, or `{}`; a public comment does, as
distinguished below. The frozen input is the Verified
dataset at `b3fca77b637379f0c01ad86d18753a7ac1998b53`, task
`serverless__serverless-8159`, source
[`56aa5aa15abed64db6758aecd8c27719928b5a14`](https://github.com/serverless/serverless/tree/56aa5aa15abed64db6758aecd8c27719928b5a14).
The [freeze](../../campaigns/consolidated-remaining-v1/frozen-manifest.json)
binds that source, prompt, CSV row, image and toolchain.

| Saved full patch | Implemented/documented interface | Authored assertion | Historical official outcome |
| --- | --- | --- | --- |
| [Plain P](../../campaigns/consolidated-remaining-v1/predictions/P.jsonl) | `{ 'application/x-www-form-urlencoded': null }` removes that member after merging | Form absent **and** JSON nonempty in the same compiled method | Applied, 53 passed / 0 failed; resolved=true |
| [Native core C](../../campaigns/consolidated-remaining-v1/predictions/C.jsonl) | `template: false` disables all defaults | Entire RequestTemplates absent; later adds validation of false | Applied, 52 passed / 1 failed; resolved=false |
| [Task T](../../campaigns/consolidated-remaining-v1/predictions/T.jsonl) | `template: {}` disables all defaults | Entire RequestTemplates absent | Applied, 52 passed / 1 failed; resolved=false |

Every full patch includes production, tests and documentation; none is filtered
or repaired. C also adds a validation test, with no validation production change.
All three are terminal, strictly applicable, round-trip verified and delivered
according to the historical [slot records](../../campaigns/consolidated-remaining-v1/results.json).
T's internal workflow `incomplete` status is separate from that delivery evidence.

Both official failures are `TypeError: Cannot read properties of null (reading
'replace')` in `lib/plugins/aws/package/compile/events/apiGateway/lib/method/index.js:91`.
Validation accepts the map; C/T leave its null-valued member in RequestTemplates;
`compileMethods()` calls `value.replace`. P deletes that member before the
consumer. This is a preexisting unsupported input left unhandled by C/T, not a
new crash introduced by their patch. Their new interfaces remove JSON as well
and do not supply selective removal. Their tests correctly test those chosen
interfaces, but do not prove the requested scope; this is incomplete behavior
and insufficient coverage, not a malformed authored test.

The evaluator's null representation is an additional interface assumption that
cannot be required from the supplied issue body alone. It is independently
supported by an earlier public comment that was absent from the author input. The public preservation observation
and the evaluator-input crash are therefore reported separately. Historical
scores remain unchanged; neither passing broad suites nor this diagnosis changes
them. No second historical case is needed.

## New executable evidence

From the harness repository root, with Docker available:

```sh
docker pull ghcr.io/timesler/swe-polybench.eval.x86_64.serverless__serverless-8159@sha256:2dd61c66aa6d749677ce6e323e803cdc161305b6b3907b31c576e3cf2716006a
python3 evaluation/polybench/diagnostics/serverless-8159/reproduce.py > /tmp/serverless-8159-diagnostic.json
```

[reproduce.py](reproduce.py) verifies each complete prediction against its
published patch hash, extracts only affected baseline files from the pinned
source image, applies the **complete** patch with `git apply --check` and
`git apply`, then mounts every patched file read-only over that same image.
No foreign project code executes on the host. [scenario.cjs](scenario.cjs)
uses the real Serverless/AwsProvider/API Gateway objects, `validate()` and
`compileMethods()` with installed dependencies on Node **16.20.2**. It does not
replace production helpers with a reimplementation or use hidden tests.
Containers have network none, read-only root/bind mounts, no capabilities,
no-new-privileges, bounded processes/memory/CPU, and only temporary writable space.
Temporary files and owned containers are removed on success/failure. The image
is not automatically deleted because a later user may already share it.

The saved [reproduction receipt](reproduction.json) records exact commands,
image, runtime, full-patch hashes and original/applied file hashes. Its exit 0
means the distinguishing observations and controls were asserted successfully,
**not** that C/T passed the task:

| Same scenario / observation | Baseline | P | C | T |
| --- | --- | --- | --- | --- |
| Null-valued form member, default JSON retained | TypeError | JSON only, exact default retained | TypeError | TypeError |
| Arm's documented removal interface | No new interface; null control errors | JSON only | Neither mapping | Neither mapping |
| No template override | Both defaults | Both defaults | Both defaults | Both defaults |
| Custom JSON string | Custom JSON + default form | Same | Same | Same |

The two preservation controls pass for all four variants. The baseline negative
control reproduces the same null crash as C/T. Scope is the compiled mapping
configuration; AWS deployment, actual Swagger export, all content types and the
complete upstream suite are **not newly tested**. The official evaluator is not
rerun, and no hidden acceptance content is copied into a runtime or future prompt.

## Observed trajectory and harness role

The [evidence receipt](evidence.json) contains hashes of recovered native captures,
official logs/results, all saved shell commands/exits, test-count excerpts and
edit indices. Indices are zero-based positions in each capture's `tools` list;
causal chronology below uses author tools, not the parent's enclosing task call.
Private requests and reasoning are neither published nor used to reconstruct
intent.

- P reads integration/validation, existing tests, docs and downstream
  `compileMethods` before first edit 28. That edit already adds per-member null
  deletion and the paired absence/preservation assertion. Edit 33 only adjusts
  documentation indentation.
- C reads the same useful code and task before first production edit 39. It
  already gates all defaults on `template !== false`. Edits 49/51 adjust docs;
  edit 57 adds a false-validation test. No later production change caused the loss.
- T reads the public task, integration/validation, docs/tests and the downstream
  replace call before investigation 33. The author explicitly asks to distinguish
  empty-object, replace-all and per-content removal. The response is an error:
  `Dependency copy exceeds first-version bounds`, zero proposed patch bytes,
  zero child sessions/model work and no observed checks. First production edit
  35 then introduces the empty-object behavior; it is also the final production
  edit. There is no diagnostic recommendation choosing that interface.

Thus the code and issue-body evidence was available and visibly read. The
comment clarification was not available in the offline author input. There is no
observed correct distinguishing test that was hidden, discarded or misread by
the harness. C/T authored broader-removal tests instead. P ran method tests
(52), validation (80), and a filtered npm suite (181) successfully. Its **full
`npm test` failed**: 2481 passing, 9 pending, 2 failing Ruby-invocation JSON parsing
tests. These are separate from the official 53-test pass; this investigation did
not reproduce/classify their original cause. C's broad API run passed 232 before
its final validation-only test addition; the final validation run passed 81.
T's final broad method/validation subtree run passed 224. Lint/format/diff checks
are also retained in the receipt. Counts have not been summed across overlapping
commands or substituted for coverage.

Current core steps 1/2/4/5 already ask for observable inputs, public-contract
expected values, preserved behavior and review of missing regression coverage.
`profiles/native/core.md` is byte-identical between historical product
`f83b101bd9050c81443acddf71c1e364c4c786c4` and the accepted baseline. The current
`copySensitivityDependencies` still has the explicit 80,000-entry / 300 MiB bound.
The observed preparation refusal is a known availability limit, not evidence of
an incorrect recommendation or that more preparation would fix this solution.
No active harness defect is established here, so no speculative mechanism repair
or new model-free test of a claimed mechanism defect is presented.

## Decision B: bounded public issue clarification input

The source issue is **7008**; **8159** is the fixing PR number. GitHub's
[comment 654185286](https://github.com/serverless/serverless/issues/7008#issuecomment-654185286)
was created and last updated on **2020-07-06 11:48:19 UTC**, before
[PR 8159](https://github.com/serverless/serverless/pull/8159) was opened on
2020-08-31. It proposes a null-valued form member as a non-breaking per-content
removal interface, and reserves replacement of all defaults for a possible v2
change. The saved CSV's `hints_text` includes this comment. A later pre-PR
[comment](https://github.com/serverless/serverless/issues/7008#issuecomment-683961107)
still asks which interface is best; the conversation is evidence to assess,
not a formal specification with every alternative resolved.

`evaluation/polybench/environments.py:28` constructs author task text from
`row['problem_statement'] + environment`. The archived prompt hash matches the
freeze and contains no comments/hints. External network was unavailable to all
three authors. This is an equal-input evaluation-adapter choice, not evidence
that core or investigator hid information they had received. Current code still
uses that construction. The new finding is the **input coverage gap**, not the
already-known request to write better preservation assertions.

One candidate, left unimplemented:

- **Source:** clarifications attached to the original, explicitly identified
  public issue, with stable comment URLs, source bytes, created/updated times
  and a cutoff before the solution PR. Never use a gold/test patch or an
  evaluator failure as the source of a participant hint. Do not blindly inject
  the dataset's entire `hints_text`, which lacks per-comment provenance.
- **When:** during separately authorized input preparation, before author work
  and independent evaluation. Present the relevant clarification as sourced
  context with its alternatives and uncertainty. Frozen historical inputs stay
  unchanged; any future comparison must declare and give the same eligible
  public context to Plain and harness arms.
- **Error detected here:** an all-defaults opt-out does not exercise the
  published per-content removal scenario. A focused call using the public
  comment's map exposes C/T's unchanged null/replace failure and P's retained
  JSON. The new reproduction already demonstrates that discrimination without
  copying acceptance-test contents.
- **False positives / admission checks:** test exclusions for comments created
  or edited after cutoff, unrelated issue numbers, untrusted instructions,
  contradictory or withdrawn suggestions, and missing timestamps. Retain
  ambiguity rather than inventing one required interface. Include controls
  where broad replacement is explicitly intended and where no clarification
  exists. In an eventual separately authorized quality experiment, count
  harmful/stale clarifications and regressions on held-out tasks, not only this
  already-inspected win. Increased context alone is not a success criterion.

The earlier [analysis](../../campaigns/evidence-backed-core-development-v1/ANALYSIS.md#serverless-8159-requested-scope-versus-a-newly-chosen-interface)
already identified paired removal/preservation testing. Its
[H1 experiment](../../campaigns/evidence-backed-core-development-v1/REPORT.md)
screened an instruction change using that technique; H1 delivered 3/6 versus
Plain 4/6 and unchanged core 3/6 and was rejected. Fresh Serverless runs all
resolved, including unchanged core. We do not revive H1 or present that testing
technique as a new candidate. The public-comment input candidate has **not**
been implemented or evaluated for model quality.

What remains unknown is why these authors chose all-default removal, whether
adding the comment would have changed their choices, and what the unavailable
investigator would have produced. One Plain win and two harness losses do not
establish prompt, model, investigator or budget causality. No reviewer, longer
always-on prompt, relaxed copy bound or mechanism repair follows from this case.

## Provenance and verification boundary

The original private archive hash and its member-manifest hash match the
published [cleanup receipt](../../campaigns/consolidated-remaining-v1/cleanup.json).
Only 23 selected members (2,104,135 bytes) were recovered, with each byte count
and SHA-256 verified; raw copies are disposable and the preexisting archive is
preserved. Published evidence includes only necessary sanitized receipts, not
raw logs, credentials, complete private requests or an archive. The prompt and
single-row CSV were checked against the public freeze. Each official result
hash matches its slot record; each public patch equals its retained delivered
patch. Recovered pre-edit files agree with the pinned image's baseline files.

The diagnostic receipt is fresh execution evidence. Historical commands and
outcomes are archive evidence. Required harness verification and final PR CI are
technical publication checks, not model-quality evidence; exact execution status
is recorded in the PR and completion report. There are no new model calls,
participant retries, official score edits, Ready/merge/release/deploy operations.
