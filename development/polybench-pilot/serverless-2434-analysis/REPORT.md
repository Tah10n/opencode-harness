# Serverless 2434: what the two independent failures establish

**Neither failure establishes a violation of the supplied user contract.** One
is a broken independent test setup, also failing on gold; the other requires a
particular validation API and phase that the task did not require. The saved
P/H0/H1 implementations load the requested file-based event array, preserve
missing-functions input and reject invalid events in the bounded cases below.
This does not certify the implementations generally or change official scores.

This is a post-hoc development diagnosis of one case selected for its known
negative result, not a benchmark, lift estimate or new author attempt. The
[separate Svelte closure](../../preservation-nudge/revision-2/model-pair/CLOSURE.md)
leaves ON D_pair=false, OFF not_started/unknown, the original stop and defaults
unchanged. No new mechanism or campaign is assigned.

## Contract and the actual assertions

The [original task](../prompts/serverless__serverless-2434.md) requires restoring
`events: ${file(./handlers/users/config.yml):events}` where the referenced value
is a valid event configuration. It explicitly worries about removing validation.
It does not require `Service.validate()`, a particular helper name, accepting
arbitrary strings in `load()`, or moving every validation to `Serverless.run()`.
Baseline public `Service.test.js` allows missing functions and rejects object
non-array events through `load()`; public variables documentation describes file
references and recursive value substitution. These are distinct from independent
tests added later by `test_patch`, and from the author's added tests.

| Requirement / source | Concrete input and invocation | Expected observable behavior | Actual result |
| --- | --- | --- | --- |
| Original user task; public file-variable docs | YAML function `users`, handler, `events: ${file(./events.yml):events}`; file contains `[{http:{path: users, method: get}}]`; real `Service.load()` → `Variables.populateService()` → implementation's existing late validator | Resulting events equal the array; validation permits it | P/H0/H1 and gold succeed; baseline rejects the unresolved string in `load()`, the bug the task asks to change |
| Preserved public missing-functions contract | `{service: service-name, provider: aws}`, no functions; real load and population on the same Service | Completes with `functions={}` | All five versions succeed; P's added `populateService()` validation iterates zero functions and returns |
| Preserved validation; public object-events test | `functions.functionA.events={}`; same real entry points | Reject non-array configuration | All five reject with ServerlessError; baseline/P/H0/H1 at load, gold at late validation |
| Independent failure 1, labelled missing functions (F2F) | Same missing-functions YAML, but load `serverless.service`, then call `serviceInstance.validate()` on the outer binding left by the preceding test; then access `serviceInstance.functions.functionA.events` | Test attempts to assert that a nonexistent function's events equal `{}` | Baseline/P/H0: method absent. Gold/H1: method returns, then `functionA` is undefined. Broad catch replaces either TypeError with `expected 1 to equal 2` |
| Independent failure 2, labelled non-array/non-variable (sole F2P) | `functions.functionA.events='not an array or a variable'`; `load().then(() => { try { service.validate(); fail(); } catch(e) { assert e.name == 'ServerlessError'; } })` | Independent test additionally requires load to resolve and a later method to reject | Baseline/P/H0/H1 reject with the same ServerlessError at load, outside the callback's catch; gold resolves load and rejects at validate, passing this assertion |
| Author-added validation test / task's concern about invalid values | File variable resolves to `{}` instead of an array | Reject, rather than pass invalid events downstream | Baseline rejects unresolved string; P rejects after substitution inside populateService; H0/H1/gold reject at their late validator |

The first independent test does not assign its outer `serviceInstance`; the
preceding `frameworkVersion` test leaves it with `functions={}`. Even switching
to the current missing-functions instance would still leave no `functionA`.
The original public test had a weak assertion on the constructor-owned instance;
the local probe additionally checks the actual loaded instance. We did not repair
either historical test or substitute the probe into scoring.

