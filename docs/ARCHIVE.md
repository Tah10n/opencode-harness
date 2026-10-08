# Archive and migration

For current installation and upgrades use [native usage](USAGE.md). The supported
base output is exactly `core.md` and `opencode.json`; task/review are opt-ins.
Legacy `core`, `deep`, `assurance`, `lab`, quality and verified-change launchers
below are historical components, not alternatives to `--native --profile core`.

Consolidation uses [PR #25](https://github.com/Tah10n/opencode-harness/pull/25).
The historical native task head is `030b4ee2b5df7af050ef49bb58098b096ef486d6`;
it already contains PR #24 head `1e54e21018e340191e69a8f9427ccf8e3330bfcd`,
including native review snapshot/path fixes. No discarded branch is merged just
to manufacture ancestry. Release tags and existing history remain unchanged.

## Retired components

Legacy profile-v1/v2/v3 materializers, quality/feedback/assurance runtime,
verified-change runtime, custom synthetic/vNext/v3 benchmark campaigns,
research/ops launchers, copied project trees, intermediate receipts and historical
documentation are removed from the active tree. Their results, including failures,
remain in [RESULTS](RESULTS.md). Kimi/VibeRacing/ledger work is closed historical
development, not the official benchmark.

Package exports `./feedback`, `./quality`, `./quality-plugin`, `./trace-store`
and old package scripts are discontinued. Use `./native-template` or the native
materializer CLI. Historical artifact readers remain recoverable at their source
commits; the maintained PolyBench and feedback-development result readers preserve
their existing unknown and missing-capture semantics. Exported legacy review and
format helpers in the installed native workflow module remain available for
compatibility; absence from the current D path alone does not authorize removal.

Legacy quality containment/platform tests, v3 authority/oracle tests and report
existence checks are retired with their implementations. Native permission,
checkout/index, cancellation, snapshot, patch and generated-expectation tests
remain. Shared scheduler, provider recorder, native deadline worker, container
relay/stop, private output capture and manifest helpers moved once from
`development/` into `evaluation/support/`. PolyBench helpers moved to
`evaluation/polybench/`; the small offline config moved to `fixtures/native-offline/`.
Their origin is the historical native head above. No prompt mechanism is promoted
on the strength of consolidation.

## Original remote refs and decisions

Unique counts are commits absent from the original #25 head, not a claim that
newest-by-date contains every branch. Exact full diffs, local refs, PR metadata,
comments and uncommitted state are in the private backup.

| Branch | Original head | Open PR | Unique commits | Decision |
| --- | --- | --- | ---: | --- |
| `cleanup/v0.5-foundation` | `69b15a4c559d926e0a682ac21ec4d2a2c44d71f2` | — | 23 | archived; legacy implementation/research retired |
| `feat/native-task-workflow` | `030b4ee2b5df7af050ef49bb58098b096ef486d6` | #25 | 0 | integration via #25 |
| `feat/native-template-regression-workflow` | `1e54e21018e340191e69a8f9427ccf8e3330bfcd` | #24 | 0 | already in #25 ancestry |
| `feat/verified-change-harness` | `dc06851816c384c6515b519d99c28960222bc93f` | #23 | 12 | archived; legacy implementation/research retired |
| `fix/benchmark-v3-issuer-isolation` | `3eaaf712206a1900b32a2612b95c1d0c72c45064` | — | 0 | already in #25 ancestry |
| `fix/benchmark-v3-one-shot-safety` | `5fb26a7e763207fa90fe705f5372fcd4d5f6a0d6` | — | 0 | already in #25 ancestry |
| `fix/benchmark-v3-terminal-evidence` | `76f3ec5b6670795485e8c9c18aa7f34903993516` | — | 0 | already in #25 ancestry |
| `fix/v0.4-benchmark-and-complete-study` | `4033780cca4d2e39a9990c807dcb2bd7a40b6608` | #10 | 2 | archived; legacy implementation/research retired |
| `goal/v0.5-evidence-backed-harness` | `522da8006103dbeeacfcda618b4de3c4b3e8006a` | — | 73 | archived; legacy implementation/research retired |
| `lab/benchmark-v3-design` | `b027ee23417733729e20d8b76aa5e65f3775cc33` | — | 9 | archived; legacy implementation/research retired |
| `lab/benchmark-v3-executable` | `ad7e2a8ede3b54a22a7b582f8be7e4886622f8f6` | — | 58 | archived; legacy implementation/research retired |
| `main` | `89f1f7f1980a829d7da162fcd737d0c52613225d` | — | 0 | base retained |
| `ops/benchmark-v3-campaign-bootstrap` | `4707a2c0035ca08ee249c65c7cdb867d74c60a5f` | — | 26 | archived; legacy implementation/research retired |
| `ops/benchmark-v3-contained-oracle` | `2b6fcd23595c9c0db9d809f8ee258a7515b8b26b` | — | 4 | archived; legacy implementation/research retired |
| `ops/benchmark-v3-oauth-broker` | `03f79fb46a4a976693b0a525f9d18e0d8f2f4788` | — | 4 | archived; legacy implementation/research retired |
| `ops/benchmark-v3-oauth-epoch-rotation` | `694899388814aa2ba2f8fe56f8fbb3870efe0087` | — | 1 | archived; legacy implementation/research retired |
| `ops/benchmark-v3-readiness-cleanup` | `fe3274da7d4960938fcd287da90ca3d96b2c08d0` | — | 2 | archived; legacy implementation/research retired |
| `research/core-public-ab-measurement-v1` | `3c2d51b9e6d000b0a4aec49e158b18af7eb181af` | — | 30 | archived; legacy implementation/research retired |
| `research/v0.4-model-backed-evidence` | `f2980c6a76ce68fe96c9a5fcdcd8ff938fcbe5f8` | — | 3 | archived; legacy implementation/research retired |
| `research/v0.5-p0-p52-archive` | `a3aeec427afdc073fd70a8fccb27fd274b81b724` | — | 127 | archived; legacy implementation/research retired |
| `simplify/core-lite-evidence` | `e123a1db10749d82ef922e1543d8d9cbedca4ef3` | #22 | 11 | archived; legacy implementation/research retired |

PR #24 is integrated through #25 ancestry. PR #23, #22 and #10 are superseded or
archived research, not promoted merged functionality. Useful native review/task
fixes and common execution/accounting components remain; legacy-only fixes stay
with their retired runtime. Local unpublished verified-change changes are backed
up separately and must not be represented as merged native changes.

## Restore

The owner's private archive is outside the repository, named
`opencode-harness-archives/consolidation-20260929`. It contains `repository.bundle`,
`refs-before.txt`, original GitHub metadata, per-worktree staged/unstaged patches,
untracked files and ignored evidence. It is not a public download. Credentials
and raw private receipts must never be committed or uploaded to a public PR.
The exact local path, checksum and restoration verification are in the delivery
report; `restore-verification.json` records resolved refs and recovered dirty files.

```sh
ARCHIVE=/absolute/path/to/consolidation-20260929
git bundle verify "$ARCHIVE/repository.bundle"
git clone "$ARCHIVE/repository.bundle" restored-harness
cd restored-harness
git switch -c recovered-work ORIGINAL_FULL_SHA
```

For uncommitted state, choose its numbered `worktrees/` entry using `source.json`,
check out that recorded HEAD, apply `staged.patch` with `git apply --index`, then
`unstaged.patch` with `git apply`, and copy the separately saved untracked files.
Ignored evidence is deduplicated in `ignored-content.tar`, with hashed chunks
and per-worktree manifests. The archive includes `restore-ignored.py` and a
verified sample restoration receipt. Bundle alone never preserves this evidence.
One inaccessible receipt owned by a different OS account in the candidate-recovery worktree could not
be archived; its original worktree must remain until it can be read and verified.
Dependency caches are reproducible and omitted. Restoration checks do not
claim to back up private external archives or Git LFS payloads automatically.

Historic links use immutable SHA URLs, not deleted branch names. Deleting files
and branches reduces the checkout; it does not shrink Git history.
