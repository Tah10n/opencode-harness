# Saved probe rechecked; original slots 3–9 attempted

**Six of the seven remaining attempts delivered a complete correct patch with
normal autonomous completion.** The last attempt, EventEmitter3/R, stopped before
implementation after a native `glob` error cancelled an in-flight request. All
nine original outcomes remain below. No slot was retried or replaced.

The investigator was **never invoked in any of the three H attempts**. Denque's
complete P/R/H triple ties on full delivery; the two completed P/H pairs both tie.
These results provide no observed delivery gain from the investigator. Preserve
its experimental, default-off status. No statistical lift or causal quality
advantage is established by three tasks with execution amendments and interruptions.

## Repair and explicit admission

Launcher `f745a4092bb955595bf902353bde6ae5e037c31b` uses the existing request-local
SSE/UTF-8 observer plus a small completed-assistant-item accumulator. It accepts
text in either `response.completed.output` or completed `response.output_item.done`
messages when the terminal output is empty. IDs and output indexes bind items;
duplicate representations do not duplicate text and conflicts reject admission.
Reasoning, tool arguments and incomplete deltas cannot supply the assistant answer.
Provider terminal state, text, normal EOF/local completion and admission are separate.
Task transport, authorization, error semantics, deadlines and product code are unchanged.

The preserved `availability.sse`, metadata and false pause match the hashes in
[the earlier report](availability-results.json). Offline replay of those exact bytes
reproduces the old rejection and yields **Okay**, a bound completed response, normal
EOF and the original **18 input + 29 output = 47 tokens** under the corrected logic.
The offline entry point does not read authorization or call fetch. The original
SSE, metadata, report and all three old pauses remain unchanged. The correction is
recorded separately in [the new results](rechecked-results.json).

The user's explicit exception authorizes only this false text-extraction pause and
original slots 3–9. Its amendment binds the original freeze, old probe hashes,
corrected launcher and range. Results are in a distinct `continuation-3-9-rechecked`
period. Every prior run directory was checked: slots 3–9 had no earlier starts or
requests. Existing execution and forwarding were stopped. Unknown historical server
outcomes remain unknown. **New availability requests: zero.** The old 47 tokens are
counted once; offline replay is neither a new probe nor a new model success.

Product candidate remains `9cd8ffb4dfcfd32f1a7a65ac9c3eaca44728d2e7`, with the exact
frozen bundles, prompts, dependencies, rubric and public inputs. Every role used
OpenCode 1.18.26, Luna/high, the original route/account, a 900-second whole-task
budget and shared 180-second diagnostics. No default, endpoint or permissions changed.

## All nine assigned outcomes

Q means the full patch satisfies the frozen behavior and required tests/types/docs.
T means normal autonomous completion and verified termination/capture. D = Q ∧ T.
Internal `incomplete` is reported separately; it does not determine Q or T.

| Slot | Task | Arm | Period | Q | T | D | Internal status / outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | QuickLRU take | P | Original | false | false | false | Historical overload/unknown execution; empty patch |
| 2 | QuickLRU take | R | First continuation | false | false | false | Historical protocol overload/unknown execution; empty patch |
| 3 | QuickLRU take | H | Rechecked continuation | true | true | true | Internal incomplete; complete patch |
| 4 | Denque drain | R | Rechecked continuation | true | true | true | Internal incomplete; complete patch |
| 5 | Denque drain | H | Rechecked continuation | true | true | true | Internal incomplete; complete patch |
| 6 | Denque drain | P | Rechecked continuation | true | true | true | Normal plain completion |
| 7 | EventEmitter3 emitCollect | H | Rechecked continuation | true | true | true | Internal incomplete; complete patch |
| 8 | EventEmitter3 emitCollect | P | Rechecked continuation | true | true | true | Normal plain completion |
| 9 | EventEmitter3 emitCollect | R | Rechecked continuation | false | false | false | Tool error, no implementation; one request remotely unknown |

Raw D counts are P 2/3, R 1/3, H 3/3. **The interrupted controls make these counts
unsuitable for a causal investigator claim.** QuickLRU/H demonstrates delivery on
that task, not better reasoning than the historical controls that never implemented it.

### Denque: complete matched triple

| Arm | Q/T/D | Whole-task native time | Requests | Input + output tokens |
| --- | --- | --- | --- | --- |
| P | true/true/true | 191.866 s | 16 | 451,596 |
| R | true/true/true | 333.693 s | 33 | 1,430,032 |
| H | true/true/true | 308.440 s | 26 | 962,487 |

R performed the ordinary additional attention stage (57.807 s), reran checks and
left the patch unchanged. H did not call the investigator. H used fewer tokens
than R but more than twice P's tokens, with the same full-delivery result. This is
one development task, not an estimate of general efficiency.

### EventEmitter3: retain the interrupted control

| Arm | Q/T/D | Whole-task native time | Requests | Input + output tokens |
| --- | --- | --- | --- | --- |
| P | true/true/true | 259.538 s | 20 | 541,342 |
| R | false/false/false | 17.317 s | 4 | 14,626 known; one request unknown |
| H | true/true/true | 551.421 s | 39 | 1,483,777 |

