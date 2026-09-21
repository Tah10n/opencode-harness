# Native output retention verification

Development-only collector/lifecycle fix, verified locally on OpenCode 1.18.26
in the existing network-isolated Linux/Docker image. Product runtime `lib/`,
nudge, prompts, permissions, model settings, evaluator, scoring and historical
freezes/results are unchanged. The historical six missing files remain lost.

## Result

The original collector at `dd2dc79fc149a6800963b4e847da44adbb862aa7` failed to
export a genuine native Bash spill file (353,899 bytes), despite a truncated
receipt and a structured `metadata.outputPath`. The reproduction uses that
original collector source from Git, not a fabricated receipt or evaluator log.

The final installed success fixture (`success-1789981234693`) ran the actual
shared `runComparison` → collector → `session.close()` path. Three isolated
plain sessions read a small project, apply an ordinary patch, execute native Bash,
and finish. Long output and long output with exit 7 each exported one 353,899-byte
file; short output correctly exported zero. Total: **2 files / 707,798 bytes**.
Output export times were **133 ms / 71 ms / 132 ms** for long / short / nonzero.

After container deletion, exported bytes matched both the source size/SHA-256
and the deterministic full expected output. SHA-256 for the long file:
`20f0acd6e38c39f3a94b84afdd9a19b2621aa2b7b585a15340051f9d8674dfb1`.
The initial, hidden middle and final markers survived. The hidden middle was
absent from the native receipt and actual next request. Recorded provider bodies
matched the received scripted requests. Native event receipts matched database
receipts. Source checkout/index stayed unchanged by collection; the patch applied
and its test ran in a clean Git copy, with executable mode preserved.

## Failure controls

| Control | Observed result |
| --- | --- |
| Copy/disk boundary failure | Evidence incomplete; sole tmpfs source retained; next slot not started |
| Corrupted copy | Size/hash mismatch; no completion claim; source retained |
| File-byte limit | Explicit incomplete export; source retained |
| Git patch failure | Native output still exported; original patch error visible; source retained |
| Native accounting failure | Available output exported unlinked; accounting remains the primary error; source retained |
| Hard deadline during real Bash output | Workload killed and verified; available records retained; no new author request; no claim of completed command output |
| Missing/invalid metadata reference | Missing/rejected status; other eligible bytes still exported |
| Symlink, hardlink, FIFO, traversal, printed foreign path, symlink root component | No foreign bytes exported; sentinel unchanged |
| Repeat references/copy, unlinked output, independent runs | Links retained without invented identities; verified bytes unchanged; no cross-run mixing |
| Recovery | Same container ID, trusted relay PID, original baseline and existing files; no task rerun or new provider request; then targeted deletion |

Socket/device refusal follows the same ordinary-file predicate; no privileged
mknod control was run. General source completeness is conservatively unknown,
independently of verified complete file copying. The deadline fixture had no
completed spill file; its in-progress native records were preserved, not replaced
with synthetic full output.

## Attempts, resources and validation boundaries

[Safe test receipts](test-receipts.json) enumerate **all 34 fixture attempts and
42 container names**, including unsuccessful development attempts. Installed
fixtures issued **213 local scripted requests**; request counts are known for all
attempts. Separate in-memory scheduler controls made **28 scripted fetch calls**
across four invocations; integrated continuation controls made **2** across two
invocations. These are not Luna usage or independent model solutions.
Real research provider calls, availability probes, Luna task-runs, benchmarks,
OFF/ON repetitions and paid reviewers: **0**.

Four fixture attempts failed during development: one omitted the scheduler's
required scripted reasoning effort (five locally refused requests, zero scripted
provider responses), and three exposed a relay-SIGSTOP observation race. Those
three took the explicit safety fallback and removed their fixture sources;
possible data loss was recorded. A bounded process-state confirmation fixed the
race; affected controls and the full suite then passed. One initial recovery
attempt refused before copying because its process inspection also matched init;
final recovery uses the recorded trusted relay PID and succeeded.

There were **17 successful recoveries**, all copying already-existing bytes,
with **0 new provider requests**. Final read-only Docker inventory confirmed
**all 42 fixture containers absent, 0 retained at completion**. Unrelated
containers were left untouched. Raw synthetic receipts/streams and temporary
project copies remain private under ignored `local/native-output-retention/`;
only this summary and sanitized structured receipts are published.

Validation after the relevant changes:

- Full `node development/native-output-retention/verify.mjs`: passed.
- Final success plus metadata/patch failure and recovery after diff-review fixes:
  passed; success used the shared completion/capture/cleanup path.
- Shared scheduler and both continuation suites: passed.
- Syntax for 10 affected/new modules and Git whitespace: passed.
- One final diff review and bounded remediation: retained recovery now requires
  recorded PID/baseline; a secondary capture exception preserves the native
  accounting error.

This is local installed technical evidence, not CI, model-quality evidence,
trusted checks or proof of an arbitrary task's completion. No complete platform
matrix was run. Automatic PR checks remain enabled; their remote status is
reported separately when publishing.