The second failure is **not a message mismatch**: the exception name and message
already agree. Its cause is the rejection phase and the placement of the test's
catch. Literal non-variable events were not admissible before the change, and
the issue only asks to admit a variable resolving to valid events. Gold's choice
to defer all events validation is a reference implementation, not proof that this
phase/API is mandatory. The dataset's separate `hints_text` even suggests checking
for an array OR a variable-syntax string; that hint is not in the saved author
prompt and is not attributed to author knowledge here.

Scoring remains exactly historical: F2F contains the broken missing-functions
case; the sole F2P is the phase-sensitive string test. P/H0/H1 have
`all_f2p_passed=false`, `no_p2p_failed=true`, `resolved=false`. Gold's surviving
F2F failure explains why gold can be officially resolved with one failing test.
No assertion, deciding set, output, patch, prediction or score was changed.

## Reproduction and bounds

[Evidence](EVIDENCE.json) records all commands, `/testbed` cwd, exits/signals,
timeouts, output hashes, observed failures, probe inputs/results and cleanup.
[Hashes](HASHES.json) bind original artifacts and private output paths.
[Probe](probe.js) calls real project methods; its sole version stub mirrors the
preceding public test. It does not mock Service/Variables or invoke deploy/AWS.
Late validation is called directly at each version's existing point; this is a
configuration diagnosis, not full CLI/plugin or AWS verification.

- Baseline: `cf927bf8a68496f762a55e5222415c808aa6087b`.
- Dataset revision: `b3fca77b637379f0c01ad86d18753a7ac1998b53`.
- Evaluator: `9c836c5d7f3cb991934132b77d29e6941d912a07`, unchanged source.
- Existing official image: `ghcr.io/timesler/swe-polybench.eval.x86_64.serverless__serverless-2434@sha256:8785107b8605e443d82f4b6c2baac5f739163c277124c68d8b7a65bfc448052f`.
- Node 16.20.2 / npm 8.19.4 and image-installed dependencies; no install or pull.

One addressed set ran once in each of five separate expendable containers.
Original evaluator order was preserved: `test_patch`, then full unchanged
P/H0/H1 or gold patch, using `git apply -v --ignore-whitespace --reject`.
Every application succeeded; the evaluator's fallback was unused. The original
`. /usr/local/nvm/nvm.sh && npx mocha lib/classes/Service.test.js --reporter json`
ran through the evaluator's `set -uxo pipefail` script. A separate Variables
suite and the same fixed diagnostic probe completed on each copy.

| Version | Service passing / failing (exit) | Variables passing / failing | Probe |
| --- | --- | --- | --- |
| baseline | 24 / 2 (2) | 34 / 0 | completed, assertions pass |
| gold | 25 / 1 (1) | 34 / 0 | completed, assertions pass |
| P | 27 / 2 (2) | 34 / 0 | completed, assertions pass |
| H0 | 25 / 2 (2) | 34 / 0 | completed, assertions pass |
| H1 | 26 / 2 (2) | 34 / 0 | completed, assertions pass |

P/H0/H1 counts, failure names and messages match retained official logs. Control
counts match the frozen manifest. The new probe exposes the masked TypeErrors;
it is diagnostic evidence about saved code, not an output received by the old
author or a replacement acceptance. No preparation failure, timeout, retry or
flaky-result selection occurred. All five containers were removed after outputs
were saved. Network none, capabilities dropped, no-new-privileges, 8 GB/4 CPUs,
no mounts, credentials or Docker socket inside containers.

To reproduce with retained local inputs, from this worktree, use a **new** output
directory: `local/polybench-pilot/venv/bin/python development/polybench-pilot/serverless-2434-analysis/reproduce.py local/polybench-pilot/serverless-2434-analysis-new`.
This executes five copies again; it is documentation, not an automatic rerun.
Full outputs stay under ignored `local/polybench-pilot/serverless-2434-analysis-run-1/`.

## What the author evidence actually supports

