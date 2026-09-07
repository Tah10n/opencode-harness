# Verified change harness — next product version 0.2.0

Experimental OpenCode wrapper with private D0/D1/D2 patches, project checks,
diagnostic generated tests, and at most two repairs. It has no dependency on lab,
benchmark, evaluation, or profile code. No product quality advantage is proven.
The previous version's frozen 60-task study is preserved in the repository at
`docs/verified-change-results.md`; this version fixes known product defects and
has not been evaluated in a new model campaign.

## Install and run

With Node 24+, the existing OpenCode installation, Docker, and an already local
Node image (the product never pulls an image):

```sh
npm pack ./product/verified-change --ignore-scripts
npm install --prefix ./harness-install --ignore-scripts --no-audit --no-fund ./opencode-harness-verified-change-0.2.0.tgz
./harness-install/node_modules/.bin/opencode-harness doctor --workspace /absolute/repository
./harness-install/node_modules/.bin/opencode-harness run --workspace /absolute/repository -- "Your task"
```

The target repository needs a clean Git worktree and a committed config:

```json
{
  "version": 1,
  "image": "node:24.19.0-bookworm-slim",
  "sourcePaths": ["src"],
  "protectedPaths": ["test", "package.json", ".opencode-harness.json"],
  "checks": [{ "id": "regression", "kind": "node-test", "files": ["test/api.test.mjs"] }]
}
```

Project dependencies must already be available. `--model provider/model` and
`--variant variant` override project config; otherwise OpenCode selects its usual
defaults. Authentication stays in OpenCode's existing storage. The package does
not introduce a provider client or credential copy.

## Which failures can cause repair

The controller records three sources:

- `existing_project_check`: configured project checks (the default for existing
  configs). Reproduced assertions can trigger bounded repair.
- `independently_validated_acceptance`: a project-owned Node test with explicit
  confirmation of its expected result in the committed config. Its exact test
  bytes must match the confirmation and live in protected paths. Reproduced
  assertions can trigger bounded repair.
- `generated_hypothesis`: all output from the acceptance author, regardless of
  confidence, exact quote, claimed source, or a model's agreement. These tests
  execute as diagnostics, retain assertions and test files, and never independently
  authorize production repair or block a draft that passes trusted checks.

The currently supported confirmation basis is **project-owner confirmation**.
The owner reviews the expected output and test, then commits a check such as:

```json
{
  "id": "negative-timeout",
  "kind": "node-test",
  "files": ["test/negative-timeout.test.mjs"],
  "source": "independently_validated_acceptance",
  "expectedResult": {
    "kind": "project_owner_confirmation",
    "confirmed": true,
    "expectation": "Calling delay(-1) throws RangeError before scheduling a timer.",
    "rationale": "The owner confirmed this boundary example against the task's explicit input/output requirement.",
    "fileSha256": { "test/negative-timeout.test.mjs": "<SHA-256 of the reviewed file>" }
  }
}
```

Replace the placeholder with the actual 64-character SHA-256. Hash keys include
`cwd` when configured; every listed test file needs its own digest. Changed test
bytes require renewed owner confirmation. Existing workspace ownership, committed
configuration, protected files and snapshot checks establish the trust boundary;
this is not a signing service or a new reviewer role. A hash binds bytes, not
semantic truth. The owner must actually confirm the expectation. A model-written
paraphrase, boolean or hash inside an author manifest cannot grant this status.
Explicit task examples and reference API behavior may inform that owner review;
this version does not automatically infer or validate expectations from prose or
call external reference APIs.

The acceptance author sees the initial repository, never D0. Generated tests are
run against snapshots, but remain hidden from the primary session during draft
and repair. Only trusted failures and checks enter repair prompts. After the
repair decision is final, the existing primary session may explain/dispute
reproduced diagnostic failures in a read-only turn. Correct grounded disputes
remain in the report; an empty dispute list never promotes a test. No new model
reviewer is added.

Reports separate `passedProjectChecks`, owner-confirmed acceptance checks and
`unresolvedHypotheses`, including failing assertions and explanations. Even a
passing generated test stays a hypothesis. `checks_passed` means trusted checks
passed; `semanticCorrectness` remains `unproven`. Keeping D0 is not proof that it
satisfies every aspect of the task. Generic runtime failures in diagnostic tests
are recorded as unresolved; containment failures still stop publication.

## Execution, patches and cleanup

The host reproduces trusted assertion failures before repair and reruns all
checks after each repair. It rejects repairs that break a trusted check passing
in D0, stops after two unsuccessful repairs and retains the original D0 patch.
Existing tests cannot be weakened. Nonzero generic commands, broken test runtime
and timeouts in trusted checks are unavailable verification, not repair evidence.
The initial assertion adapter supports Node's built-in test runner.

All repository tools execute in containers with no network or host credentials,
a read-only root, restricted mounts and bounded resources. Source scope,
protected tests and original user HEAD/cleanliness are checked before publication.
Version 1 config still rejects dirty worktrees, symlinks, submodules and hidden
index flags. Concurrent user edits are preserved.

Private artifacts are retained in the printed temporary run directory: patches,
snapshots, generated tests, report and `attempts.jsonl`. Cleanup errors include
exact container name/observed ID, bounded rm/inspect/list outputs, command exits,
timeouts and before/after state in `error.json`. Plugin cleanup refusals also
persist in the session control directory. A later empty inventory cannot erase
an uncertain cleanup result. Such runs never apply a patch to the user worktree
or repeat the model task. Already absent auto-removed containers are accepted
only with a precise missing-container response and immediate verified absence.

`--draft-patch /absolute/draft.patch` imports an existing D0 after authorship,
without a second draft call. `--time-limit-ms 900000` caps the private run after
preflight; model prompts also retain `sessionTimeoutMs`. Cancellation cleanup can
add bounded wall time. An expired deadline prevents starting publication; Git
application already started is allowed to finish, and the report records its
actual result. This is not a token or monetary budget.

## Tests

From this package directory:

```sh
npm test
VERIFIED_CHANGE_DOCKER_TEST=1 node --test test/installed-sandbox.test.mjs
VERIFIED_CHANGE_OPENCODE_TEST=1 node --test test/opencode-fixture.test.mjs
```

The installed tests pack into fresh temporary prefixes and use the existing
Docker image. OpenCode CLI tests use only a localhost scripted provider, not a
live model. Saved fallback, expansion, prerelease and UTF-16 cases are ordinary
product regressions in `test/known-repairs.test.mjs`, also run against the installed
bundle. They test controller decisions, exact selected patches and concrete
behavior. They do not run the historical grader, change any prior scores, or
establish a general quality improvement.
