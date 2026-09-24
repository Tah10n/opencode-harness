# Claude persisted-ID calibration result

## Outcome

The unchanged published privacy test passed completely on the repaired
disposable copy: two controls and the full three-process CLI scenario. The
three completed syncs each sent one `/api/usage` request, received acceptance
of two daily entries and the source sequence, and uploaded exact input/output
components `10/5` and `7/4` (totals `15` and `11`). The test read the entire
finished `state.json` after each sync, parsed it, and found neither exact raw
provider ID in its bytes or own keys/values. The second process did not double
usage; the third retained it after the source file was deleted. The saved
[test receipts](test-receipts.json) record the three observed steps,
including changed first state (`3285` bytes), reload (`3285`), and deletion
retention (`1655`). The same file completed **213/213** Claude privacy,
security, reader, config, and protocol tests in the pinned container.

The one-line [mutant](mutant.patch) added raw IDs to Claude's real per-file
state during collection. The unchanged test then passed both controls,
observed an exit-0 CLI, two accepted nonzero rows and source sequence, and
failed at the first persisted privacy assertion. Its [RED receipt](test-receipts.json)
names both IDs at `$.adapters.{key#0}.files.{key#0}.rawIds[0/1]`.

The original RED is the unchanged-final receipt in the parent
[test-only report](../REPORT.md): two controls passed, the CLI accepted the
same two rows, then both raw IDs appeared in `files.ids` in the first saved
state. The exact M and test-only patch hashes below match that reproduction;
no new nine-run campaign was made. The current [real legacy state](legacy-state.json)
independently confirms both raw IDs in an unchanged-final CLI write.

## Repair and old-state boundary

Claude alone now maps each parsed provider message ID to a prefixed SHA-256
identity before storing `messages` keys or per-file `ids`; the existing event
ledger already used SHA-256 for its event keys. `identityVersion: 1` marks the
new auxiliary representation. A state without that marker, including a raw
64-hex provider ID, is transformed once on the next Claude collection. A
marked state reuses its keys on reload. The original event ID still reaches
the ledger observation for duplicate and tuple-conflict detection. The CLI
persists the resulting state under both `adapters[sourceId]` and
`adaptersByClientSourceId[clientSourceId]`; both copies were checked. Source,
client-source, installation, and account identifiers are outside this
transformation.

`legacy-transition.mjs` generated one state with the unchanged final CLI,
saved its exact original `3029` bytes, removed the event file, and then used
new CLI processes on the same synthetic installation. The old state had two
raw `messages` keys, two raw `files.ids`, two ledger entries, and no
`identityVersion`. Its SHA-256 is
`239d717028f9efc7d1fcfbe2d3eee38217642d6925466480c2179fe144e6d5b1`.
The [transition receipt](legacy-receipt.json) proves:

| Process | Accepted UTC totals and input/output | Entire state | Old raw IDs |
| --- | --- | --- | --- |
| Unchanged final, two source events | `15 (10/5)`, `11 (7/4)` | valid, 3029 bytes | present |
| Repaired, source deleted | same two rows, sequence 2 | valid, 1655 bytes | absent |
| Repaired, old events restored plus new event | old two plus `5 (3/2)`, sequence 3 | valid, 4293 bytes | absent |
| Repaired, reload | same three rows, sequence 4 | valid, 4293 bytes | absent |

Each row in this transition was a real CLI `/api/usage` request and fixture
acknowledgement. The receipt includes the complete seven-field usage tuples,
state byte counts and hashes, JSON-validity check, and raw-ID check. This
demonstrates preservation of already accepted usage even when the old source
is gone, deduplication when it returns, admission of a new event, and stable
reload of the marked state. It does not claim recovery of historical per-ID
data absent from the old file.

## Test compatibility and provenance

Before the repair, `claude-security.test.mjs` had two assertions that required
raw message IDs as internal object keys. Only those two representation checks
changed: they now require three/four distinct stored messages and no raw
dangerous ID as an own key. Its null-prototype checks, JSON roundtrip,
`__proto__`/`constructor`/`prototype` inputs, duplicate-conflict `partial`
result, and exact total `14` remain. Reader tests also passed, including
range/day behavior, unsupported-record retention, partial diagnostics,
first-accepted tuple, and ledger deduplication. No new test derives its
expected identity from a production helper.

The separate [other-ID variant](other-ids.patch) substituted a different
ordinary synthetic ID and different 64-hex ID in a temporary test copy.
Its [receipt](test-receipts.json) completed both controls and all three CLI
steps. A first variant preparation chose an ID not beginning with `s`, so the
test's built-in `\\u0073` JSON-escape control failed; the CLI scenario itself
still ran and passed. That attempted preparation was discarded, counted, and
the variant was corrected without changing `test-only.patch`.

| Input or output | Binding |
| --- | --- |
| VibeRacing baseline B | `2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd` |
| Unchanged full M patch SHA-256 | `225094f080a304fe598200d5c4f8252ad20af2ef2c08b5d35ab9967509f7b8b7` |
| Unchanged test-only patch SHA-256 | `d21ba45ad2bda63bac48008cbd200aed93e334e3471af94805834876ff69ea6e` |
| B + M + test-only Git tree (bytes and modes) | `2f4c06354d7a52a4c6c0eae71d85908fb729da2d` |
| [calibration.patch](calibration.patch) SHA-256 | `052a126d1184867b948cea502d55d6fd1bcd75f9f3c3e0fa2e75bdb15c80dfbc` |
| B + M + test-only + calibration Git tree | `4d17c9d0e21fc8a08eac21c5b1e2fba3f906fbc0` |

A fresh ordinary clone applied B, M, test-only, then calibration in exactly
that order. Its staged Git tree matched the working calibration tree byte for
byte and mode for mode (`4d17c9d...`). From that clone's root, the full
[portability privacy run](test-receipts.json) passed 3/3 with all three
CLI diagnostics. No harness administrative path, private archive, or prior
process state is required by the product patch or test.

## Boundaries and accounting

This is local calibration. No full `pnpm verify`, platform matrix, CI,
real provider, real server, model attempt, reviewer session, or release was
run. It does not repair other adapters, the whole 0.4.3 migration, damaged
ledgers, or exact OpenCode cutover. Exact sentinel absence does not prove
content privacy, resistance to arbitrary encodings, or irreversibility of
the digest. A manual repair establishes that this behavior is reachable and
that this test rejects one real reintroduced leak; it says nothing about
whether Luna would have discovered either one. Historical Q/T/D, 209/209,
15/23, D0/final results and expenses are unchanged.

This calibration made **34 explicit local `sync` calls**: 3 initial green,
8 across two legacy-transition checks, 3 in the failed other-ID preparation,
6 across two corrected other-ID runs, 2 mutant RED, 6 across two final
combined suites, and 6 across two independent portability copies. The second
set followed the one bounded prototype-key remediation during final review.
The first host-side full test was stopped before CLI by a
loopback `EPERM`; the pinned container then ran it. One Docker image-inspect
format attempt and one orchestration print step failed before any CLI run.
The final five-file suite took `34.67 s` of Node test time; the other reported
privacy runs took roughly `0.17–0.40 s` each inside Node. Preparation,
container startup, and agent work are separate from Luna. No paid
provider/model call occurred; monetary cost is not inferred without a bill.
