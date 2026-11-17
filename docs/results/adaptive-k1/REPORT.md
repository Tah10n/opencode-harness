# Installed Harness² fixture

The adapter ran the range-merging fixture through separate Linux containers with OpenCode 1.18.26
and the local scripted Responses provider. [Run instructions and protocol](../../../evaluation/adaptive-harness/README.md).

Adapter commit executed `5d6778907a205b8a7ceea7810491ded16f0fb574`. The [stage ledger](adaptive-k1.json)
records the SHA-256 of the initial source and task, materialized instruction trees, prompts,
captured patches and full solution snapshots. The included patches reproduce the recorded
snapshot hashes when applied to the original fixture. The ledgers record which captured
OpenCode requests contained each mission and each solver instruction file.

| Mode | Solver | Editor | Composer | Selector | Auxiliary | Total | Wall time | Independent check |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| [plain-single](plain-single.json) | 5 | 0 | 0 | 0 | 1 | 6 | 11.7 s | FAIL (deliberate fixture defect) |
| [plain-multi](plain-multi.json) | 20 | 0 | 0 | 3 | 5 | 28 | 44.9 s | FAIL (deliberate fixture defect) |
| [adaptive-k1](adaptive-k1.json) | 20 | 8 | 4 | 3 | 8 | 43 | 68.5 s | PASS |

The scripted provider reported 430 input and 215 output tokens for the adaptive run. These are
synthetic usage fields. Real model requests were **0**. The installed fixture verifies mechanics
and data flow. Model adaptation quality was **NOT RUN**.

Both editors read the base rollout and its patch. The general candidate left a validation
regression and the domain candidate left the default adjacency regression. The composer read
both observed results, their distinct harnesses and their patches. The final solver used the
composed instructions, and all six public tests passed. The selector chose the existing R-final
artifact by ID and SHA-256. The journal records selection before the independent acceptance
check. That check used the complete selected tree, including the author test, with a separate
administrative mount.

The two multi-run modes used the same 600-second and 120-request ceilings and the same frozen
role allocations. Their selection pools contained four and two artifacts, respectively.

| Installed control | Observed result |
| --- | --- |
| [forbidden](forbidden.json) | Forbidden configuration rejected before materialization. Upstream bounded retry and explicit H0 fallback. |
| [symlink](symlink.json) | A symlink was rejected without following it into the read-only input. Explicit H0 fallback. |
| [outside](outside.json) | Change to public task evidence rejected. Explicit H0 fallback. |
| [empty](empty.json) | Empty proposal rejected. Explicit H0 fallback. |
| [selection](selection.json) | Nonexistent ID refused. No delivered snapshot or independent assessment. |
| [tamper](tamper.json) | Post-validation byte change refused before starting the candidate container. |
| [unknown](unknown.json) | Stream without terminal completion closed admission after R0 began. |
| [process](process.json) | Interrupted OpenCode process closed admission after R0 began. |
| [recording](recording.json) | Corrupted recorder evidence closed admission. Workload termination and container removal were verified. |
| [request-budget](request-budget.json) | Eight requests consumed across roles. The next request was refused before forwarding. |
| [editor-time](editor-time.json) | Overall deadline reached during an editor response. No candidate solver started. |
| [composer-time](composer-time.json) | Overall deadline reached during a composer response. No final solver started. |
| [injection](injection.json) | Text reached the solver while mounted configuration stayed read-only and protected paths stayed absent. |

The [machine-readable index](index.json) includes every installed scenario. The policy check
also exercised path traversal, size and type validation and refusal of a launch without
the explicit scripted flag.
