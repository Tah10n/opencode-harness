# Four-slot command-hint delivery comparison

This is a small, intentionally selected development comparison on fixed product
candidate `c90fc7c78bcdd4d8288550b887f52990bafb11a6`, not a new corpus, general
harness-vs-plain result, or confirmatory quality estimate.

## Permission amendment and environment

After the published `deny` eligibility failure, the user explicitly authorized
identical `external_directory: allow` for both arms in isolated containers. This
is a declared condition of this new batch, not a product permission default and
not a runtime fix. The earlier deny failure and its zero-request ledger remain
in README/RESULTS.json. No old slot or pause is resumed.

Each author container mounts only its own public source/dependencies, a frozen
native bundle with prepared plugin dependencies, the existing relay file, and
OpenCode 1.18.26. No host home, OAuth file, reference, evaluator, sibling attempt,
project Git history or complete harness repository is mounted. Evaluators are
mounted/copied only into separate developer containers that never call a model.
The author filesystem has private writable tmpfs; host mounts are read-only,
network is disabled, privilege/capability limits and process stopping are kept.
Only the existing host transport uses configured OAuth for the exact authorized
`https://chatgpt.com/backend-api/codex/responses` endpoint.

The native runtime files and core instructions are materialized from a separate
`git archive` projection of the exact candidate's `lib` and `profiles` trees.
Container-local config paths are relocated to `/template`, as in the existing
launcher. Source/model/dependency integrity is checked before each actual slot.
Model and small_model are both `openai/gpt-5.6-luna`, effort high. No user-global
configuration enters the isolated HOME/XDG directories. Direct, one author,
1800 seconds for the complete task, all other optional components explicitly 0.
The only arm-dependent setting is `HARNESS_TASK_COMMAND_HINTS=0/1`.

## Tasks, acceptance and fixed order

| Slot | Task | Arm |
|---|---|---|
| 1 | A — UFO withoutQuery | OFF |
| 2 | A — UFO withoutQuery | ON |
| 3 | B — EventEmitter3 subscribe | ON |
| 4 | B — EventEmitter3 subscribe | OFF |

A uses unjs/ufo at `f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6`, with
its saved installed dependency tree. The normal delivery worktree has no local
installed `.bin`; dependencies remain in the original ancestor project. Bare
pnpm is absent from the unchanged launcher PATH. This case is selected to
exercise the existing mechanism, not randomly sampled. No binary was removed.

B uses primus/eventemitter3 at `b0144e940ace8add8f335a8adfbed9284eb419f3`
with its prepared dependencies. Its normal `npm test` works in the same nested
layout. Each slot starts a fresh independent container and project copy.
The same immutable task source is copied afresh within each pair.

[Task A](tasks/A.md) and [task B](tasks/B.md) are the complete prompts. They do
not tell the model to trigger or use command hints. No historical author patch
or preparatory route is included. A bounded search of saved TASK.md files found
neither new API; this does not establish independence from all model history.

Acceptance, fixed before real requests:

- **A semantics:** complete/selective removal, first query before fragment,
  existing query-key decoding, duplicates/empty/special keys, raw retained bytes
  and empty-field joining, no-op preservation and array nonmutation. Public
  exports, generated declarations, old query consumers and CJS/ESM builds work.
- **B semantics:** exact-registration cancellation, duplicate function/context
  independence, no deletion of later replacements, idempotency, cleanup, symbols,
  argument/context compatibility, invalid registration atomicity, dispatch and
  recursive self-cancellation behavior. CommonJS/ESM and generic types work.
- **Both delivery rubrics:** implementation plus project regression coverage for
  the categories explicitly requested, meaningful applicable consumer type
  coverage and documentation; no weakened old assertions or unrelated changes.
  No exact test filename, implementation strategy or Error subtype is required.
- **Checks:** A ordinary test script (lint, format, runtime and type checking),
  build and independent behavior/types/package consumers. B npm test, test-esm,
  rollup and independent CJS/ESM behavior plus generic TypeScript consumer checks.
  A passing ESLint alone is insufficient. The evaluator runs patches unchanged
  in an ordinary project copy. Its checks are never credited to the author.
- **Q:** full correct portable patch, satisfying semantics and delivery rubric.
  **T:** normal autonomous native delivery plus verified termination. **D=Q&T**.
  Internal incomplete, recovered patch, and unknown/not_started stay separate.

The small task-specific evaluation files derive their cases from these public
contracts. Reference source is generated outside author inputs; incorrect
variants retain substantial implementation but lose decoded-key matching (A)
or remove duplicate listeners broadly (B). Correct references must pass;
incorrect variants and unchanged baselines must fail behavior acceptance.
Reference lint/type preparation errors are corrected before freeze and retained
in local preparation logs. No evaluator is treated as an infallible specification.

## Preflight and execution

The existing materializer, integrated container/native runner and comparison
scheduler are reused. Launcher changes only admit this four-slot configuration
and inject the OFF/ON flag. No transport, retry or product-runtime policy changes.
Four offline scripted preparation sessions verify the actual full prompt,
identical tool lists, Luna/high request fields, explicit flags, delivery cwd,
original commands, ON partial ancestor hint receipt/route execution, independent
full suite availability, checkout preservation, native termination and portable
patch application. They are not task outcomes or evidence of Luna's choices.

No real availability probe or smoke. At most four real task-runs, in the fixed
order above; no replacement, extra author, intervention or automatic continuation.
The existing fail-closed admission policy stops all later requests/slots on its
specified failures. Capture partial output and patches, verify local stopping,
retain unknown usage and leave later slots not_started. A semantic failure alone
continues the remaining assigned slots. No thresholds change after outcomes.

Grade anonymous patch IDs before reading explanatory author traces where
possible. Then inspect actual missing command, hint receipt/use, independently
chosen routes, checks/fixes after final changes, dependency preservation and
final-answer accuracy. A partial route remains partial; chronology is not causal
proof. Count every forwarded HTTP request including auxiliary/title traffic;
report known inclusive tokens, cached/reasoning subsets, unknown usage, native
tools, wall time and emitted hint costs separately. Developer/calibration/scripted
work is separate and no fabricated dollar cost is reported.

The product decision follows the user's original rule: only an extra A delivery,
observed useful hint chain and no B regression support a small positive signal
for separately authorized transfer. Ties/no receipt/no use/loss do not justify a
new campaign. Defaults remain unchanged. Historical aggregate containment limits
remain distinct from this container path; no full verifier or platform matrix
is substituted for the measured result.
