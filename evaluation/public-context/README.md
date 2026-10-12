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
- `context.json` (v2): only repository, issue, original-task hash and cutoff time
  in the participant binding; eligible comments with author,
  source URLs, exact text, timestamps and body hash.
- `snapshot.json`: bounded API response bodies, source endpoints, pagination
  headers and hashes, including rejected text. **Administrative audit only.**
- `audit.json`: every excluded comment ID and its concrete exclusion reason.
- `receipt.json`: status (`complete` or honest `empty`), counts, parameters,
  output/context/snapshot hashes and public API invocation count.

Only give `TASK.md` to participants. Keep snapshot, audit, receipt and metadata
outside participant checkouts and tool-readable mounts; they may contain late
text or solution identifiers. The complete reviewed binding (including cutoff
verification evidence) remains in administrative snapshot/receipt files only.
The participant binding is an allowlist; extra metadata fields are never rendered.
The script does not configure a sandbox or grant file permissions to a model.
Once the absent output directory has been created, failures (including missing,
unreadable, non-regular and oversized task input) exit nonzero and write
`failure.json` with `blocked`, reason and the
number of attempted API invocations. It never falls back to a successful
unaugmented task. An invalid or existing destination is refused without writing
there. Interrupted/partial outputs without a success receipt are
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
rebuilds the same v2 task/context bytes. Existing v1 snapshots remain readable;
v1 collection/delivery receipts remain historical evidence. The v2 projection
intentionally changes task/context hashes; never rewrite historical receipts or
seals. Metadata property order is part of the
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
Augmented output now additionally must fit **131,071 bytes**, including the
original task and rendered block. This reserves the terminating NUL within
Linux's 128 KiB per-argument limit used by Plain/core, and also fits task mode's
1 MiB file bound. An oversized final task is blocked without truncation. Disabled
mode remains a byte-preserving copy within the original-input bound, not a
certification of downstream delivery size. Snapshot v1 collection limits are
unchanged.
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

For a cutoff-controlled experiment, authors **must run without external network
access**, with no external web/MCP tools, inherited host configuration or
credentials. Public source URLs remain provenance, not permission to fetch their
current contents. Denying only `webfetch` is insufficient when bash can use the
network. Ordinary local `/harness-task` or web-enabled native core is not a
supported environment for enforcing this cutoff.

Use the existing `evaluation/support/container-session.mjs` runner, which creates
a fresh container with `--network none`, isolated HOME/XDG paths and only the
explicit input/toolchain mounts. Its loopback provider relay forwards model
requests through the host; it grants no general web proxy or author egress.
Keep administrative files, solution objects and hidden data outside all author
mounts, and admit only the reviewed model-provider configuration (no remote tools).
The existing container boundary check verifies Docker isolation and actual socket
egress rejection. The local scripted fixture below proves delivery only; it does
not provide or certify this network boundary for a real author.

After this explicit preparation step, use the new `TASK.md` with that existing
contained runner. In the PolyBench preparation path, append to the task produced
by `environments.py`; future separately authorized experiments must bind the new
file in their ordinary preparation/freeze process. Do not modify old aliases,
seals or admission rules to inject it into a historical campaign.

Plain/core receive the new task as the existing `runNativePhase` `task` argument;
task mode receives the same bytes as `HARNESS_TASK_FILE` (the runner's prepared
`/work/repo/TASK.md`). General installation instructions remain in
[native usage](../../docs/USAGE.md); they do not establish experiment containment.
This documentation is not authorization to start model-backed work.

The installed fixture invokes the actual existing `runNativePhase` launcher for
Plain, native core and task mode, mapping only container paths to isolated local
fixture paths. It runs pinned OpenCode 1.18.26 and captures requests at a loopback
scripted provider. It asserts the **whole** task in the real author input and
rejects excluded late text and administrative cutoff evidence in every request.
OpenCode's CLI wraps argv text in
quotes and escapes double quotes; Plain/core assertions check that exact full
envelope. Task mode checks the original file text in the real child author
request. This distinguishes transport representation from task bytes; it is not
a claim that outgoing message envelopes are identical. No source/strategy/prompt
changes are needed. Fixtures make no solutions or model-quality claims.

```sh
node --test evaluation/public-context/verify.mjs
OPENCODE_BIN=/absolute/opencode-1.18.26 node evaluation/public-context/installed.mjs
OPENCODE_BIN=/absolute/opencode-1.18.26 node evaluation/public-context/installed.mjs --serverless
OPENCODE_BIN=/absolute/opencode-1.18.26 node evaluation/public-context/installed.mjs --delivery-limit
```

These checks are included in the existing `npm run verify` and
`npm run verify:installed` sets. API fixtures test cutoff boundaries, invalid
dates, task/source/PR substitution, duplicates and broken pagination, limits,
API failures, contradictory proposals, hostile text, snapshot tampering, empty
results, exclusive output, task-admission failure receipts, disabled bytes and
deterministic offline replay. The installed delivery-limit scenario exercises
the largest admitted augmented task through all three real author paths.
No new CI matrix or live-GitHub CI step is added.

The [saved Serverless example](fixtures/serverless-7008/README.md) records the
separately verified first-commit cutoff, four-response public collection, all 14
eligible comments, two explicit exclusions, historical v1 hashes and
installed delivery through all three author paths. Current replay emits v2 with
administrative solution evidence removed and therefore different output hashes.
It remains a known development example; no new Serverless solutions or quality measurements were made.
