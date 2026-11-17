# Task-local Harness² experiment

This opt-in adapter runs the original Harness² `run_parallel(k=1)` through our
installed OpenCode 1.18.26 container execution path. It tests instruction delivery,
independent solutions, observation-based composition, artifact selection and admission.
It does not establish the quality of adaptation by a real model. Real-provider
execution is deliberately unavailable in this first version; every response comes
from a local scripted provider. There is no credential discovery or network fallback.

## Run the executable example

Requirements: Node 24, Python 3.9+, Docker, a separate Linux OpenCode 1.18.26 binary,
and the existing evaluation fixture image. No Python packages are installed. The
unchanged, pinned method modules are included under `vendor/` (220 KB), so neither
ordinary installation nor this experiment downloads the upstream benchmarks.

```sh
# Use a fresh local directory. On x64 choose opencode-linux-x64 instead.
mkdir -p local/adaptive-tools/linux
npm pack opencode-linux-arm64@1.18.26 --ignore-scripts \
  --pack-destination local/adaptive-tools/linux
tar -xzf local/adaptive-tools/linux/opencode-linux-arm64-1.18.26.tgz \
  -C local/adaptive-tools/linux
docker build --iidfile local/adaptive-tools/image.id \
  -f evaluation/support/Dockerfile evaluation/support
export EVALUATION_IMAGE="$(cat local/adaptive-tools/image.id)"
node evaluation/adaptive-harness/assets.mjs "$PWD/local/adaptive-assets" \
  "$PWD/local/adaptive-tools/linux/package/bin/opencode"
node evaluation/adaptive-harness/run.mjs "$PWD/local/adaptive-example" \
  "$PWD/local/adaptive-assets" adaptive-k1 --scripted

# All three modes and actual-container negative controls; fresh output required.
node evaluation/adaptive-harness/verify.mjs
node evaluation/adaptive-harness/verify-installed.mjs "$PWD/local/adaptive-checks" \
  "$PWD/local/adaptive-assets"
```

The assets command uses the existing pinned evaluation dependency lock and never
materializes `core.md`. The standalone example retains compact native evidence,
full patches, full text snapshots and requests locally. It removes per-stage
dependency copies and containers after verified capture. Delete only your own
example/tool directories and image after retaining the evidence you need. If the
existing capture layer retains a container because evidence is incomplete, use its
`evaluation/support/recover.mjs` procedure before removing that container.

## Modes and result selection

| Mode | Task executions | Instruction stages | Selection pool |
|---|---:|---|---:|
| `plain-single` | 1 Plain | none | 1; direct delivery |
| `plain-multi` | 4 independent Plain | none | all 4 |
| `adaptive-k1` | Plain R0, general, domain, final | independent general/domain editors, composer | R0 and R-final |

The original `harness2/core/recursion.py` schedules both editors from the same R0
evidence, both candidate executions, composition from their real results, and the
final execution. The Python adapter implements `BenchmarkAdapter` and the proposer
call interface; the Node bridge delegates each role to the unchanged shared
`runComparison`, `startContainer`, `runNativePhase`, recorder and patch capture.
Stages run sequentially with `propose_workers=rollout_workers=1`. Every solver gets
the same original source tree and a fresh session, HOME, Git repository and container.
Patches and session state never become another solver's input.

Both multi-run modes use the same anonymous-ID/hash selection contract. Candidate
count differs (4 versus 2), so they are not byte-identical selection procedures.
The selector receives the public task, full patches and public check outputs; it
cannot change delivered bytes. Invalid IDs, hashes, JSON or edits close delivery as
`selection_failed`/`incomplete`. There is no hidden-score fallback. Keeping R0 in
the pool does not guarantee that a real selector recognizes a regression.

`selection.json` retains the chosen artifact and the independent composition result
separately. The selected full snapshot must match its hash before delivery. Only
then is the administrative check mounted in a separate container. Author tests and
all production edits remain in the delivered tree; there is no overlay of test patches.
An independent check failure is a measured outcome, not an infrastructure failure
and never a reason to retry a solver. The deliberately imperfect Plain fixture
solutions should fail that check; the composed scripted solution should pass.

## Editable surface and data boundaries

