# Differential compatibility replay: working prototype, stopped development run

The executable probe detects added preservation failures missed by the ordinary
public suites on all six synthetic tasks. The real comparison stopped after
one completed control and one interrupted candidate. **Model benefit is not
shown; keep the probe experimental. Do not promote it or resume this campaign.**

[Protocol](../PROTOCOL.md), [committed execution seal](execution-freeze.json),
[model-free evidence](model-free.json), [all twelve slot outcomes](results.json).
This is a D versus D-plus-probe development exercise, not a Plain comparison or
independent confirmation. Historical campaigns are unchanged and not pooled.

## Mechanical result

| Task | Kind | Self | Gold | Wrong public suite | Existing correction reasons | New mismatch |
| --- | --- | --- | --- | --- | --- | --- |
| Consecutive runs | Refactor | match | match | PASS | 0 | separated repeats merged |
| Grid mirror | Refactor | match | match | PASS | 0 | original rows mutated |
| Required column | Refactor | match | match | PASS | 0 | exception replaced by null |
| Label suffix | Extension | match | match | PASS | 0 | Unicode code points split |
| Packet separator | Extension | match | match | PASS | 0 | empty fields dropped |
| Point offset | Extension | match | match | PASS | 0 | explicit zero scale ignored |

All six gold patches independently pass; all six wrong patches independently
fail. New/intentional behavior is outside the preservation corpus and is checked
by the independent acceptance suite. Oracle values come exclusively from baseline
execution. No gold, acceptance test or evaluator output is available to probe or
author. All new task execution and independent grading occurred in the existing
offline container sessions.

Example: public `encode(['a','a','b'])` passes under the wrong global-grouping
patch. Replay of the fixed public input `['a','b','a']` observes baseline
`[{value:'a',count:1},{value:'b',count:1},{value:'a',count:1}]`, but candidate
`[{value:'a',count:2},{value:'b',count:1}]`. The observer includes both behaviors,
arguments after the call, entrypoint, snapshot/tree hashes and reproduction paths.
The correct consecutive-group helper eliminates the mismatch.

The installed scripted provider performs this sequence through real OpenCode
1.18.26 native tools: control public tests PASS / no correction / independent
R=false; candidate public tests PASS / two concrete mismatches delivered / one
correction / fresh matched snapshot / independent R=true. Both deliveries are
proven. This is technical wiring evidence, not a model result.

Ten negative controls cover unsupported return, random/stateful instability,
module execution failure, function timeout, wrong corpus/baseline hashes,
participant corpus replacement/removal and exhausted worker budget. None emits
a semantic corrective reason. The exhausted-budget case does not claim a worker
was launched or killed. Separate actual native five-second deadline controls
verify termination, removal and zero live provider handlers for both arms.
The existing actual container boundary test passes network/mount isolation,
detached descendant stopping and protected evidence capture.

## Real execution and stop

The model-free gate passed and source/protocol were committed as
`cc7a255eb62983dd5c83b52a898affd6685786ee`; the execution seal was committed as
`4ef4c1daf4fe24ff558e85472b0372106ab611da` before the first request. Both used the
existing OAuth connection, Luna/high, 600-second outer deadline and the frozen
bundle. No connection inference probe, fallback, retry or replacement occurred.

The real run began while the mandatory `npm run verify` was still running.
That check subsequently failed: `plugin.mjs` used the installed relative import
`../native-task-plugin.mjs`, which did not resolve from its repository location.
The installed fixture had passed because that path was valid inside its bundle.
**The incomplete mandatory verification was a preparation error.**

On discovering it, the launcher was suspended, new forwarding stopped, the
candidate workload was stopped with the existing termination helper, and its
relay was suspended. The existing recovery path copied the partial patch and
native evidence before removing the container. The campaign pause is terminal;
remote completion for the request in flight is unknown. Only two slots started.
The ten other slots remain NOT STARTED, including both arms of tasks 02–06.

After stopping, source/installed import relocation was fixed. Validation confirms
that the resulting installed wrapper bytes are identical to those exercised by
the model-free gate. The pre-run source commit, execution seal and original receipts remain intact;
no model attempt followed the fix. Final reporting also enforces the precommitted
unknown-pair rule for missing completion evidence; the original provisional
report that counted the interrupted capture as a loss is retained privately by
hash. Completed proven failures remain measurable in the regression test.

| Slot / task | Arm | Independent initial R | Independent saved patch R | Delivery | Q | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 1 / consecutive runs | Control | true | true | true | true | completed |
| 2 / consecutive runs | Candidate | true | true, partial capture | false | false | interrupted; excluded from paired measurement |
| 3–12 / remaining five tasks | Both, frozen alternating order | unknown | unknown | not started | unknown | not started |

There are **0 completed comparable pairs: 0 wins, 0 losses, 0 ties, 6 unknown**.
The partial patch R is independent evidence about those saved bytes; it is not
normal author completion. Q=false records missing delivery after intervention,
not a model-caused loss. No retries were used to fill the missing outcomes.

The candidate probe executed once at D0 (96.24 ms) and returned `matched`.
**New probe mismatches delivered to a real agent: 0; additional regression fixes:
0; observed false probe signals: 0.** Its one existing D correction was triggered
by a previous failing `node --test test/public.test.mjs` observation, not by the
probe. D0 and recovered partial patch both independently pass; there is no final
D1 probe or normal terminal result. No new independent failure was observed in
the saved partial patch, which cannot establish completion or general safety.

## Accounting

| Arm | Forwarded requests | Known usage records | Input tokens | Output tokens | Included cached / reasoning | Native task time |
| --- | --- | --- | --- | --- | --- | --- |
| Control | 21 | 21 | 218,144 | 5,423 | 39,424 / 1,483 | 60.597 s |
| Candidate, interrupted | 36 | 35 | at least 617,700 | at least 9,698 | known 187,904 / 4,311 | unknown; interrupted |

Known total: 835,844 input and 15,121 output tokens across 56 requests; one of
57 requests has missing terminal/usage evidence. Counts include ordinary native
auxiliary work. Cached and reasoning counts are subsets. Monetary cost and final
server settlement are **unknown**. The stopped slot is retained, not omitted.

## Delivery and verification boundaries

Start baseline: `4817ec065b899775ace86708f84819209b518870`. The native two-file
materializer, core, author/correction prompts, default D strategy, optional
feature defaults, correction count and shared stop/deadline code are unchanged.
One optional observation callback is the only native runtime integration; the
wrapper is evaluation-only. Existing scheduling/recording/capture/evaluation
components are reused. The new exact twelve-slot admission kind does not relax
historical gates. No dependencies or global OpenCode settings were changed.

Raw provider/session evidence stays private. Publication contains only the
sanitized slot and technical receipts. Required local/remote verification and
owned-resource cleanup are recorded in the PR and final task report. Initial
preparation failures are retained; later PASS does not erase the stopped run.
