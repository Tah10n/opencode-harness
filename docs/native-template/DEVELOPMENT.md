# Native development evidence and one revision

Six existing development attempts are preserved unchanged. These three reused
VibeRacing tasks are not an independent evaluation. No new model/provider calls
were made for this revision; no repaired diagnostic copy replaces an outcome.
No efficacy or maintainability score is claimed. The effective-harness goal remains
unfinished. The native PR is separated from repair-wrapper PR #23.

## Exact intervention used in the six attempts

[development-core.md](development-core.md) is the exact UTF-8/LF instruction file
used in all three on attempts (not the revised product instructions).
SHA-256: `fca19c7c833a14bc79ccd20971b20a007f6c57baadceb6b53b33cadd04fd5b77`.
[development-opencode.json](development-opencode.json) is the exact compact JSON
written in the running workspace, with no final newline. SHA-256:
`1fc620fd4c5a248b0b172dadbaf15408c3ad1e464c8179160ab23905404c75a8`.
The host materialized config had a host absolute path; preparation rewrote it to
`/work/template/core.md`. That runtime path is what OpenCode actually loaded.
Off had neither this directory setting nor these instructions.

Both arms set this exact compact `OPENCODE_CONFIG_CONTENT` value:

```json
{"model":"openai/gpt-5.6-luna","small_model":"openai/gpt-5.6-luna","provider":{"openai":{"options":{"baseURL":"http://127.0.0.1:4099/v1","apiKey":"development-no-credential"}}},"permission":{"external_directory":"deny"}}
```

The apiKey above is a literal non-secret placeholder. Credentials stayed outside
repository tools. The identical research transport forwarded only Responses
requests for the named model to the existing OpenAI authorization endpoint with
`store:false`. It is not part of this PR's installed bundle.

Both arms ran from `/work/repo`:

```sh
/opt/opencode run --format json --agent build --model openai/gpt-5.6-luna --variant low -- "$TASK"
```

On alone set `OPENCODE_CONFIG_DIR=/work/template`. Both set isolated HOME/XDG
paths under `/work`, `TMPDIR=/work/tmp`, `OPENCODE_DISABLE_MODELS_FETCH=true`,
`OPENCODE_DISABLE_AUTOUPDATE=true`. Prepared sources had no project OpenCode
config; project AGENTS.md was retained identically in each pair. Native tools and
build agent remained in use. Per-attempt wall limit: 900 seconds; zero retries.
OpenCode 1.18.26 binary SHA-256:
`096d32aa9778f98981390a0602c1f8af55ee5f1d6d5c58206f8fb2743c90eafe`.
Node 24.19.0; identical pre-existing network-none container environment, image
`sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`.
This historical execution setup is not a new or normal-user execution requirement.

| Task | Public source commit | Equal prepared off/on tree |
|---|---|---|
| collectors-preserve-state | 4913b05975dcfdec9a37adba5a0c5ea5c3e8a88f | e0904f981651246baaed21099dcb42c38ef28962 |
| account-switch-ledger | 2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd | b5cdfc0db3d8abefc03554fa19f41a0ed090a93f |
| cursor-compatible-versions | f2fdbf718c72ca4c27ea7dd225481b111e01f800 | 9d5c174313c31620213257ce03fdac8ef970a33e |

Order was collectors off/on, ledger on/off, Cursor off/on. Original audited suites
passed 311/311 before execution. Prepared tests distinguish task-superseded behavior
from preservation; they do not mandate a new internal ledger representation.
All six model attempts exited 0 without timeout. The first artifact copy failed:
its saved binary patch was applied to a separate baseline and its reproduced diff
was byte-identical. A model-free capture fixture then validated confined tar capture
for the five remaining attempts. Original failure, freeze and outcomes remain intact.

## Unchanged outcomes and cost

| Task | Off preservation; frozen diagnostic tests | On preservation; frozen diagnostic tests |
|---|---|---|
| Collectors | 88/88; 0/2 | 88/88; 0/2 |
| Ledger | 202/203; 0/6 | 203/203; 0/6 |
| Cursor | 20/20; 2/2 | 20/20; 2/2 |

