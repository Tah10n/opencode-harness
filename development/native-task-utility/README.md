# Native task utility development

The recovery baseline `cac39a0050189f2ddf01d4b88888494457b578a7` does not show the requested advantage: **P 6/6, H 2/6 complete patches; H wins 0, losses 4, ties 2**. All six H workflows report incomplete; five supply a terminal patch, while one reaches its managed deadline. Patch quality and autonomous completion are separate. The product remains experimental.

| Task | P final | H D0 | H final | H delivery issue |
| --- | --- | --- | --- | --- |
| protocol-error-api | pass | pass | pass | Workflow retains check/diagnostic failures |
| catalog-cache | pass | fail | fail | Legacy one-argument 304 changes return/error semantics |
| legacy-runtime-reload | pass | fail | fail | Old executable copied into current runtime; final is observer capture after timeout |
| reconnect-revoked | pass | fail | fail | Pending payloads survive revoked cleanup |
| request-module-extraction | pass | pass | pass | Workflow cannot establish final supported check evidence |
| dual-config | pass | fail | fail | Missing required negative tests through real consumers of both formats |

See [all v1 outcomes, patch links/hashes and resource counters](results-v1.json), [patches](patches/v1/), [fixed tasks/order](plan.json), [method](METHOD.md), and the [one permitted revision rationale](REVISION.md). No independent pairs have been run: the development gate fails. V2 will be a fresh six-pair development comparison, not a replacement or independent confirmation.

V1 totals: P 164 provider requests / 314 native tool calls / 2,372.20 seconds; H 257 requests / 392 tool calls / 3,325.14 seconds. This is 56.7% more requests and 40.2% more elapsed time. Observed input/output tokens: P 11,306,475 / 95,767; H at least 21,567,840 / 126,443. One H request at timeout has missing usage, retained as unknown. Equal 900-second deadlines were not equal token budgets.

The frozen executable evaluator passed five H tasks, but full independent assessment accepted only two. Post-run checks exposed two uncovered contract boundaries: legacy preparation from the preserved old launcher, and legacy catalog 304. The old-launcher check also rejects the calibration reference and alternative, showing a real evaluator coverage gap. Original raw grades remain unchanged; the same interpretation/checks apply to both arms and H D0/final without model retries. The dual-config gap concerns expressly required delivered tests, not a proven runtime failure. Ambiguous combined-invalid error precedence is not scored.

All eighteen endpoints (twelve finals and six H D0s) apply to separate ordinary copies with no harness administrative dependency. Six original H source trees and every frozen file remain unchanged. Four tasks use public VibeRacing snapshots and two are small known fixtures; this does not establish general performance. Scoped Linux/Node checks do not establish the full platform/web/pnpm matrix. Known `verify-native-task-format.mjs` baseline failure is retained separately. No full-suite-green claim, manual Actions, release or merge.

[Install and run from checkout, then apply a terminal patch](../../docs/native-task/README.md#install-and-use). Raw logs, native sessions, evaluator/reference trees and complete source copies remain in ignored `local/native-task-utility-20260911/`. One state reviewer performed a bounded memory search before packet review; it exposed no arm mapping/outcomes/reference. Findings were independently verified.
