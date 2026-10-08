# Native usage

## Installation and upgrades

The [quick start](../README.md#quick-start) materializes the supported native
core: exactly `core.md` and `opencode.json`, without a plugin, model default or
custom runtime. Use Node.js 24+, Git, npm and OpenCode **1.18.26**. The output
must be an absolute, absent directory whose parent exists. Existing directories,
including symlinks, are refused; materialization does not overwrite global or
project settings.

For an upgrade, update your source checkout while preserving any local work,
then materialize into a fresh directory. Switch the environment variable after
inspecting the output; keep the old directory until the replacement is verified:

```sh
npm ci --ignore-scripts
npm run profile:materialize -- --native --profile core --output "$PWD/../harness-native-next"
export OPENCODE_CONFIG_DIR=/absolute/path/to/harness-native-next
opencode --model PROVIDER/MODEL
```

Repeat `--task` and/or `--review` if those experimental commands were selected;
for `--task`, install the generated pinned dependencies with
`npm install --ignore-scripts --no-audit --no-fund --prefix "$OPENCODE_CONFIG_DIR"`.
There is no in-place overwrite/merge upgrade flag. Legacy profile-v1/v2/v3
`core/deep/assurance/lab` installs and quality/feedback exports are retired.

OpenCode [merges configuration sources](https://dev.opencode.ai/docs/config/).
`OPENCODE_CONFIG_DIR` adds instructions, commands and plugins to resolution;
it does not isolate global, project or other native configuration sources.
Use `opencode debug config` locally to inspect your effective settings, keeping
credentials/private config out of public reports. The installed config fixture
uses a temporary HOME, separate XDG directories and synthetic global/project
settings to check merging and upgrades without model credentials or inference.
OpenCode can add its own schema on startup; this is distinct from materializer
writes and preserves the fixture's user settings.

## Task delivery (experimental)

Install with `--task`, install its pinned dependencies, and set:

```sh
export OPENCODE_CONFIG_DIR=/absolute/path/to/harness-task
export HARNESS_TASK_FILE=/absolute/path/to/task.txt
export HARNESS_TASK_TIMEOUT_MS=900000
opencode --model PROVIDER/MODEL
```

Invoke `/harness-task` with no arguments. It inherits the selected native model
and reasoning variant; choosing a model does not establish harness effectiveness
on that model. The existing default strategy is **D**. Explicit
`HARNESS_TASK_STRATEGY=direct` selects the single-author direct strategy;
`check-first` remains an experimental supported strategy, not a new default.
A run seeds an isolated delivery worktree at the captured Git HEAD with the
captured initial staged/unstaged/untracked diff. Artifacts are retained under
the original worktree's Git directory, in `harness-task/RUN_ID/`.
The saved patch requires manual application; workflow transfer does not apply
it to the original checkout or index. This guarantee does not cover external
changes or arbitrary hostile code running through permitted host tools.

### Reading and applying a task result

The human-readable result shows:

1. A saved terminal patch, a partial/unverified patch at stop, or no available
   terminal patch reference. Stage patch references are intermediate artifacts.
2. Commands that actually completed with exit 0 on the terminal captured state,
   followed by check execution, snapshot freshness and runner interpretation.
3. Concrete remaining work, failed/stale/missing checks, warnings and limitations.
4. The separate workflow status, correction count, recorded stop reason and paths
   to `result.json`, `tool-events.json` and the delivery worktree.

`incomplete` can accompany a saved patch and successful commands: verification
constraints remain open. `checks_passed` means recorded project checks met
workflow criteria, not independent acceptance of every task requirement. Neither
status establishes independent R/Q or model quality. An unsupported/unparsed
runner after exit 0 remains unverified; it is neither a fabricated PASS nor an
assertion that the command failed. Missing fields remain unrecorded. Cancellation,
timeouts, boundary stops and unverified native tool termination remain explicit;
a patch reference alone does not establish normal completion.

Both the native tool projection and human presentation are bounded to **16,000
UTF-8 bytes** for normal workflow paths. Large results omit bulk details while
retaining stop/termination facts, leading unresolved work and warnings, and
artifact paths. The full retained report, tool outputs and test changes remain
private in the artifact directory. Review those files before interpreting
omitted checks or accepting an author's explanation.

Inspect the actual saved artifact before applying it:

```sh
ARTIFACTS=/absolute/path/to/git-directory/harness-task/RUN_ID
PATCH="$ARTIFACTS/terminal.patch"
git apply --stat "$PATCH"
```

Read `result.json`, `termination.json`, `original.json` and the patch itself.
`original.json.base` is the captured full Git SHA. A terminal patch is the full
diff against that base, including pre-existing user changes; it is not a delta
containing only the author's new work. For a clean checkout at that base, use
`git apply --check "$PATCH"` before deliberate manual application. For a dirty
or changed checkout, inspect the patch in a fresh review worktree instead:

```sh
BASE=FULL_SHA_FROM_ORIGINAL_JSON
REVIEW=/absolute/path/to/fresh-review-worktree
git worktree add --detach "$REVIEW" "$BASE"
git -C "$REVIEW" apply --check "$PATCH"
git -C "$REVIEW" apply "$PATCH"
git -C "$REVIEW" diff
```

Run the project's actual requirement and preservation checks there, inspect
changed tests against the original contract, and transfer only reviewed new
changes into your evolving checkout. Keep your existing staged work intact.
Remove your disposable review worktree after retaining the needed evidence.
Patch applicability and green commands establish their own facts; they do not
certify that the whole task is correct.

The default workflow requests a corrective pass only for actionable observations,
such as missing/stale required execution or an observed failed check. A current
command that exits 0 with unsupported/incomplete interpretation stays unverified;
it is not repeated solely to compensate for its parser. `repairs`, `stopReason`
and `observations.correctionReasons` retain their existing machine meaning.
No corrective pass implies neither `checks_passed` nor complete delivery.

Additional diagnostics require `HARNESS_TASK_STRATEGY=direct` and remain explicit
opt-ins: `HARNESS_TASK_CONTEXT=1`, `HARNESS_TASK_CHECKS=1`,
`HARNESS_TASK_SENSITIVITY=1`, `HARNESS_TASK_INVESTIGATION=1`,
`HARNESS_TASK_TYPE_COMPAT=1`, `HARNESS_TASK_COMMAND_HINTS=1`,
`HARNESS_TASK_EXTRA_ATTENTION=1` and `HARNESS_TASK_PRESERVATION_NUDGE=1`.
Defaults and author/correction prompts are unchanged. Sensitivity requires
`npm ci --ignore-scripts --prefix "$OPENCODE_CONFIG_DIR/sensitivity"`.
Type compatibility requires `HARNESS_TASK_TYPE_COMPAT_COMPILER` pointing to
TypeScript **6.0.3**, `HARNESS_TASK_TYPE_COMPAT_PROFILE=returned-callable-strict-v1`
and `HARNESS_TASK_TYPE_COMPAT_NODE` pointing to Node 24. Generated expectations
are diagnostic hypotheses, not automatic task acceptance.

## Diagnostic review (experimental)

Install with `--review`, set `HARNESS_REVIEW_BASE` to a Git commit/ref and
`HARNESS_REVIEW_TASK_FILE` to an absolute task file, then invoke
`/harness-review` in a new session. It captures a bounded snapshot of the explicit
base, index/worktree diff and task under read permissions. Edits, bash, task and
todo writes are denied. Incomplete capture stays unverified; review does not
repair or approve a PR.

## Compatibility and support limits

| Component | Verified tool/environment | Support scope | Limits |
| --- | --- | --- | --- |
| Native core/materializer | Node 24; pinned OpenCode 1.18.26 config fixtures | Two files, collision/symlink refusal, global/project resolution and fresh-directory upgrades | Instructions use the project's own tools; model compliance/quality is not certified |
| Experimental task/review | OpenCode 1.18.26; Linux x64 installed CI at the [source checkpoint](STATUS.md#current-source-checkpoint); macOS arm64 local fixtures | Saved patch, checkout/index transfer, permissions, snapshot freshness, cancellation/deadline | Local scripted providers; worktree separation is not hostile-code containment |
| Project command observations | Existing Node.js `node --test` and supported npm routes | Execution facts plus supported runner interpretation on current snapshots | Arbitrary runners stay unverified; Maven, Gradle and JUnit have no automatic interpretation adapter |
| Context/check hints, type compatibility, sensitivity | JS/TS/npm; TypeScript 6.0.3 and pinned sensitivity dependencies | Explicit optional diagnostics using the existing adapters | These mechanisms do not establish general language support or task correctness |
| Evaluation containment | Linux arm64 Docker, pinned Node 24.19.0 image; actual boundary CI | Network/mount boundaries, descendant stop, private capture and large input checks | External evaluation infrastructure, not installed core/native host containment |
| Other OpenCode versions/platforms | No sufficient current native receipt | Unproven | Legacy quality-runtime Windows/Linux/macOS checks do not transfer to this product |

Native instructions can guide work using a project's own language/toolchain;
the specialized JS/TS/npm mechanisms above support only their documented routes.
The [results index](RESULTS.md) records frozen models and samples separately from
this compatibility table. Configuration-level model choice is broader than the
available evidence about effectiveness.

## Boundaries

Task/review Git inventories have a finite **64 MiB per command** buffer and a
**15 second per command** deadline. Complete NUL-separated path lists and hidden
index flags are inspected without adding them to model context. Exported diff
and task are limited to **1 MiB each**. Two captures must agree, including the
inventory digest. Overflow, incomplete NUL output, non-UTF-8 paths, process
failure or timeout leave capture incomplete. These are finite I/O bounds.

Installation and ordinary verification perform no paid inference. User-triggered
native task/review commands use the selected model and can consume quota.
OpenCode manages provider credentials. The benchmark collector is separate,
private opt-in infrastructure and is never installed into the native bundle.
See [status](STATUS.md), [security policy](../SECURITY.md) and
[archive/migration](ARCHIVE.md) for version-bound checks and retired components.
