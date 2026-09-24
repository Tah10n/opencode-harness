# Direct investigator pair on account-switch-ledger

**Neither slot delivered the complete task.** I0 has `Q=false, T=true,
D=false`. I1 has `Q=false, T=false, D=false`: its recorder stopped after request
148 with incomplete response evidence, and it has no ordinary terminal answer.
The captured I1 working-tree patch is assessable, but is an interrupted patch,
not a completed delivery. This is one known public development task, with no
estimate of causal lift or general model quality.

## Fixed candidate and input boundary

The runtime candidate is `1b8c7acbbe59db26462ae0818588274ae67ac683`.
Before the change, `projectScope(allFiles=true)` omitted the 769,479-byte
`docs/assets/social-preview.png`; `prepareInvestigation` then rejected the
incomplete full snapshot. The narrow copier change preserves ordinary opaque
assets as bounded bytes with their paths, modes and hashes. It leaves
`projectScope` and the text-context limit alone, refuses unsupported inputs,
protects non-test files against child edits and returns only a test patch.

The complete clean VibeRacing baseline
`2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd` copied **258/258 files,
3,428,502 bytes, including eight PNG/TTF assets**, with exact bytes and modes.
The copied child cwd passed readers 86/86, config 103/103 and protocol 14/14
in the pinned offline image. Narrow unit checks covered limits, links, path and
permission denials, test-only transfer, changed author snapshots, cancellation
and deadline. The installed scripted preflight exercised author edit → one
child → real test → accept → terminal patch → clean Git application in 17
scripted requests and **zero real provider requests**. The host config suite
could not bind loopback (`listen EPERM`); the pinned image passed it. A broader
`verify-native-task.mjs` emitted 23 successful scenarios but retained an open
handle and was stopped, so it is not a reported passing gate.

Both real slots used OpenCode 1.18.26, Luna/high, the same 3,600-second direct
budget, public baseline, original task and verified environment bytes, pinned
image, offline permissions and existing relay. I0 had investigation disabled;
I1 alone had the existing instruction and tool. The two independent source
trees had the same 259-file inventory (including `TASK.md`), fresh one-commit
Git histories and no remote or historical solution. The frozen
[manifest.json](manifest.json) and plan preceded the first provider request.
No retry, continuation, replacement, reviewer or extra author turn followed.

## Complete-task assessment

Both untouched captured patches, [I0](patches/I0.patch) and
[I1](patches/I1.patch), applied with `git apply --index` to separate clean
ordinary Git copies. The resulting trees had the recorded file modes and no
required harness path or dependency. F and E copies kept identical
implementation inventories before and after tests; the independent privacy
test was copied under the separately frozen filename with its original
SHA-256. [result.json](result.json) has the compact receipts. Full test output
and raw run evidence remain ignored and local. The assessment reused the
published ledger tests and offline Docker procedure; [assess.py](assess.py)
binds them to these two patches.

| Check | I0 | I1 |
| --- | --- | --- |
| Clean Git patch application | Pass | Pass, captured before interruption |
| F readers / config / protocol | 89/89, 103/103, 14/14 | 89/89, 103/103, 14/14 |
| Frozen E behavioral cases | 21 pass, 2 fail, 0 skip / 23 | 21 pass, 2 fail, 0 skip / 23 |
| Separate published Claude privacy test | 2 pass, 1 fail / 3 | 3 pass / 3 |
| Repository `corepack pnpm verify` | Unavailable offline: pinned package not cached | Same |
| `Q` full task | **false** | **false** |
| `T` ordinary terminal answer and verified stop | **true** | **false** |
| `D = Q ∧ T` | **false** | **false** |

The two frozen E failures are OpenCode accepting a saved server baseline
without confirmed exact-ID cutover, and an exact conflict-diagnostic spelling
assertion. The latter spelling does **not** determine Q. Separate public-path
observations show both implementations return empty, `complete` results when
exact cutover is missing and when their accepted ledger state is corrupted.
Those violate the original fail-closed and accepted-usage requirements.

I0 also persists a raw 64-hex Claude provider ID in a real first CLI sync and
after migrating baseline-generated state, despite retaining the accepted 15
tokens. Its conflict adapter reports partial and keeps the first 15 plus a new
7, but diagnostic normalization drops the conflict code before the consumer.
I1 passes those privacy cases and preserves the normalized conflict diagnostic.
Both preserve baseline-generated accepted totals for four JSONL adapters,
handle the tested account remap without duplication, and pass the six real CLI
persistence cases. Source review found a finite 65,536-entry event cap and
existing scan/range paths; no exhaustive load or platform matrix was run.

