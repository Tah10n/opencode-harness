# Claude persisted-ID calibration

This directory contains a local, disposable VibeRacing repair of the published
Claude persisted-privacy regression. It is not a VibeRacing release or a repair
of the full account-switch ledger task. The historical D0, final, and
`test-only.patch` remain unchanged.

## Reproduce the final copy

Use Node 24 and an ordinary clean Git copy of VibeRacing. Set `VIBE_REPO` to
the local VibeRacing repository, `DELIVERY` to this directory's parent, and
`COPY` to a fresh disposable directory outside both repositories:

```sh
git clone --local --no-hardlinks --no-checkout "$VIBE_REPO" "$COPY"
git -C "$COPY" checkout --detach 2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd
git -C "$COPY" apply "$DELIVERY/../post-capture-followup/M.patch"
git -C "$COPY" apply "$DELIVERY/test-only.patch"
git -C "$COPY" apply "$DELIVERY/calibration/calibration.patch"
cd "$COPY"
node --test packages/connector/test/claude-persisted-privacy.test.mjs
node --test packages/connector/test/claude-security.test.mjs packages/connector/test/readers.test.mjs packages/connector/test/config.test.mjs packages/connector/test/protocol.test.mjs
git diff --check
```

The published local runs used the pinned Linux/arm64 Node 24 image
`sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`,
with `--network none`, non-root user, a read-only project bind, 3 GiB memory,
256 PIDs, dropped capabilities, no-new-privileges, and isolated `/tmp` and
`/work` tmpfs. The loopback server in the test is synthetic.

`calibration.patch` is relative to the **already patched** B + M +
test-only input, not to the bare baseline. `other-ids.patch` changes only the
two synthetic test IDs for an independent variant; it is not part of the
calibration stack. `mutant.patch` applies only after `calibration.patch` and
intentionally restores a leak for the second RED; it is not a deliverable fix.

For the old-state transition, place the unchanged B + M + test-only checkout
at `/calibration/legacy` and the repaired checkout at `/calibration/final`
inside the same isolated container, mount this directory read-only at
`/delivery`, and run `node /delivery/legacy-transition.mjs`. The script prints
one JSON record containing the original state bytes as base64 and four
request/state receipts. The decoded original from the published run is
`legacy-state.json`; the compact receipt is `legacy-receipt.json`. It creates
and removes its synthetic installation under the container tmpfs.

See [REPORT.md](REPORT.md) for outcomes, exact provenance, and limitations.
