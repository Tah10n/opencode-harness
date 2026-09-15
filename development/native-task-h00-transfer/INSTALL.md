# Reproduce the measured H00 installation

The measured product source is commit
`1cebebb082163250a0f78269acc164edfc3c6268`. The later PR/report commit is not the
source used for execution. `h00/` contains the exact measured materialized
instructions, runtime modules, command/config and dependency lock; only the
manifest file is an additional publication artifact. `restoration.json` records
comparison against the previous private freeze and saved installed bundle.

Use a separate clean checkout at that commit. The original installer command is:

```sh
node scripts/profile-materialize.mjs --native --task --profile core --output /absolute/new/bundle
```

Do not update dependencies or remove inactive modules. Restore the saved
`h00/package-lock.json` into that new bundle and install with `npm ci
--ignore-scripts --no-audit --no-fund` in Linux arm64. Alternatively copy the
retained installed dependencies from the previous bundle, preserving relative
symlinks. Compare every file/hash/mode/link against `h00/installed-manifest.json`.
The expected product dependencies are `@opencode-ai/plugin@1.18.26` and
`typescript@6.0.3`, including the exact transitive versions in that lock.

For the measured container installation, set only the paths in opencode.json to
`/template/core.md` and `file:///template/native-task-plugin.mjs`, as in the
published materialized config. Mount that bundle read-only at `/template`.
Instructions and command text must be unchanged. The complete author task is
supplied once through TASK.md and the existing bootstrap, not rewritten.

The retained `rg` executable is a common test-environment tool supplied to both
P and H00, not an enabled A/B component: ripgrep 15.1.0 (rev af60c2de9d), Linux
arm64, PCRE2 10.45. Its exact SHA-256 is
`968cabe8efed72fd8fd482cb76b6084fcb695fc5293af7fb62296b02f487fb69`.
The official archive and its digest are in [rg-source.json](rg-source.json);
its extracted binary was verified against this exact saved hash. Use that archive
or the retained binary; do not substitute another version silently.

The OpenCode executable is `opencode-linux-arm64@1.18.26`, SHA-256
`096d32aa9778f98981390a0602c1f8af55ee5f1d6d5c58206f8fb2743c90eafe`, npm integrity
`sha512-iOHzx0pvQoxb8120ck7f0M50AL3T9EAcS7r3qmLfhnXlNQ0E7Vq1f2HvnJ4lkBdbqzywgoV9gM6oJFYIaFERaQ==`.
The common container image is
`sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`.
Node reports 24.19.0. Use the unchanged containment adapter: network none,
read-only image, no capabilities, no new privileges, unprivileged node user,
2 CPUs, 2 GiB memory, 512 MiB work tmpfs, init reaping and exact-PID stop checks.

The settings for H00 are:

```sh
HARNESS_TASK_STRATEGY=direct
HARNESS_TASK_CONTEXT=0
HARNESS_TASK_CHECKS=0
```

For P, supply the same native dependency files and rg tool, with no core.md,
command or plugin config. Both modes receive the same experiment config,
OpenCode 1.18.26, `openai/gpt-5.6-luna`, effort `high`, native tools and task
snapshot. Each slot gets fresh filesystem/session/XDG/home state.

Each task's upstream commit is in tasks.json. Restore only that project's public
tracked source, its task, and the installed dependencies. For npm projects use
the saved exact lock in dependencies/. For ufo and ms use the original pnpm lock
and pnpm 10.33.2 / 10.33.0 respectively, with `--frozen-lockfile --ignore-scripts
--config.node-linker=hoisted`. Exclude installation caches such as .pnpm-store
from the input; preserve ordinary project tests/docs/instructions. Verify the
result against the frozen per-task input manifest before execution. Do not mount
this report directory, evaluator, controls or other attempt results in an author
container.

The existing comparison runner is used with the new series kind and a private
freeze.json. This is a record of the authorized run, not permission to submit
another series. The common deadline/stream changes are in PLAN.md. All local
scripted calibration and installation checks make zero real provider requests.
