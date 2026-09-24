# Linux controller validation follow-up

The complete controller suite now finishes normally in the original isolated
Linux image. The failure was the source mount preparation: `/repo/.git` was a
host worktree pointer to a macOS Git directory that was not mounted in Linux.
Git 2.39.5 inspects that pointer even for `diff --no-index` and returns **128**.
Exporting the tracked source tree with `git archive`, instead of mounting the
host worktree metadata, fixes the preparation. Runtime, observer, nudge revision
2, snapshots, trust rules and process limits are unchanged.

## Reproduction and cause

The two original attempts were recovered from the September 21 revision-2
session, at 09:56:19 and 09:58:49 UTC. Both used image
`sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`,
Node **24.19.0**, Git **2.39.5**, npm **11.17.0**, UID/GID **1000**, HOME `/tmp`.
The read-only host worktree was mounted at `/repo`. Restrictions were
`--network none --read-only --cap-drop ALL --security-opt no-new-privileges
--pids-limit 256 --memory 1024m --cpus 2 --user node`, with `--init`,
`--pull=never` and `--tmpfs /tmp:rw,exec,nosuid,size=512m`.

The first original composite invocation used cwd `/tmp`: its initial 23
observations passed, then materialization could not find
`/tmp/profiles/native/core.md`. The second used cwd `/repo` and failed during
`nonzero` in the imported observation suite. These remain failures.

Fresh independent detached worktrees reproduced the second failure, each with
its own complete `lib/` and `scripts/`. The table concerns the standalone command
`node scripts/verify-native-task-command-observations.mjs`, always in `/repo`:

| Source SHA | Original worktree mount | Corrected source export |
| --- | --- | --- |
| `3f5605d9c2ba58a3f631706a32178911973fcd60` | exit 1, 1.473 s | exit 0, 23 scenarios, 5.791 s |
| `44ce9648dbb5ad0c785319c0086beaa2f3de4aa7` | exit 1, 1.411 s | exit 0, 23 scenarios, 5.633 s |

The original reproduction runs were unmodified. Subsequent diagnostic runs
added only logging after the unchanged `spawnSync` in both copies. Both showed:

- Scenario `nonzero`; executable `/usr/bin/git`; cwd `/repo`.
- argv: `diff --no-index --no-ext-diff --no-textconv -- <before> <scratch>`.
- `<before>`: `/tmp/native-command-observations-<id>/nonzero/.git/observations/original-tests/value.test.mjs`.
- `<scratch>`: `/tmp/native-command-observations-<id>/nonzero/.git/observations/test-diff-current`.
- `status=128`, `signal=null`, no spawn error (`error.code/message` absent),
  stdout empty; stderr `fatal: not a git repository: /Users/tahion/dev/opencode-harness/.git/worktrees/<old-or-new>`.
- Both inputs: existing regular files, 118 bytes, mode 0600, UID 1000, readable.
- Existing timeout 15,000 ms and maxBuffer 8,388,608 bytes, unchanged.

This is not the normal differences status 1, a file-access failure, a signal,
resource exhaustion or a preservation revision regression. Only source metadata
placement changed in the successful comparisons; no test-only code overlay was
applied to either historical SHA. The fixture repositories retain real Git
metadata and real Git operations inside the container.

No host environment is forwarded except the explicit HOME override. Image
settings contain PATH, NODE_VERSION and YARN_VERSION; `HARNESS_TASK_*`,
`NODE_OPTIONS`, `TMPDIR`, Git/npm environment overrides are absent. System/global
Git config and user/global npmrc are absent; npm `ignore-scripts=false` and
`script-shell=null`. Config checks from the broken cwd initially hit the same
invalid gitdir; they were repeated from `/tmp`. No global Git setting was changed.
In particular `HARNESS_TASK_STRATEGY=direct` is not imposed on the controller.

## Minimal correction and regression

The historical Linux launcher was an ad hoc Docker command, not a checked-in
launcher. Its corrected preparation is documented below. There is no new
launcher framework, runtime change, widened mount or safe.directory exception.

