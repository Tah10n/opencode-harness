# Evidence retention and completed cleanup

The series and all four evaluator processes finished before cleanup. The
[receipt](cleanup.json) records exact removed paths/image identities, retained
freeze hashes and the verified private archive.

The private archive is
`local/public-context-development-v1/retained/evidence-2026-10-20.tar.gz`,
173,207,965 bytes, SHA-256
`04b9482232aa01e34a8ef939f4269f6a092cf54e5725f50ca48886a57f2d1a24`.
All **3,129 archived files** were reread from the archive and matched their
original size and SHA-256. It retains full request/response recordings, native
sessions/tools, full patches, evaluator outputs/logs, preparation and amendment
receipts, original and amended freezes, exact participant TASK bytes and
administrative provenance. The archive and its detailed manifest are private
local files with mode 0600; neither is committed.

Before archival, every real request/response recording was separately checked
against its recorder manifest and decoded; all SSE terminal results, actual
model identifiers and usage were verified. Every published patch matches its
captured and exported prediction bytes. The machine results bind official
outputs to the immutable predictions and pinned evaluator.

Removed **6,142,509,559 logical bytes** of owned source/dependency copies,
Python/evaluator/toolchain installations, materialized runtime bundles and
archived working copies of runs/preflights. The earlier amendment-only npm
installs/cache removed another **52,402,167 logical bytes**, counted separately.
The preparation's October 17 cleanup is historical and is not added to these
figures. Logical file bytes are not a claim about physical APFS block recovery.

All **eight campaign images** were removed by their exact single owned tags,
after verifying IDs, absence from the pre-preparation image inventory, and zero
container references. No force deletion or global prune was used. The
participant/evaluator containers had already been removed by their normal
cleanup. The dedicated preparation builder/cache had been removed during
preparation; this run created no new builder or volume. Unrelated containers,
images, build caches, volumes and worktrees were preserved. Docker physical
space recovery is unknown because layers are shared and unrelated work was
active concurrently.

About **282 MiB** of private local evidence remains (294,773,064 logical bytes
at the cleanup snapshot, before the small final receipts). Most is the verified
archive plus readable original/amended freezes. Readable accounting, official
results/logs, hashes, exact TASK copies and preparation receipts are retained for
inspection; public results and patches also remain in the existing worktree.
The bulky reproducible runtime inputs are intentionally retired. This evidence
directory is no longer a runnable prepared batch, and no further launch is
authorized.