Collectors and ledger are behaviorally incomplete in both arms. Cursor/on has
supported behavior in the audited scope; off rejects valid future-year CLI
builds. Both omit requested CLI/sync test additions. Strict complete delivery
remains 0/3 off and 0/3 on. Post-run audit passes 11/11 CLI/routing tests for on,
1/11 for off. These dependent checks are not independent task observations.

| Task | Off seconds / tools / provider requests | On seconds / tools / provider requests |
|---|---|---|
| Collectors | 133.308 / 33 / 21 | 158.087 / 36 / 23 |
| Ledger | 248.906 / 45 / 31 | 288.466 / 48 / 35 |
| Cursor | 174.648 / 32 / 21 | 304.044 / 49 / 29 |
| Total | 556.862 / 110 / 73 | 750.597 / 133 / 87 |

On used 34.8% more time and 20.9% more tools in this one batch.
Recorded step_finish totals, off/on: input 2440814/2287111; output 10746/14473;
reasoning 3557/4080; cache read 896000/744448; cache write 0/0; normalized total
3351117/3050112. Here normalized total = input + output + reasoning + cache read
+ cache write. Auxiliary requests without step_finish are not covered; these are
not billing receipts, and monetary cost is unavailable. Cache variation and three
reused tasks do not support a stable cost or success-rate estimate.

## Trace audit: evidence, not inferred internal reasoning

Locators below mean the 1-based line in each task/arm's saved `session/events.jsonl`.
[Evidence index](evidence-index.json) gives exact stream and patch hashes. Raw
logs, session/account IDs, private paths and credentials are not published here.
Quoted actions below are curated descriptions of tool inputs/outputs, not model
reasoning. A successful read proves the file was available, not understanding.
“No new test” is based on all recorded tool inputs plus the complete saved patch,
not on a final response. Baseline tests can cover related state sequences without
covering the failing sequence at issue.

| Obligation / arm | Observable classification | Specific evidence |
|---|---|---|
| Collectors: unsupported usage, retained committed state and retry; off | Required work appears in todo, paths read, implementation incomplete; targeted regression not created | E3 plans regressions; E24–29 read all six adapters; E43/46/49/60 edit only diagnostics, shared, OpenCode and Claude. Gemini stays unchanged. E56/57/66/68 run original suites; E63 marks regressions complete despite no test diff. |
| Same collectors obligations; on | Paths read and edited, implementation incorrect; targeted regression not created | E28–33 read six adapters. E56 changes `geminiEventKey`: invalid detection is limited to `type === "gemini"`, leaving a parsed unsupported type ignored. E59 adds provisional handling; E69/70 run old suites. E81 marks regressions complete; no test file changes. |
| Ledger: accepted usage after file move/truncate and DB deletion; off | Paths explored, incorrect integration; required regressions explicitly cancelled | E34–37 read shared/Claude/OpenCode; E49/52 inspect collection persistence in bin/viberacing. E62 edits shared ledger; E98 edits SQLite last, returns `filteredAnalysis.entries` from new rows and builds aliases only from those rows. E104 cancels regression todo. |
| Same ledger obligations; on | Paths explored, incorrect implementation; required regressions explicitly cancelled | E36–45 read shared and all adapters; E64/67 add metadata ledger. E79 records accepted tuples but still returns current `analysis.entries`, losing deleted history. E82–104 add then undo the Claude ledger edits. E116 cancels regression todo. |
| Ledger: first tuple on conflict, unrelated events, range and migration; both | No new discriminating sequence tests; broad preservation does not establish the contract | Off E80–82/95/101 and on E70/76/98/107 invoke old suites only. On shared code skips seen identities while file totals remain source-derived; off gates shared ledger on supplied state. Earlier lifecycle probes fail before later assertions, so those later clauses remain unproven, not independently scored failures. |
| Ledger: exact cutover preservation; off | Observed regression; applicable test not rerun after final SQLite edit | E82 runs config before E98 changes aliases to filtered records; E101 reruns only readers. Unchanged `config.test.mjs`, “OpenCode cutover aliases become confirmed only after server acceptance”, expects one alias and gets zero. Separate baseline/on pass, off fails. |
| Cursor: valid date floor; off | Parser explored and implemented incorrectly; new parser test does not discriminate this error | E44 adds `match[1] === "2026"` in `datedCliVersion`; added parser assertions cover same-year positive builds. A lower date bound does not authorize an upper-year bound. This is a concrete implementation restriction, not evidence that the model internally chose a particular interpretation. |
| Cursor: CLI/sync regression delivery; off | CLI test read, sync path not directly inspected in recorded reads; new consumer regressions not created | E30/34 read CLI implementation/test; E53–55 execute parser, old CLI and old sync suites. E44 changes only parser tests and support docs; E69 final diff contains no CLI/sync test edit. |
| Cursor: CLI/sync regression delivery; on | Both paths and tests read; consumer regression not created | E30/32/33 read CLI implementation and both test files. E44 changes parser tests/docs only; E99–101 run parser and unchanged CLI/sync suites. Final patch still lacks CLI/sync tests. |