The saved `calibration/legacy-state.json` belongs to another experimental
implementation, with its own internal event-ledger layout and old local path.
It is not a mandatory format for these fresh candidates. The required 0.4.3
migration is instead exercised by the frozen tests and the additional
baseline-generated state observations. A first run of the supplemental I0
diagnostic script hit a fixture-layout error; a copy changed only its
corrupt-state field selector and completed. That initial error is not counted
as a product failure or a pass.

## I1 investigation chain and stop

The author independently asked for observable ledger schema/collector tests
across account switching, 0.4.3 migration and conflicts. The delegation began
on the original unchanged author snapshot (`22004f20…`) before production
edits. One child ran for 817.358 seconds within I1's budget and returned a
usable, **test-only** [338-line patch](patches/child-test.patch): 90 added lines
in config and 248 in readers, no deletions. Its actual project checks had
three new reader failures and one new config failure while baseline coverage
remained. The tested migration, conflict, account-switch and exact-ID paths
follow the original task and are not empty-setup passes. A red test remained a
hypothesis for author review, not proof by itself.

The native `harness_investigate` tool response was **131,280 bytes**. OpenCode
replaced the author's visible reply with a truncation notice and a path to its
full output. The collector retained that complete file and the separate child
patch/result. The author checked the delivery worktree, saw no test patch there,
and explicitly **declined** the proposal, stating that there was no
inspectable test patch or contract evidence to integrate. The child patch is
absent from final I1 M. Later production and test edits may have addressed
similar topics, but there is no observed accept → integration chain, so none
of that code is attributed to child feedback. This is an informative delivery
failure of the existing investigation path, not a reason to replace the run or
change the frozen runtime after the fact.

I0 ran 81 recorded requests and ended normally in 1,330.998 seconds; its
internal direct workflow status was `incomplete`, retained separately from Q.
I1 ran 148 requests over 2,233.153 seconds. Requests 1–147 have complete
recordings; response 148 was cut at 71,377 bytes by the existing
`research-full-v1` response limit, with server completion and usage unknown.
The scheduler stopped admission at `evidence_incomplete`; it did not send a
continuation. The native process exited 137, but local process termination,
capture, relay closure/removal and zero active provider handlers were verified.
The container no longer exists. All 687 request/upstream/response files across
the two slots and the one retained native full-output file were checked
against their recorded sizes and SHA-256 values. Both patch captures and native
output exports succeeded. This proves the *local* stop and retained partial
evidence; it cannot establish the upstream completion of response 148.

## Resources and interpretation

| Provider role | Requests | Known input | Known output | Cached input subset | Reasoning output subset |
| --- | ---: | ---: | ---: | ---: | ---: |
| I0 title / parent / author | 1 / 1 / 79 | 577 / 6,429 / 13,004,765 | 88 / 33 / 39,083 | 0 / 0 / 9,860,608 | 76 / 16 / 22,475 |
| I1 title / parent / author / child | 1 / 1 / 104 / 42 | 577 / 6,526 / 20,765,771 / 6,216,561 | 86 / 53 / 49,435 / 29,560 | 0 / 0 / 388,608 / 169,984 | 74 / 36 / 29,302 / 19,971 |

Input/output already include their cached/reasoning subsets. I1 author has
**one request with unknown usage**, so its known totals are lower bounds. No
money estimate is made without a provider bill. Child time and tokens are
included in the I1 wall-clock budget and are not free. Preparation/copy was
completed before the first real request at 13:46:59 UTC; fresh source copies
and freeze were created at 13:44:49 UTC. Those preparatory steps were not
separately timed. The main offline F/E assessment ran about 80 seconds after
both author runs, with supplemental observations afterward; it did not use the
provider or feed results back to either model.

The result is **no additional complete delivery**. I1 improves the observed
privacy and diagnostic paths, but its investigator test was declined and its
run ended on a recorder stop. This single known-task pair cannot establish an
investigator benefit, a general lift, or grounds to enable it by default.

After checking patch, recorder and native-output hashes, cleanup removed the
task-created installed dependency bundle, two disposable source copies and
six evaluator copies (about 110 MiB). The ignored private recordings, child
artifacts and evaluation receipts remain locally for this report's evidence;
neither experiment container remains.
