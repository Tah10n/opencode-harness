# Public issue context (experimental)

This opt-in preparation step appends attributable public comments from **one
explicit GitHub issue** to an already prepared author task. It implements
candidate B from the [Serverless diagnosis](../polybench/diagnostics/serverless-8159/README.md).
It is not a summarizer, a specification oracle, or evidence of model quality.
The supported two-file native installation and all product defaults are unchanged.

Start with the existing `TASK.md`, including its environment facts. Create
reviewed metadata, supplying the SHA-256 of those exact original bytes:

```json
{
  "repository": "owner/repo",
  "issue": 123,
  "task_sha256": "64 lowercase hexadecimal characters",
  "cutoff": {
    "at": "2020-02-01T00:00:00Z",
    "first_solution_commit_at": "2020-02-01T00:00:00Z",
    "verified": true,
    "basis": "Source and verification of first solution commit metadata"
  }
}
```

The dates above illustrate the schema; they are not benchmark evidence. The
operator must verify the metadata independently. `verified: true` records that
attestation; software cannot establish its truth. `at` must be no later than the
first solution commit, following the [SWE-PolyBench hints boundary](https://huggingface.co/datasets/AmazonScience/SWE-PolyBench). Missing evidence blocks preparation; a PR opening date
is never substituted. The collector never accesses solution code or PRs to
resolve the boundary. Use canonical UTC timestamps with second precision.

From the repository root (Node 24+, existing authenticated GitHub CLI):

```sh
node evaluation/public-context/prepare.mjs \
  --task /absolute/input/TASK.md --metadata /absolute/input/metadata.json \
  --fetch-public --out /absolute/new-public-context
```

Network access requires `--fetch-public`. The only reads are repository public
visibility, the explicit issue, its comment pages, and an issue recheck. `gh api`
uses the existing authorization; the tool does not discover tokens. It follows
no discussion links, downloads no attachments, and reads no solution PR/diff,
gold patch, hidden tests, or `hints_text`. A GitHub issue-shaped PR is rejected: the [Issues API also serves pull requests](https://docs.github.com/en/rest/issues/comments).
Public visibility and repository/issue/comment identities are checked before
any participant artifact is written.

The absent output directory is created exclusively; its parent must exist.
Never choose a campaign/frozen directory as the destination. Existing files,
directories and symlinks are refused. Outputs are:

- `TASK.md`: unchanged original bytes, then a clearly separated indented JSON
  discussion block with a warning that comments are untrusted, fallible proposals.
- `context.json`: task/source/cutoff binding and eligible comments with author,
  source URLs, exact text, timestamps and body hash.
- `snapshot.json`: bounded API response bodies, source endpoints, pagination
  headers and hashes, including rejected text. **Administrative audit only.**
- `audit.json`: every excluded comment ID and its concrete exclusion reason.
- `receipt.json`: status (`complete` or honest `empty`), counts, parameters,
  output/context/snapshot hashes and public API invocation count.

Only give `TASK.md` to participants. Keep snapshot, audit and metadata outside
participant checkouts and tool-readable mounts; they may contain late text.
The script does not configure a sandbox or grant file permissions to a model.
Failure exits nonzero and writes `failure.json` with `blocked`, reason and the
number of attempted API invocations. It never falls back to a successful
unaugmented task. Interrupted/partial outputs without a success receipt are
unusable; choose a fresh output directory on a deliberate retry.

## Offline replay and disabled mode

Pin the snapshot hash from the successful receipt in trusted experiment
metadata, **not** by recomputing it from an untrusted incoming snapshot:

```sh
node evaluation/public-context/prepare.mjs \
  --task /absolute/input/TASK.md --metadata /absolute/input/metadata.json \
  --snapshot /absolute/new-public-context/snapshot.json \
  --snapshot-sha256 PINNED_SHA256 --out /absolute/new-offline-replay

node evaluation/public-context/prepare.mjs \
  --task /absolute/input/TASK.md --disabled --out /absolute/new-disabled-copy
```

Replay performs no network operation. It validates saved bytes, all source
identities, pagination and the task/cutoff binding again, then deterministically
rebuilds the same task/context bytes. Metadata property order is part of the
snapshot binding in v1; keep the original metadata file. Disabled mode copies
arbitrary original bytes exactly and makes zero API calls. Importing modules and
automated tests do not contact GitHub. This step does not run an author or grant
permission for a model request.

## Admission and bounds

A comment is admitted only when `created_at <= updated_at < cutoff`. Missing,
invalid or contradictory dates, comments at/after cutoff and earlier comments
edited at/after cutoff are excluded with distinct reasons. We cannot reconstruct
an earlier revision of an edited comment. Eligible comments are ordered by
creation time and then numeric ID; alternatives, contradictions and withdrawals
are all retained, with no ranking or chosen interface.

Fixed bounds, chosen before the Serverless demonstration: 5 pages of at most
100 comments, 2 MiB per API response, 32 KiB per comment, 64 KiB for the entire
rendered discussion block, 1 MiB for the original task, 15 seconds per API call.
A full eligible discussion exceeding its bound blocks; no convenient prefix is
selected. Duplicate IDs, incomplete counts, malformed/misdirected pagination,
changed issue metadata, API failures and rate limits block the whole result.
Pagination accepts the named `/repos/owner/repo/issues/number/comments` route
and `/repositories/id/issues/number/comments` for the same verified public
repository. The ID must be a positive safe integer from that repository response.
Only `page` and `per_page` are accepted, once each, in either order; targets,
values and consecutive pages remain bounded. Requests still use the named route,
and original `Link` headers are preserved for the same checks during offline replay.
There are no automatic retries. Pagination checks detect observed inconsistency;
GitHub provides no atomic historical snapshot and deleted comments cannot be
recovered. Hashes attest preserved bytes, not truth, historical completeness or
absence of leakage. A malicious party replacing both snapshot and its trusted
hash is outside that integrity check.

JSON quoting inside an indented Markdown code block prevents comment newlines,
HTML, shell text and false delimiters from becoming program configuration or
executable input. Nothing is evaluated. This is **not** a prompt-injection
security guarantee for a real model.

## Existing author delivery

After this explicit preparation step, use the new `TASK.md` with the existing
runner. In the PolyBench preparation path, append to the task already produced
by `environments.py`; future separately authorized experiments must bind the new
file in their ordinary preparation/freeze process. Do not modify old aliases,
seals or admission rules to inject it into a historical campaign.

Plain/core receive the new task as the existing `runNativePhase` `task` argument;
task mode receives the same bytes as `HARNESS_TASK_FILE` (the runner's prepared
`/work/repo/TASK.md`). In local native task delivery, set `HARNESS_TASK_FILE` to
the generated absolute path and use the existing `/harness-task`. Install/setup
instructions remain in [native usage](../../docs/USAGE.md). This documentation
is not authorization to start model-backed work.

The installed fixture invokes the actual existing `runNativePhase` launcher for
Plain, native core and task mode, mapping only container paths to isolated local
fixture paths. It runs pinned OpenCode 1.18.26 and captures requests at a loopback
scripted provider. It asserts the **whole** task in the real author input and
rejects excluded late text in every request. OpenCode's CLI wraps argv text in
quotes and escapes double quotes; Plain/core assertions check that exact full
envelope. Task mode checks the original file text in the real child author
request. This distinguishes transport representation from task bytes; it is not
a claim that outgoing message envelopes are identical. No source/strategy/prompt
changes are needed. Fixtures make no solutions or model-quality claims.

```sh
node --test evaluation/public-context/verify.mjs
OPENCODE_BIN=/absolute/opencode-1.18.26 node evaluation/public-context/installed.mjs
OPENCODE_BIN=/absolute/opencode-1.18.26 node evaluation/public-context/installed.mjs --serverless
```

Both checks are included in the existing `npm run verify` and
`npm run verify:installed` sets. API fixtures test cutoff boundaries, invalid
dates, task/source/PR substitution, duplicates and broken pagination, limits,
API failures, contradictory proposals, hostile text, snapshot tampering, empty
results, exclusive output, disabled bytes and deterministic offline replay.
No new CI matrix or live-GitHub CI step is added.

The [saved Serverless example](fixtures/serverless-7008/README.md) records the
separately verified first-commit cutoff, four-response public collection, all 14
eligible comments, two explicit exclusions, exact offline replay hashes and
installed delivery through all three author paths. It remains a known development
example; no new Serverless solutions or quality measurements were made.