[Bounded author receipts](AUTHOR-EVIDENCE.json) identify native call IDs, edits,
command results and the first actual provider request carrying each selected
receipt. Original private captures remain in place. No reasoning is reconstructed.

P receives the original task in author request 2 (request 1 is title generation).
Service, Variables, Serverless and their public tests are read; their read results
reach requests 5–8. Edit `call_PV5UmwV9NFvihLJH253kLKt7` adds late validation in
Variables and initially admits strings. Edit `call_Ag9TzywAlK2hjWvud5hnhACr`
restricts that allowance to variable syntax and adds a literal-string rejection
test. Final production edit `call_NZHOXabA2xID2ipIv9XcEM46` replaces regex
`match` with `test` without moving validation.

After that last edit, `call_mjITFmXE5lYavMYixXPGMUNY` completes the real
Service/Variables suite with **63 passing**, exit 0; modified-file eslint also
exits 0. Actual request **21** carries these results. The earlier `npm test`
exits 0 before the final two edits; it is not evidence of a final full-suite run.
Whole-repository lint exits 1 with three quote errors outside the changed files.
The final response (response 23) claims 63 targeted passes and clean changed-file
lint, and acknowledges broader failures. Native completion and stop receipts
confirm normal termination. Thus this is not a demonstrated ignored relevant
failure, missed old input or lack of access to the relevant code.

H0 places `validateFunctionEvents()` in Serverless.run; H1 uses `validate()`
after population and `validate(true)` during load. Both still reject the literal
invalid string during load, explaining failure 2 without invoking P's Variables
change. H1's method exists, so failure 1 advances to the undefined-function
access, as gold does. Equal test names therefore conceal different first errors.
Their retained targeted author checks and normal completions are recorded;
H0/H1 also received separate `Serverless.test.js` setup failures involving
`testPlugin`. Those are not either disputed evaluator failure and are not promoted
to passing checks or expanded into another investigation.

Native receipts and actual request bodies are separately hashed; receipt metadata
is not assumed to prove every byte of original process stdout was retained.
No absent historical full output is reconstructed from new evaluator output.
No causal claim about why the model chose its architecture is needed or justified.

## Decision, limits and cost

**Decision: this case does not justify a runtime/process modification.** Its two
failures cannot supply the required confirmed-user-defect → missed-feedback
cause for a new product hypothesis. Stop this diagnosis at that evidence boundary;
do not invent a nudge, reviewer, final repair pass, flag or larger budget, and do
not substitute a different case. No implementation proposal is promoted. Positive
and negative controls for a new mechanism would be premature without such a
mechanism and supported cause.

The bounded observations do not establish general correctness, error frequency,
harness advantage, that every validation placement is equivalent, or that another
test would guarantee success. They do establish the behavior and limits of these
two assertions. Official R/T/D and all 12 unstarted slots remain unchanged.

Local work: five containers, 29 recorded commands, **41.591 seconds** summed command
wall time (not CPU time or total developing-agent effort), zero retries, zero new
Luna/provider requests, scripted-author sessions, availability probes or paid
reviews. Developing-agent analysis/tool use is separate; no reliable monetary
bill is available, and unknown historical usage stays unknown. All output bytes
were saved before cleanup. Controller/installed/retention/platform suites were
not rerun because their inputs did not change.

Validation: Python/JavaScript syntax, scoped whitespace, original/probe/output
hashes, immutable historical tracked evidence and both pause files, result
arithmetic and one final evidence review. The review checks for hidden API
requirements, false attribution of new results to past authors, unsupported
causality and changed scores. These are local checks, not platform CI.

Local verification completed: `python3 development/polybench-pilot/serverless-2434-analysis/verify.py` verifies 394 source/output hashes, five arms, 29 commands and actual-request receipt hashes; syntax and staged scoped whitespace pass. The final evidence review found no basis to add a hidden method/phase requirement, infer a missed user defect, attribute the new probe to historical author knowledge or revise a score.
