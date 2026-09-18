# Independent checks used in this diagnostic

These are the assertions frozen before the 12 model runs. They were unavailable
to authors and reviewers. They are now published for inspection and reproduction;
none contains the reference implementation. `manifest.json` binds each source file
to its pre-score SHA-256 and the published file or preservation-test delta.

Use the public VibeRacing commit in `../../selection.json`, apply one outcome patch,
and run inside the same offline Node 24 environment with a temporary home. The
original project test files and fixture directories must be present. Models are
not needed for any check below. Do not run these commands against personal state.

First run the delivered protocol, state-security and executables suites plus any
new transport test file. Run the task's relevant config-test selector from
`../../evaluation-plan.json`; include added candidate config test titles. For
reconnect, the delivered-suite selector is `reconnect`, because a legitimate
solution can preserve an old test title. This selector correction does not change
any assertion or model task. Each ordinary/preservation suite has the original
one Windows-only skip on Linux.

Then use a separate copy to restore the initial four test files before testing
preservation. API intentionally changes a valid-error return contract, so apply
`protocol-error-api/compat-protocol.test.mjs.patch` to the restored protocol test.
Reconnect intentionally changes 401/403 handling, so apply the 401 or 403 config
patch separately to the restored config test, never stack both. Each retains the
old successful disconnected-source scenario, transient/malformed assertions and
adds revoked-auth recovery with stale pending data. Run its exact title:

```sh
node --test --test-name-pattern='reconnect preserves transient failures, retires disconnected sources, and recovers revoked authorization' packages/connector/test/config.test.mjs
```

The reconnect grader also runs these five unmodified existing test titles to
check the original task's cancellation/ownership requirements:

```sh
node --test --test-name-pattern='source and installation mutations invalidate|disconnect wins both connection-state lock orders|later disconnect defeats pending|reconnect rejects omission|reconnect replaces authorization' packages/connector/test/config.test.mjs
```

For legacy state, apply its security-test delta to the initial security test and
run all nine cases. The standalone API, state and extraction acceptance files
use the `PROJECT` environment variable to locate an independently patched public
checkout. Put the acceptance file outside that checkout, as it was during grading:

```sh
PROJECT=/work/repo node --test /work/acceptance.test.mjs
```

The original frozen state reload case uses a recognized *subset* of the legacy
files. Its acceptance boundary is ambiguous in the prompt. B's raw failure is
preserved, but the independently demonstrated Windows separator defect is the
reason B is not adjudicated a complete delivery. The reconnect notification
assertion accepts general pairing/reconnection/authorization wording; it does not
mandate the reference message. No observed result failed on that wording.

Raw check counts, process exits and cleanup codes are in each adjacent per-run
JSON. The report separates test failures, lost supplied coverage, source-level
portability evidence, maintenance notes and internal harness status. The grader's
outcome is not simply the harness's own verdict.