Only `systemprompt.md` and `skills/<lowercase-name>/SKILL.md` text may be proposed
under the editor's `context/harness/`. At most 12 files, 8 KiB per file, 32 KiB total.
Scripts, hooks, plugins, subagents, memory files and configuration are unavailable.
No installation command from a proposal is executed. Names, types, symlinks,
hardlinks, executable bits, sizes and edits outside the harness are checked before
harvesting. The upstream may add a missing skill trigger; the execution hash covers
the resulting materialized tree, including that trigger. Instructions are connected
through controller-owned `OPENCODE_CONFIG_CONTENT`; skill text is explicitly read
from the read-only `/template/harness/skills/` path, not auto-installed as a plugin.

All model roles run in `--network none`, read-only-root containers, with fresh HOME,
no host credentials or Docker socket, dropped capabilities and no extra privileges.
Only the stage's public input, pinned binary, relay and controlled template are
mounted read-only. Administrative material is a sibling directory with no model-role
mount. This is the data boundary; upstream's marker checks are only supplementary.
The full native trajectories and patches are readable to editors/composer. The
existing recorder/output layer preserves any long tool output. This bounded fixture
fits the stated text limits; unsupported oversized or non-text snapshots fail closed.
A missing trajectory is not reported as a failed task check.

The selector receives no harness labels or method identity in its candidate entries.
Source comments and artifact content can still hint at how a solution was produced;
this is procedural anonymization, not a claim of perfect blinding. Likewise, marking
evidence as data does not prove a real model's resistance to prompt injection.

## Freeze, budget and stop rules

The task manifest binds method bytes, adapter/support code, adapter Git HEAD,
runtime assets and image, original source/TASK, role prompts, graph, surface,
selection rules, total wall time and provider-request allocations before R0.
Candidates are new stage artifacts; their separate hashes do not rewrite the
initial manifest. Runtime and materialization hashes are checked again before launch.
Historical campaign freezes and ordinary product commands are unchanged.

Default scripted limits are **600 seconds / 120 admitted requests**, with maxima
of 48 solver, 32 editor, 16 composer, 8 selector and 16 auxiliary requests. Both
multi-run modes accept the same `Budget` options. Counts include title requests and
the upstream's one repair of an invalid proposal. The clock starts before manifest
preparation and includes tools, container setup, capture and cleanup. Admission and
native execution share an absolute deadline; bounded capture/stop operations may
finish after it to preserve evidence and prove termination. No next stage is admitted.
Observed tokens/time are reported separately; token usage is accounted after the
response, not a hard token cap or a new financial accounting system.

Unknown response completion, recorder loss, missing termination proof, changed
inputs or exhausted budget latch admission closed. Python raises a fatal bridge
exception outside the upstream's recoverable fallback handlers, so neither upstream
retry nor resume bypasses the stop. Invalid proposals alone may receive the original
one repair and then inherit H0; the upstream `fell_back` and `kept_base` fields are
retained. They are never described as successful adaptation. A fresh output directory
is required for any explicitly initiated new run; an existing run cannot resume.

## Upstream provenance and explicit differences

Source: [google-research/harness2 at 1cfe254](https://github.com/google-research/harness2/tree/1cfe254e8d25b15f37048c3730134686abe60335).
Every included upstream file is byte-identical and listed in `upstream.json`; the
original Apache-2.0 license and copyright notices are retained. Included core files
are recursion, spec, context, prompts, selection, tree, ledger, proposer and package
initializers/config. The upstream default host proposer is imported for its reply
types but never instantiated. No optional benchmark, Vertex, LiteLLM or Pandoc
dependency is used. There are **no upstream source patches**.

Local restrictions/deviations are deliberate:

- Only task-local parallel `k=1`, physically serialized; no library or cross-task memory.
- Plain H0 has no product core. Inherited empty `systemprompt.md` is inert.
- Text-only surface enforced by the adapter, with a frozen narrowing instruction
  appended to upstream's broader role prompts. No change to upstream prompt bytes.
- A contained proposer bridge replaces upstream's host process launcher and its
  transport retries/cache. Recoverable invalid proposals retain upstream's two attempts.
- A shared strict ID **and artifact hash** selector replaces upstream selection's
  output contract. It uses upstream `assign_ids`; no experience-writing stage runs.
- R0 is included alongside R-final. Upstream `selection_pool` excludes R0; this is
  not an exact reproduction of the published final-selection convention.
- Only a small text-code fixture and local scripted transport are supported here.
  Real model availability, adaptation quality and broader repository support are unproven.

The next stage requires separate authorization and a frozen, bounded model comparison
of this working mechanism. No paid smoke/auth probe, external review, merge or release
is part of this prototype.
