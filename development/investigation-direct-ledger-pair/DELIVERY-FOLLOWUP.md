# Investigator delivery and recorder limit follow-up

This is a local, scripted transfer check on the existing experimental,
default-off investigator. It does not revise the I0/I1 ledger, the historical
decline, or model-quality results. No real provider request was made.

## What I1 received

The saved I1 child result has a 14,100-byte test-only patch for two connector
test files, a child explanation, and 90 tool events. The old
`investigationDeliverySummary` spread the entire result and then shortened each
output. Its actual 131,280-byte native return comprised 114,566 JSON bytes of
command rows (including command arguments and shortened outputs), 14,760 JSON
bytes for the patch, 771 for the explanation, 621 for the request and smaller
metadata. The raw child event outputs in the retained full result occupy
615,445 bytes; those are not the native return size.

The next author request contained OpenCode's 332-byte notice, not the patch:
`...131280 bytes truncated...`, followed by an absolute path under
`/work/data/opencode/tool-output/` and an instruction to use a Task explore
agent. The author then ran `git status --short`, `glob`, and `grep` in the
delivery worktree and declined. No historical tool call tried to read that
path. A separate installed scripted control on the same native permissions
successfully used `read` on a real truncation path and received a 2,248-byte
tool response containing the start of the file. Thus the saved link was readable in that control; its existence
alone did not put the child patch in the original author's visible tool result.
The historical author's internal reasoning and what it would have done after
reading the link are not observable.

## Contract change

`investigate` now returns an explicit receipt capped at 12,000 serialized UTF-8
bytes. It reports completion/error/incomplete state, whether a test patch was
proposed, exact author snapshot, patch SHA-256/size/test paths, a short labelled
child claim, and selected saved check exits. It says the test has not been
applied. A nonzero exit is kept as an exit, with no inferred test-failure count.
Full result, test patch, child messages, and tool events remain in the existing
private artifacts.

The same tool's read-only `inspect` action serves bounded sections: `patch`,
`explanation`, `checks`, and `output` by a saved check call ID. Cursor offsets
are UTF-8 byte boundaries, tied to the immutable result/section/content hash.
Pages expose the author snapshot, SHA-256, completion and next cursor. Missing
or inconsistent saved artifacts fail explicitly. Inspect takes no path, starts
no child, consumes no second-investigation allowance, and does not change the
snapshot, deadline or disposition. Decline remains valid. Accept still requires
an author rationale, exact snapshot, saved patch integrity and ordinary Git
preflight; it applies the original test-only patch without three-way overwrite.

## Installed and local evidence

The pinned offline OpenCode 1.18.26 image and local scripted provider ran the
same small synthetic task with zero real provider calls. On the unchanged old
code at `51b38d0`, 22 child tool events plus a 9,769-byte test patch produced a 152,897-byte
tool return. The next author request contained only the 332-byte native
truncation notice; the scripted author declined. The separate native-read
control confirmed the link was readable in that fixture. Both old controls
completed and cleaned their containers.

The final fixed installed run made an author draft that returned an incorrect
legacy value, delegated once, and got two actual failing child `npm test`
exits. The author received an intact 1,438-byte receipt. It used 13 inspect
calls: page sizes were 1,481, 1,483, 1,483, 1,482, 1,483, 1,483, 1,482,
1,483, 1,482, 938, 437, 1,677 and 1,291 serialized bytes (17,685 total). The
9,769-byte saved patch was reconstructed exactly from those pages by SHA-256;
the saved explanation and selected check output matched the bytes sent to the
author. The test file was absent from the author worktree before accept and
matched the saved patch after accept. The author fixed production with native
tools, ran the project checks, and produced a terminal patch that applied
without repair in an ordinary Git copy and passed its tests. That installed
run made 52 scripted provider requests over 11,957 ms; the 13 native inspect
tool spans summed to 877 ms. These timings include local runtime effects and
do not measure Luna token savings or money. A separate negative installed
control let the author inspect a red test asserting the wrong value, decline
it, and finish without the child test in its terminal patch.

The small-result installed control delivered a 1,105-byte receipt in 17
scripted requests. Local controls reconstructed a large UTF-8 patch, multiline output and one
long Unicode line without loss, repetition or reordering; checked small/no
patch and incomplete results, missing/tampered artifacts, invalid or
cross-section cursors, and saved call IDs. Existing investigation checks cover
snapshot conflict, test-only protection, dependency state and opt-out. The
recorder controls below cover the revised error states. The broader controller
suite with a known open handle was not treated as a passing gate. Scripted
accept/decline shows transport capability, not model judgment or task-quality
gain.

All ten installed scripted attempts are counted below (391 local provider
requests in total, zero real provider requests):

| Attempt | Local requests | Result |
| --- | ---: | --- |
| Old oversized return | 36 | Native truncation reproduced; author declined |
| Old return plus native read | 37 | Truncation path readable; author declined |
| New exploratory path | 52 | Inspect, accept and ordinary patch passed |
| First stronger final check | 23 | Fixture assertion used a wrong child path; stopped |
| Corrected final check | 52 | Passed |
| Wrong-expectation control | 18 | Inspected then declined |
| Measured follow-up | 52 | Passed |
| Small-result control | 17 | Passed |
| Full transfer before paged command expansion | 52 | Passed |
| Final code and fixture | 52 | Passed; metrics above |

An initial model-free assertion about receipt truncation was too weak and was
corrected. Recorder and general native-fixture controls initially hit loopback
`EPERM` under the sandbox; both passed with local loopback permission. The
failed installed fixture assertion did not change the implementation. No
historical I1 child, ledger run or paid availability probe was repeated.

## I1 request 148: later limit diagnosis

The original `recording-148.json` says `Recording response byte limit` and
retains a 71,377-byte response prefix, with no EOF, terminal or usage. That
message conflated the per-response and whole-slot predicates. The saved
`recording-config.json` bounds were 67,108,864 response bytes and 268,435,456
slot bytes. Summing the actual files for all 148 requests gives 247,928,384
bytes across **both** request-body archives and 20,499,053 raw response bytes:
268,427,437 bytes in the slot before the rejected chunk. Only 8,019 slot
bytes remained, while response 148 had 67,037,487 bytes of headroom. Thus
the rejected chunk definitely exceeded the slot remainder; whether it also
exceeded the response bound cannot be determined. Its byte length and any
unrecorded tail were not retained. Server completion and usage remain unknown.
This stop is not shown to be caused by the investigator tool return.

The development-only recorder now writes every exceeded scope with request
index, bound, used bytes and rejected operation bytes. It retains the first
failure when finish/persistence subsequently fails. Synthetic controls checked
response-only, slot-only and simultaneous bounds, terminal/usage retention on
write failure and unknown completion without a terminal. All 20 final recorder
controls passed. No bound, accounting,
admission, retry or stop policy changed.

After verifying the named receipts and Docker cleanup, the task-created
dependency bundle and duplicate scripted source/run copies were removed
(108,983,689 file bytes, about 104 MiB). The compact results, final/negative
and old-path request evidence, failed-attempt log, and original I0/I1 private
archive remain local. The reusable fixture's rolling ignored
`local/native-targeted-integration/installed-preflight.json` was updated by
these runs; older named receipts were not changed.
