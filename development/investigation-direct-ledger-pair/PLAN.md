# Direct investigator pair: frozen development plan

This is one known public VibeRacing task, not a held-out benchmark or a claim
about general model quality. The fixed runtime candidate is
`1b8c7acbbe59db26462ae0818588274ae67ac683`. Its investigator snapshot
copier has a model-free full-baseline check (258 exact files, bytes and modes)
and an installed scripted author → child → test → accept → terminal patch →
ordinary Git application check. The final installed check made 17 scripted
requests and zero real provider requests. A preliminary container check failed
because its materialized plugin URL pointed to a host path; the local bundle
was corrected before the passing installed check. No real availability probe
or smoke is part of this series.
The pinned offline container ran the three baseline connector commands from the
full copied child cwd: readers 86/86, config 103/103, protocol 14/14.

## Frozen inputs and execution

- Source is the complete public VibeRacing commit
  `2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd`, extracted independently
  for I0 and I1 from the checked `baseline.tar`. Each copy gets fresh local Git
  with one baseline commit, no remote, old objects, sibling project, evaluator,
  calibration patch or history. The task is the exact `original-task.txt` bytes
  followed by the exact `environment.txt` bytes from
  `development/plain-ledger-native-high/`. Public baseline tests/docs are the
  same in both copies. Neither receives a privacy-test or a repaired old test.
- OpenCode 1.18.26, Node 24.19.0, Git 2.39.5, pinned image
  `sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`,
  `openai/gpt-5.6-luna`, high, native `direct` and one 3,600-second whole-task
  deadline per slot. Process isolation, source dependencies, native tools,
  recorder, collector, stop and output recovery use the existing launcher.
  Network is disabled in the model container; the existing authorized relay
  alone uses `https://chatgpt.com/backend-api/codex/responses`. Webfetch and
  external directories are denied.
- All `HARNESS_TASK_{CONTEXT,CHECKS,TYPE_COMPAT,SENSITIVITY,COMMAND_HINTS,
  PRESERVATION_NUDGE,EXTRA_ATTENTION}` flags are `0`. I0 sets
  `HARNESS_TASK_INVESTIGATION=0`; I1 sets it to `1`. The latter alone gets the
  existing instruction and tool schema. No other author tool is removed.
  I0 runs first, then I1. There is one attempt per arm, no retry,
  continuation, replacement, separate reviewer, or extra author turn.
  I1 may start at most one investigator child, under the same deadline. The
  author chooses whether and what to ask, and whether to accept its test.
- `freeze.json` in the ignored local batch binds both source inventories,
  installed bundle inventory, launcher and acceptance file hashes. The small
  committed `manifest.json` binds the freeze, task/environment, preflight and
  two not-started slots. Freeze and its commit precede the first real request.
  Runtime bytes remain unchanged throughout I0/I1. A stop for unknown
  submission, auth/quota, evidence or local termination leaves the next slot
  `not_started`; it is never silently retried.

## Predeclared independent assessment

After both author runs, apply each entire captured terminal patch, including
new files/deletions/modes, unchanged to a separate clean ordinary Git copy of
the baseline. Record `delivery_apply` and compare actual files/modes with the
captured delivery worktree. No harness path or dependency may be required by
the patch. F runs the three requested Node test commands individually:
`readers.test.mjs`, `config.test.mjs`, `protocol.test.mjs`. Attempt the project
`corepack pnpm verify` gate with the frozen offline dependencies; an unavailable
gate is reported unavailable. Existing old assertions are not changed before
the runs, and every failure is retained. A superseded truncation assertion or
an internal representation assertion is interpreted against the original
public contract, never silently dropped.

E uses a separate copy with the same implementation bytes and the six frozen
`development/plain-ledger-native-high` probes:
`account-switch-ledger`, `ledger-lifecycle`, `legacy-input`, `kimi-migration`,
`migration-contract`, `cli-persistence`. These contain 23 behavioral cases.
Use their actual CLI imports, real collectors and state writes; verify every
module executed, report skips and evaluator errors distinctly, and compare
F/E trees before and after. The prior calibration/reference is not an oracle
for field names, numeric limits or internal state architecture.

In another assessment copy, place the **unchanged bytes** of the published
`claude-persisted-privacy.test.mjs` from
`development/ledger-review-delivery/persisted-privacy-check/test-only.patch`
under the predeclared separate project name
`packages/connector/test/ledger-eval-claude-privacy-9a98.test.mjs`. The file is
in the same directory as its original CLI import target. Verify its SHA-256
`a98a4dc6027c46282f350d09a0cb80266b5bacbdfc7b417839ee342a62da31d5`
and never overwrite an author test with the same path. Run it only after both
author stops. Its setup controls must run; a red result matters only if the
real nonzero sync/state path executed. The saved `calibration.patch` is not
applied to either candidate. Its old GREEN proves only that the fixed check
has a reachable positive result.

The saved real `legacy-state.json` is an additional compatibility input only
where its experimental internal format is applicable. Any check of it must
observe actual CLI totals through deletion, reappearance, a new event and
reload, including nonduplication and privacy. Do not require `identityVersion`,
prefixed hashes or the calibration layout. If the candidate uses another
valid representation, classify that particular saved-state probe as not
applicable and rely on the frozen 0.4.3 migration probes for required legacy
behavior. A malformed setup or unavailable import is `error/unknown`, never
passing evidence or an automatic product defect.

Review every adapter and consumer against the complete original task: Claude,
OpenCode SQLite, Gemini, Antigravity, Qwen, Kimi current and old input;
account/source boundaries, first tuple on conflict, unrelated new events,
copy/move/truncation/deletion, range filtering, daily components, persisted
state and upload privacy, exact OpenCode cutover, corruption/partial
diagnostics, bounded scans/storage, config/CLI propagation and public parser
compatibility. Diagnostic code spelling is not itself decisive; a real consumer
losing diagnostics is. Do not count a child test or privacy-only fix as full
delivery. Source review and observed probes both inform `contract_results`.

For each arm record `delivery_apply`, `F_checks`, `assessment_integrity`,
`contract_results`, Q (full task), T (ordinary terminal response and verified
stop), and D = Q ∧ T. Known contract failure gives Q=false. Missing or faulty
assessment is unknown/error, with an internal incomplete direct result kept
separately. A normal stop alone does not prove Q. The I1 chain binds the
author-selected question, delegation snapshot, actual child input and work,
returned receipt, accept/decline basis, later edits and final patch. Check the
test against the original task, a nonvacuous public path, actual failure,
coverage preservation and inclusion in the final patch. Work already written
before delegation is not attributed to the child.

Retain native outputs, actual request bodies and raw responses privately;
summary receipts distinguish full files from short tool replies and subsequent
request context. Count parent/title, author and child requests separately,
known input/output, cached/reasoning subsets and unknown usage. Preparation,
copy, model time and evaluation are separate. No monetary estimate without a
reliable bill. One pair gives at most a limited development signal and does not
justify a default-on change or a general causal claim. Final publication is
one ordinary push to existing Draft PR #25 after local assessment; no merge,
release, force push, Actions trigger or production VibeRacing write.
