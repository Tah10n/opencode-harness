# Supplementary reference compatibility repair

The user requested a fix after the original admission failure. This is a local
patch to a separate copy of reference 9e389a6dbc1b0c9813599fb61eceb6958d8c4de4,
not M, not a historical reference replacement, and not a VibeRacing publication.
Neither the author baseline nor author prompt receives it.

The collector now uses the ID aliases and normalized date already validated by
its public parser. This admits `id + timestamp`, `session_id + date`, and the
parser's `time` / nested `result.usage` forms without changing tuple validation.
Canonical capture events and their aliases keep the same hashed identity.

Old checkpoints can record EOF while omitting supported events. A separate input
revision marker causes one rescan of those files, retaining ledger tuples and
legacy baselines/indexes. The ledger/parser schema version stays unchanged so
existing accepted tuples retain conflict detection. New accepted state includes
the marker; subsequent reads retain ordinary incremental behavior. Files no
longer present cannot reconstruct usage that the old bug never recorded.

Verification in pinned Node v24.19.0:

- The six new regression tests yield 2 pass / 4 fail on unmodified reference:
  canonical input and malformed-ID rejection pass; three old shapes and recovery
  from a pre-fix serialized checkpoint fail as expected.
- Corrected copy passes 143/143 checks: six new regressions, reference reader and
  protocol suites, unchanged SQLite/five-adapter/legacy-input probes and the
  Kimi migration check. Coverage includes JSON reload, alias replay, first-tuple
  conflict preservation, truncation, privacy, migration and bounded-ledger tests.
- Full patch applies to a fresh archive in ordinary Git; both changed/new files
  exactly match the tested copy. Source review and diff whitespace check pass.
- `corepack pnpm verify` was attempted in an independent writable copy, but
  pnpm 11.7.0 is not cached and network is disabled. The full gate is unavailable,
  not passing. Existing reference config-suite dependency gaps are unchanged;
  config suite was not rerun for this adapter-only repair.

The first pre-fix test invocation had a Docker mountpoint error before Node ran
(exit 125). It remains recorded as infrastructure error. The successful
reproduction uses a separate complete copy with the regression test added; no
mount/owner/noexec checks were weakened. Full raw outputs stay local; hashes,
counts and process statuses are in reference-compatibility-receipts.json.

This repair resolves the concrete compatibility failure only. It neither
establishes complete account-switch-ledger acceptance nor proves Luna quality.
No provider call, harness mechanism, collector/transport change, dependency
upgrade, public VibeRacing change or model task-run was performed.