The existing command-observation script adds one focused boundary block:
real Git reproduces the invalid source-cwd failure; removing only the fixture's
own invalid gitfile permits the same observer to capture the real diff. Equal
files produce empty output/status 0 and no observation changes. A changed
assertion produces a substantive diff relative to captured **uncommitted user
work**, with the original bytes retained. Separate spawn-error, signal and
partial-buffer fault injections still throw; none becomes an empty diff.
The original 23 scenario assertions are preserved. Temporary cwd and builtin
function replacement are restored in `finally` before the importing suite runs.

## Final validation

All runs below use the corrected export and the final test code. The exported
`lib/`, `scripts/` and `profiles/` bytes were compared against the delivered tree;
report-only edits do not change the tested code. No runtime or installed wiring
changed, so the installed matrix was not repeated.

| Entry point under `scripts/` | Exit / signal | Seconds | Result |
| --- | --- | ---: | --- |
| `verify-native-task-command-observations.mjs` | 0 / none | 6.327 | 23 scenarios + exact diff/source-cwd boundaries |
| `verify-native-task.mjs` | 0 / none | 40.513 | **Complete controller suite**, both summaries |
| `verify-native-preservation-nudge.mjs` | 0 / none | 0.176 | all unit controls, including revision 2 |
| `verify-native-preservation-hooks.mjs` | 0 / none | 3.909 | 3 invalid configurations + 7 lifecycle cases |
| `verify-native-template.mjs` | 0 / none | 0.261 | all materialization/CLI controls |

Every stderr is empty. Each command had the original external `timeout 180`;
none hit it. Durations include Docker startup/removal. Full stdout/stderr, argv,
exit/signal and durations are retained under ignored
`local/controller-followup/`. The complete controller's final output is:

```json
{"passed":true,"checkFirst":true,"realTemporaryFiles":true,"nativeStateAndPermissions":true,"threeCorrectionBound":true,"realProviderRequests":0}
```

All controller clients are local mocks and all executed project checks are
local fixtures. No real provider, model, availability probe, paid reviewer or
benchmark was invoked. Developing-agent work and these checks are separate from
historical Luna usage. Historical model results, patches and missing outputs
are unchanged. The single final diff review found no weakened assertions,
masked observation error, changed snapshot semantics or new trust authority.
Syntax and scoped whitespace checks pass after the final edits.

Additional preparation failures are retained, not scored as tests: the host
Python lacked `tarfile.extractall(filter=...)`, so the first attempted export
was empty/missing (one module-not-found exit 1 and two invalid-mount exit 125
results). Extraction was corrected to local `git archive` plus `tar`; the
successful historical comparison above is separately labelled `*-export-ready`.

## Repeat the corrected preparation

From a clean checkout of the delivered revision, with the pinned image already
present, export each revision independently. This excludes host `.git`, ignored
private captures and credentials. It does not mix an old entry point with newer
runtime modules. Preserve any local edits before selecting the revision.

```sh
set -eu
source_export=$(mktemp -d /tmp/native-controller-source.XXXXXX)
git archive --format=tar HEAD > "$source_export/source.tar"
mkdir "$source_export/repo"
tar -xf "$source_export/source.tar" -C "$source_export/repo"
for entry in verify-native-task-command-observations verify-native-task \
  verify-native-preservation-nudge verify-native-preservation-hooks \
  verify-native-template
do
  docker run --rm --init --pull=never --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 \
    --memory 1024m --cpus 2 --user node \
    --tmpfs /tmp:rw,exec,nosuid,size=512m --env HOME=/tmp \
    --mount "type=bind,source=$source_export/repo,target=/repo,readonly" \
    --workdir /repo \
    sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6 \
    timeout 180 node "scripts/$entry.mjs"
done
```

This closes the local Linux technical validation gap. It does not establish
model-quality improvement, full platform/aggregate CI, host loopback support,
release or deployment. CI and the published SHA are checked separately at
publication; previous host failures remain historical failures.
