# Persisted-state privacy regression result

## Contract and executed path

The [literal task](../../plain-ledger-native-high/original-task.txt) prohibits
raw provider IDs/content in persisted state or upload. The previous
[completion-gap analysis](../completion-gap-analysis/REPORT.md) found that the
Claude prototype-security case checks raw message keys and JSON roundtrip,
while the earlier CLI probe stopped at its first persisted-state failure. This
new test deliberately covers only **two known synthetic provider IDs in the
whole `state.json` written by the real CLI**. It does not assert content
privacy, other adapters, upload privacy, arbitrary encodings, or irreversible
anonymization.

The test installs one `claude_code`/`claude_jsonl` source in a temporary home,
with a normal string ID and a distinct 64-hex ID. The events are on two UTC
days inside the CLI range, with exact input/output totals 10/5 and 7/4. It
starts a local HTTP fixture using the response shape from the project's
`config.test.mjs`, then launches `packages/connector/bin/viberacing.mjs sync`.
Before the first privacy check, it requires CLI exit 0, a usage request and
acknowledgement of two entries and the source sequence at loopback, a collector
trace for the configured source, one
complete source snapshot, exact nonzero daily totals and components, and a
nonempty state file that differs from the precreated installation state. It
reads the finished file from disk, checks its byte count and JSON validity,
and searches both serialized bytes and all parsed own string keys/values.
Diagnostics show only the synthetic ID, structural path, and sync step.

The subsequent two CLI invocations are fresh processes with the same saved
file: first with the source still present, then after source-file deletion.
Their upload snapshots must retain the same two rows and not double totals;
the entire state file is checked for raw IDs after each successful sync. No
collector, persistence method, or serializer is mocked. The test has no
dependency on internal ledger shape.

## Executed controls and historical results

The final test-only patch applied to a clean copy of baseline
`2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd`, outside the harness
administrative tree. From that project root, Node 24 controls passed (2/2):
nested raw key, raw string value, JSON-escaped value, and exact 64-hex ID are
detected; a different 64-hex digest is accepted; empty, malformed, and absent
state documents fail; missing entries and zero totals fail the usage guard.
Only the controls were selected in that clean-baseline run; it was not a
positive full CLI product control.

| Exact project copy | CLI evidence before privacy | First state read | Result |
| --- | --- | --- | --- |
| baseline + unchanged `../D0.patch` + test-only patch | CLI exit 0; loopback accepted two entries and source sequence; Claude collector called once; 2026-09-22: 15 (10+5), 2026-09-23: 11 (7+4); state changed and had 3073 bytes | both source IDs found at `$.adapters.{key#0}.files.{key#0}.ids[0]` and `[1]` | 2 controls pass, CLI regression fails as intended |
| baseline + unchanged full `../post-capture-followup/M.patch` + test-only patch | same observed path, rows and state size | same two paths | 2 controls pass, CLI regression fails as intended |

The first ID was `synthetic-claude-provider-message-a`; the second was the
synthetic `e9` pair repeated 32 times. They are distinct from source,
installation, account, path and fixture identifiers. The diagnostic checks
the original exact IDs, not the appearance of arbitrary 64-hex strings.

Both saved variants stop on the **first** privacy assertion. Their second
process reload and deletion-retention assertions therefore did not execute;
source code alone is not counted as a passing check. No unchanged existing
implementation was identified that passes this whole CLI path. Positive
end-to-end calibration remains unverified, while the two observed failures
are actual persisted-state leaks after accepted usage.

## Provenance, limits, and accounting

The VibeRacing copies used the public baseline above and the historical patch
bytes already saved in this development directory. The test-only patch adds
only one project test; it leaves the existing prototype-security test and all
product code unchanged. The test was manually prepared from the known
development defect and the original task. Luna did not independently create
it in the historical attempt, and this result does not show that the generic
harness detects privacy gaps. Giving a later agent this test changes its
available information. A future plain/harness comparison would need the same
public checks on both sides and separate independent acceptance.

The portable principle is to check a prohibited value in the final product
artifact after the production path, while proving useful data was processed
and persisted. This does not settle the separate malformed version-1 state
question or F's internal reason for stopping.

Runs used the pinned Node 24 Linux image
`sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`
with `--network none`, loopback only, read-only project bind, non-root user,
dropped capabilities, no-new-privileges, 3 GiB memory, 256 PIDs, and isolated
tmpfs. The test never contacted a real VibeRacing server. There were nine
local CLI `sync` invocations across draft/final test revisions; all nine
CLI processes exited 0 and each outer test failed at the expected first
privacy assertion. Four control-only Node runs made zero CLI calls. One initial
shell preparation stopped before any CLI command because `status` is a
read-only zsh variable; it was corrected without changing historical patches.
The nine measured CLI test-case durations totaled about 1.15 seconds; wrapper
startup and preparation time are separate. Model/provider/reviewer and
scripted-author runs: **0**. Historical Luna usage and Q/T/D, 209/209, 15/23,
and prior privacy results remain unchanged.

Checks after the last test edit: `node --check`, clean-baseline patch
application, controls 2/2, D0/final expected-failure reproductions, scoped
whitespace, and a content review of the test-only patch. Full controller,
installed matrix, ledger probes, platform CI and positive full CLI control
were not run. These local results are not CI or a repaired VibeRacing product.
