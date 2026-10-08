# Experimental differential compatibility replay

The probe runs the same declared public calls on an immutable baseline and a
captured candidate. Expected behavior comes only from executing that baseline.
A confirmed difference adds a concrete observation to existing D feedback.
A match means only that these inputs agree; task acceptance remains independent.
This component is experimental and is absent from the normal materializer.
[The actual report](evidence/REPORT.md) records the passed technical gate and
stopped two-slot model run; the sealed campaign cannot resume.

`tasks/` has six multi-module repositories, fixed public declarations/corpora,
independent acceptance tests and gold/wrong control patches. See
[the fixed development protocol](PROTOCOL.md) for admission and interpretation.
The baseline sources, corpus and tests are ordinary public data for both arms.

## Supported domain

Synchronous ES-module functions with `./` relative `.mjs` imports within one
small source tree; no Node built-ins, external packages, dynamic imports, host
I/O, timers or eval. Arguments/results are null, Boolean, bounded strings,
finite numbers except negative zero, dense arrays and plain data objects.
Undefined, NaN/infinity, bigint, functions, symbols, accessors, proxies, sparse
or extended arrays, cycles and custom prototypes are unsupported. Only ordinary
Error, TypeError and RangeError exceptions with plain message/stack properties
are observed; stacks are excluded. Object property order is ignored; array order,
return-versus-throw, exception name/message and post-call arguments are compared.
Identity/aliasing, descriptors, performance and other side effects are outside
this version. Functions relying on those properties must not be declared here.

Bounds: 32 calls, 8 KiB argument JSON each, depth 12, 2048 value nodes, 256 object
keys, 128 array items, 4096-character strings; source tree 1 MiB/256 files,
32 modules/256 KiB total module source and 64 KiB per module. Inputs outside these
bounds are unsupported/unproven. Each case gets a fresh module realm and two
calls, and each version runs in two fresh worker processes. Time/random APIs are
rejected and observed instability is unproven. These checks cannot certify
universal determinism or semantic equivalence; the restricted pure domain is
part of the declaration contract, not an inference about all JavaScript.

## Isolation and freshness

The existing container session supplies network none, read-only root/mounts,
resource bounds and workload stopping. The VM narrows supported module semantics;
it does not replace container isolation. The controller refuses host execution.
OpenCode's executable is not Node, so workers use the image's fixed
`/usr/local/bin/node`. A worker timeout/incomplete result is never a regression.

Baseline/corpus hashes are pinned before participant work from read-only input,
checked before and after execution, and bound by the campaign freeze. Participant
changes to its corpus copy produce unproven, not a modified oracle. Candidate
bytes are hashed before/after and the native snapshot is checked again before
accepting observations. Every correction reruns the probe on the new snapshot.
A stale mismatch is never a current correction reason.

The only native change is the optional synchronous `observeExperimental` callback
in `native-task-plugin.mjs`. Without it the original observations return directly.
The experiment wrapper alone supplies the callback. Author/correction prompts,
strategy and correction/stop limits retain their previous bytes and behavior.
The callback takes time from the current native/outer deadline.

## Reproduction (no inference)

Prepare the pinned assets and image using the existing
[feedback-development instructions](../feedback-development/README.md). Then:

```sh
node evaluation/compat-replay-development/verify.mjs
EVALUATION_IMAGE=sha256:YOUR_IMAGE node evaluation/compat-replay-development/container-checks.mjs \
  /absolute/fresh/preflight /absolute/assets/toolchain
EVALUATION_IMAGE=sha256:YOUR_IMAGE node evaluation/compat-replay-development/assets.mjs \
  /absolute/assets/bundle
EVALUATION_IMAGE=sha256:YOUR_IMAGE node evaluation/compat-replay-development/installed.mjs \
  /absolute/fresh/scripted /absolute/assets/bundle /absolute/assets/toolchain
```

For task 01, the wrong patch globally merges `['a','b','a']`, returning counts
`a:2,b:1`; baseline returns `a:1,b:1,a:1`. Both versions pass the public example
`['a','a','b']`. The normal observations have no corrective reason. The probe
supplies the changed entrypoint, input, both behaviors, snapshot/tree hashes and
worker/corpus paths. The gold helper restores consecutive grouping and the
mismatch disappears. Container checks retain all three executable observations,
ordinary-test output and independent grading. The installed fixture additionally
checks that the actual native corrective request contains this observation.

Each mismatch names a worker invocation for each root, plus case id; the full
snapshot patch and corpus hashes allow reconstruction after container cleanup.
Recreate a fresh offline session with that baseline and full patch, then run
`node --experimental-vm-modules /template/compat/worker.mjs ROOT CORPUS` on both
roots. Do not execute these project modules directly on the host.

Private raw requests, session paths and captures stay under ignored `local/`.
Only sanitized evidence belongs in `evidence/` and the results index. Remove
owned assets/caches/containers after verifying retained evidence; do not prune
shared Docker resources.
