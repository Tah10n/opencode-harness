# Verified change harness — implementation in progress

This package is being developed on `feat/verified-change-harness`, based on
`origin/main` at `89f1f7f1980a829d7da162fcd737d0c52613225d`.
It has no imports from historical lab, benchmark, assurance, or profile code.

The CLI, independent acceptance author, OpenCode session adapter, snapshot
controller, Docker executor, and structured Node test reporter are implemented.
The installed command has completed acceptance-failure-repair cycles with both a
local scripted provider and a real model. The real run also exposed unresolved
ambiguity in another generated assertion. **The complete development program and
frozen evaluation are still pending; this is not a release-ready tool.**

Install this package into a local prefix without sudo:

```sh
npm pack ./product/verified-change
npm install --prefix ./harness-install ./opencode-harness-verified-change-0.1.0.tgz
./harness-install/node_modules/.bin/opencode-harness doctor --workspace /absolute/repository
./harness-install/node_modules/.bin/opencode-harness run --workspace /absolute/repository -- "Your task"
```

The target repository needs a committed `.opencode-harness.json`, for example:

```json
{
  "version": 1,
  "image": "node:24.19.0-bookworm-slim",
  "sourcePaths": ["src"],
  "protectedPaths": ["test", "package.json", ".opencode-harness.json"],
  "checks": [{ "id": "regression", "kind": "node-test", "files": ["test/api.test.mjs"] }]
}
```

The configured image must already be installed. Model and variant can be supplied
as CLI options or configuration fields; when omitted, OpenCode selects its usual
defaults. Provider authentication remains in OpenCode's existing storage.
The agent's repository tools run in isolated containers with only the designated
source paths writable. The acceptance author gets the initial repository read-only
and a separate writable output directory, then audits its assertions before D0.
Only during repair does the primary agent receive a read-only mount of accepted
tests, with the command's cwd and reporter. No provider client or credential copy
is introduced. Version 1 rejects dirty worktrees, symlinks, submodules, and hidden
index flags, and does not currently install project dependencies automatically.

Private artifacts (D0/D1/D2 patches, snapshots, report, attempt journal, assertions, bounded tool
diagnostics) are retained in the temporary run directory printed by the CLI.
Only a fully checked selected patch is applied, after rechecking user HEAD and
cleanliness. Other outcomes retain their patches for manual inspection.

The controller retains D0 when bounded repairs fail, reproduces assertions before
repair, excludes explicitly ambiguous or ungrounded generated hypotheses, and
reruns all mandatory checks after each repair. A literal citation validates
provenance, not semantic correctness: generated tests remain fallible hypotheses.

Checks execute in a locally available Docker image resolved to its immutable
image ID. Containers have no network, no host credentials, a read-only root,
bounded resources, and a read-only repository for host verification. Container
removal terminates detached descendants on timeout and cancellation. No image is
automatically pulled, no sudo is used, and no executable is copied out of its
runtime installation.

The initial assertion adapter supports Node's built-in test runner. It uses
structured reporter events and identifies `ERR_ASSERTION` failures. Other test
errors and nonzero generic build commands are conservatively infrastructure
errors; additional language/framework adapters remain to be implemented.
Truncated or malformed diagnostics cannot be treated as passing verification.

Run the deterministic controller/configuration checks:

```sh
npm test
```

Run the installed-package Docker check (requires the existing local image
`node:24.19.0-bookworm-slim`):

```sh
VERIFIED_CHANGE_DOCKER_TEST=1 npm test
```

The latter packs and installs the package into a temporary directory and executes
the installed modules in real containers. To exercise the installed CLI with
actual OpenCode and a localhost scripted provider (no paid model requests):

```sh
VERIFIED_CHANGE_OPENCODE_TEST=1 node --test test/opencode-fixture.test.mjs
```

This is mechanism evidence, not product lift. Three initial model-backed development
runs exposed admission, repair-diagnostic and assertion-ambiguity issues; their findings are described
in `development/verified-change/README.md` in the source repository. No official
evaluation has been run. `doctor` checks the configured project's actual commands
on an isolated clone, explicitly leaving model access and repair unverified.

Remaining work: further hardening/review of the new CLI and adapter; model-backed
development; one preregistered 60-task A/B/C evaluation; independent code/statistics
review; one PR. No merge, release, or default switch is authorized.