P and H both delivered. H used about 2.74× P's total tokens and did not invoke the
investigator. R did not reach its extra attention stage, so this is not a completed
quality comparison of all three systems. These tasks are part of the original
three-task series, not a new independent sample.

## Full-patch evaluation and attribution

Every captured patch was applied without manual correction to a fresh ordinary
project copy using the frozen dependencies. The unchanged independent evaluator
ran under hash-based aliases; manual full-patch review knew the arm labels, so this
is not a fully blinded assessment. Ordinary project suites, the public behavioral
contract, preservation, required runtime categories, declarations, type-use
regressions and API docs/examples were assessed together. All successful patches
are [retained here](patches); per-patch reviews/check outcomes are in
[rechecked-results.json](rechecked-results.json).

- QuickLRU/H: both cache generations, live/missing/stored-undefined distinction,
  expiration callback and retained entries; usable types, tests and docs. Patch
  application, npm suite including tsd and independent contract all pass.
- Denque/P/R/H: valid/invalid counts, no mutation on rejection, FIFO special-value
  identity, wrapped/grown storage and capacity reuse; generic types and docs.
  Application, npm suite including TypeScript and independent contract all pass.
- EventEmitter3/P/H: snapshot registration order, exact once-registration removal,
  contexts/arguments/identities, synchronous thrown values, CJS/ESM and typed event
  arguments. Application, CJS suite, ESM suite, independent contract and independent
  TypeScript checks all pass. Actual author logs also confirm compilation of their
  own delivered type regression after edits.
- EventEmitter3/R: no terminal patch; all 28 captured public worktree files match the
  original input. The empty patch preserves the old suites but fails the independent
  API and types checks because `emitCollect` is absent. Q=false, T=false.

Test-strength limits remain visible: QuickLRU/H's final wrapper regression uses deep
rather than strict nested object identity, and EventEmitter3/P's thrown-value test
lacks an explicit caught flag. Actual implementations preserve the contracts and
independent checks verify them. These are coverage limits, not retroactively added
mutation thresholds or evidence of investigator work.

For every H slot: author question → **not requested**; child execution → **none**;
returned test patch → **none**; acceptance/rejection → **none**; integration effect →
**none attributable to the investigator**. All delivered H tests belong to the main
author. Offline evaluator checks are not model-authored checks. No child was invoked
post hoc and no additional run was added.

The four successful direct R/H runs report internal `incomplete` because their
check classifier says npm test was unobserved, even though captured completed tool
commands show successful npm test after edits. This discrepancy is retained as a
product limitation; no classifier, sensitivity or investigator change was made.

## Exact final stop

In slot 9, a native `glob` for `src` returned `ripgrep execution failed`. The frozen
candidate recorded `tool_error: Native tool error has unconfirmed execution or state`
and cancelled local execution. The fourth request had already been forwarded and
had HTTP 200 plus a bound `in_progress`, but no terminal response. Transport recorded
`AbortError`, client/relay cancellation, and `unknown_submission`. Its server outcome
and usage remain unknown. **No provider refusal, quota or overload was observed.**
The own-task deadline did not fire. No investigation or extra-attention stage ran.

The first three requests completed normally, including title, with 14,626 known
tokens. The native process exited 137. Capture, process termination, closed forwarding,
zero active provider handlers and container removal are verified. Local termination
does not establish remote cancellation. The new pause is preserved; no retry or new
probe was made, and no further campaign is scheduled.

## Accounting and validation

The new period forwarded **161 requests**, with **5,728,801 known tokens and one
request with unknown usage**. Summed native execution was 2,025.712 seconds
(33 min 45.712 s); cleanup was 0.398 seconds. Request intervals can overlap;
per-slot summed request duration is separate in JSON. All title and work requests
are included. Cache and reasoning token counts are nested subsets, not extra cost.
Equal deadlines are not equal token budgets. No monetary cost is inferred.

Including both historical periods and the single old probe: **168 requests,
5,735,266 known tokens, six requests with unknown usage**. The complete token total
is unknown. Development, preparation and offline evaluation are separate; their
aggregate usage/time was not reliably metered. Local verification and grading made
zero real provider requests.

Targeted validation: 20 text/lifecycle scenarios with byte-split UTF-8/SSE; reproduction
of the real false negative and corrected replay; 14 offline continuation cases with
new fetch prohibited; 14 existing loopback HTTP admission cases; 11 legacy integration
continuation cases. One bounded diff review and affected rechecks passed. See
[validation](probe-recheck-validation.json). These checks are not full CI evidence;
`PROCESS_CONTAINMENT_UNAVAILABLE` remains the separate full-verifier limitation.

All seven task containers and seven grading containers are absent. All seven local
stop records are verified; 45 historical evidence files, the old report, all three
old pauses and the original freeze remain intact. No manual Actions, full platform
matrix, merge, release or package publication was performed.

Offline verification commands (no model calls):

```sh
node development/native-task-investigation/verify-probe-recheck.mjs local/native-investigation-comparison
node development/native-task-investigation/verify-saved-continuation.mjs
node development/native-task-investigation/verify-availability.mjs
```

The measured continuation must not be rerun. Its admission and per-slot started
records intentionally reject re-entry.
