# Serverless public-context development example

This is a saved demonstration of preparation and delivery, not a new Serverless
solution or independent evidence of model quality. The source discussion is
[serverless/serverless#7008](https://github.com/serverless/serverless/issues/7008).
The collector's limits were fixed before this collection and were not changed.

## Source and cutoff

The user separately authorized only SHA, author timestamp and committer timestamp
from `GET /repos/serverless/serverless/pulls/8159/commits?per_page=100`, with
pagination. `commit-times.jsonl` preserves that projection: three commits. No PR
body, diff, changed files or tests were requested. The earliest commit is
`c5b39313585955f4b447fc647e3c17d879e1e6b6`; both timestamps are
**2020-08-31T19:50:27Z**. This is also the minimum of all returned timestamps and
the explicit cutoff in `metadata.json`. PR opening time is not used. Git commit
timestamps are source metadata, not a guarantee of when private work began.

The original 1,246 task bytes were recovered unchanged from the retained input
archive member `prompts/serverless__serverless-8159.md`. Its SHA-256 is
`0c2f5a295e857a0ec4423015d4079b52fcabdd32b25de89dabf30b3dcd332416`.
The archive SHA-256 was
`1c3c667ae5384161f4f91af18ee7a5a0ec9dfd65a345bf94fc365fb5c5a1a227`.
Only that member was extracted; historical tasks, seals and results were unchanged.

`snapshot.json` preserves the four public API response bodies from the explicit
collector: repository visibility, issue identity/count, one complete comment page,
and an issue recheck. `collection.json` is its receipt and trusted replay hash pin.
This snapshot is administrative fixture data: it includes excluded late comments
and current repository/issue metadata. **Never mount this directory for an author.**
Only the newly prepared `TASK.md` is participant input.

## Historical v1 observed result

All 16 observed comments were accounted for. The 14 eligible comments remain in
chronological order, including [654185286](https://github.com/serverless/serverless/issues/7008#issuecomment-654185286)
and the alternatives in [683961107](https://github.com/serverless/serverless/issues/7008#issuecomment-683961107).
There is no selected answer or inferred interface. Comments `684019468` and
`684582037` were created at/after cutoff and were excluded. No comment was excluded
as a late edit in this particular snapshot; synthetic regressions cover that case.

The new task is 14,659 bytes with SHA-256
`400b3627eb701d4b5bd55ff0d7abd53b06176beff0dd781b5aaef76ab0eaad7e`.
Its first 1,246 bytes equal `original.md`; the remainder is the attributed,
untrusted discussion block. Context SHA-256 is
`9128c12b4c4e59a3fbe7d52a36f2b5e26a6bb3b761d36ad26bfb55c730f0c8f1`.
The snapshot SHA-256 is
`0b4b927ce6cb07abbb9aeb09e823cfd4c0851b4535ccf200abee337bd4a52273`.

The files `collection.json` and `delivery.json` retain the original v1 receipts.
Current preparation emits participant context v2, omitting administrative cutoff
basis and first-solution metadata. Replaying the same pinned snapshot therefore
produces different task/context hashes; it does not recreate or replace those
historical receipts. Original task bytes, eligible comment bodies/order, cutoff
and the pinned snapshot remain unchanged. Only use the newly prepared v2 task in
future authorized work, under the [required author network isolation](../../README.md#existing-author-delivery).

## Replay with the current participant format without network or a model

From the repository root, choose an absent absolute output directory whose parent
exists (replace `/absolute/new-serverless-context` below):

```sh
node evaluation/public-context/prepare.mjs \
  --task evaluation/public-context/fixtures/serverless-7008/original.md \
  --metadata evaluation/public-context/fixtures/serverless-7008/metadata.json \
  --snapshot evaluation/public-context/fixtures/serverless-7008/snapshot.json \
  --snapshot-sha256 0b4b927ce6cb07abbb9aeb09e823cfd4c0851b4535ccf200abee337bd4a52273 \
  --out /absolute/new-serverless-context

OPENCODE_BIN=/absolute/opencode-1.18.26 \
  node evaluation/public-context/installed.mjs /absolute/new-serverless-context
```

The installed fixture uses the existing launcher for Plain, core and task, with
isolated local path mapping and a loopback scripted provider. It asserts the full
received author input, equal task/original hashes across modes, and absence of
both excluded comment bodies from every provider request. Audit files are never
copied to the participant project. `delivery.json` records the successful local
demonstration: eight scripted requests, zero evaluation model requests.
Scripted responses do not implement a solution or prove model understanding.

`npm run verify` replays this saved fixture twice and checks snapshot integrity,
v2 deterministic output, absence of solution locators, alternatives,
cutoff and exclusions. `npm run verify:installed` also replays and delivers this
fixture via `installed.mjs --serverless`, without contacting GitHub. The original
collection used four public API requests; the separately authorized metadata
read used one. Reproduction uses zero public API requests. CI's own scripted
requests are additional local test traffic, not part of a model evaluation.

For a separately authorized fresh collection, replace the two snapshot arguments
with `--fetch-public` and choose another absent output directory. Modern comment
edits or deletions can change the outcome; a fresh collection is not the historical
saved snapshot. No automatic retry or truncation is used.