**Cursor temporary checks:** on E66 and E80 execute `node -e` printouts against
`cursorVersionSupported`, to diagnose a rejected existing CLI date and accepted
leading-zero version. They print values without assertions and do not call CLI
capture or account routing. They are temporary parser diagnostics, not temporary
CLI/sync regressions lost from the patch. Off has no such commands. Both arms
checked old CLI/sync tests; neither created the requested new consumer tests.
On's parser corrections followed existing assertion failures, not a new failing
regression established before the behavior change.

**Stateful sequence attempts:** all collectors/ledger shell commands were inspected.
There is no new command/test exercising accept → serialize/reload → unsupported
rewrite → retry, or accept → delete/move/truncate → reload → collect → replay.
They ran original suites containing some related state tests; the diagnostic
counterexamples were not reproduced during these model sessions. Neither arm
established a new regression's baseline sensitivity. Todo completion/cancellation
cannot substitute for an executed state transition and shipped assertion.

There is no evidence of a newly created state-sequence test with an incorrect
expected result in these attempts. The missing tests and incorrect implementations
are directly observable; “requirement never noticed” or private reasoning is not.
On-ledger also writes undefined `input/output/cached` variables in `geminiEventKey`
(the final gemini.mjs diff); the catch returns null. That is another source-level
implementation defect, not proof of a test-authority problem. No model-generated
assertion is used to authorize correcting it here.

## One revision and falsifiable hypothesis

Cause supported by traces: verification is deferred until implementation is
considered done. Collectors completes and ledger cancels planned regressions;
Cursor edits parser coverage but never ships new consumer coverage. The old
final-diff instruction alone did not prevent these events.

The revision replaces that section with a complexity-scaled implementation loop:
observable behavior and real inputs/paths → project regression with contract-derived
expected result → baseline sensitivity for the bug → implementation → new and
preservation checks → required tests in diff. Stateful cases carry persisted state
through the relevant sequence. It does not add a second TDD paragraph atop an
already successful cycle; these traces show no such new-test-first cycle.
Expected results remain hypotheses: baseline failure is not correctness evidence;
preservation should remain green, and explicitly superseded behavior is separate.

Unlike failed reminders or work-map experiments, the deliverable is a normal
project regression used during the change, not a scheduling document, extra model
stage, custom tool or post-hoc report. The template contains no task names, fields,
versions, dates, usage numbers, evaluator links or reference-patch hints.

A future separately authorized observation would support the hypothesis if agents
ship contract-justified sequence/consumer tests, demonstrate relevant original
failure before fixing, pass preservation, and leave fewer incomplete obligations
at comparable cost. It would refute it if agents still omit/cancel those tests,
write checks that accept the retained wrong implementation, or ship the same
incomplete behavior with added overhead. Checklist compliance alone is not success.
These development examples cannot provide independent lift after prompt tuning.

Local checks verify materialization, configuration resolution/native tools and
portable diagnostic sensitivity/positive controls. Provider prompt delivery and
model compliance for this revision remain untested under the zero-call constraint.
No new campaign or independent evaluation is prepared or executed by this PR.

Local revision checks passed: `verify:native-template` (including a three-source-file
CLI copy with no historical materializer/runtime), `verify:native-template:config`
on OpenCode 1.18.26, `verify:static`, `verify:profiles`, and `git diff --check`.
All nine portable diagnostic combinations matched their expected pass/fail
classification. Existing archives and 39 checked historical result/event/patch
artifacts remained byte-identical; all 36 original freeze and seven capture
amendment digests still match. Remote CI is separate from these local results.
