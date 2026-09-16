# Command-hint comparison: eligibility blocked before model execution

The requested four-run development comparison has **not started**. Its purpose
is to measure additional complete autonomous deliveries with command hints,
using product candidate `c90fc7c78bcdd4d8288550b887f52990bafb11a6`.
An offline prerequisite check found a permissions mismatch between the previous
positive mechanism fixture and the existing direct experiment configuration.
There are no new model outcomes and no quality or navigation benefit claim.

## Confirmed prerequisite failure

The existing direct configuration in the prepared integrated environment has
`permission.external_directory = "deny"`. The previous positive installed
command-hint fixture explicitly used `external_directory = "allow"` in its
disposable project configuration. Its receipt/use evidence remains valid for
that fixture; it does not establish eligibility under the direct experiment's
denial policy. This new check preserves `deny` and does not broaden permissions.

One short offline installed reproduction reused the existing materializer and
scripted fixture on OpenCode 1.18.26 and the existing pinned Linux image:

1. Copy the saved public UFO baseline/dependencies into private container tmpfs,
   without Git history. Remove the fixture's intentional syntax defect from
   preparation; do not supply a defective patch or a new implementation task.
2. Execute the baseline's real `pnpm test` using its installed local manager.
   The suite passed without network or package installation.
3. Materialize the current native bundle and enable command hints, with all
   other optional flags off and the normal isolated delivery worktree layout.
4. A scripted author executes bare `pnpm test`. The native event is admitted,
   completed, exit 127, with exact `/bin/bash: line 1: pnpm: command not found`.
5. The next scripted author request contains the original failure, **no hint**.
   No `command-hint.json` exists. Original checkout is unchanged, native
   termination is verified, and the test container is removed.

The loaded resolver hash is
`4ba8f87a18157dfcf794c030d836ce4ca22260eb7a9c1472255b628b19f490bc`,
matched by the fixture to the source at the fixed candidate. Product source was
unchanged throughout this check. [RESULTS.json](RESULTS.json) retains the exact
native event, image/source hashes, elapsed time and accounting.

The code explains this observation: `reader.resolve()` in
`lib/native-command-hints.mjs` walks absolute path prefixes from the filesystem
root and calls `readableProjectPath()` for each prefix. Prefixes such as `/work`
are outside the delivery worktree. With `external_directory: deny`, the PATH
absence observation is rejected in `before()`, which catches the rejection and
returns null. Consequently `after()` cannot produce a hint, even though the
native Bash command ran and dependencies are installed. This happens before
the ancestor tool route can be considered. It is not a new native tool denial,
and no tool permission was bypassed.

Changing to `allow` would change the existing direct permission boundary.
Changing how the resolver handles parent metadata would change the frozen
product runtime. Neither is included in this comparison-only stage. A is
required to have a route discoverable by the current hint before spending any
model calls, so the comparison stops at eligibility. This is distinct from an
eligible model run later choosing an unsupported command or never triggering
the hint; such an actual run would have to remain in the results.

## Assigned slots and incomplete preparation

| Slot | Case | Arm | State | Q | T | D |
|---|---|---|---|---|---|---|
| 1 | A: missing bare package manager | OFF | not_started | unknown | unknown | unknown |
| 2 | A: same project and environment | ON | not_started | unknown | unknown | unknown |
| 3 | B: ordinary working checks | ON | not_started | unknown | unknown | unknown |
| 4 | B: same project and environment | OFF | not_started | unknown | unknown | unknown |

Intended fixed settings remain Luna high, 1800 seconds per full task-run,
direct, one author, context/checks/sensitivity/investigation/extra-attention off;
only command hints differ. No real request was made to the authorized endpoint.
Docker was available and no prior local container was running before this
check. Historical pauses and unknown server outcomes were not resumed or
reclassified. Credential validity metadata was inspected without exposing
credentials or probing the provider.

The two full behavior tasks, rubric and reference/incomplete calibration are
**not frozen or complete**. No model input copies or evaluator were produced.
This is a prerequisite reproduction, not the requested full-task scripted
preflight, model comparison, portable-patch acceptance, or full CI pass. No
task patch is published because none was authored. The historical aggregate
`PROCESS_CONTAINMENT_UNAVAILABLE` limitation remains separate; its verifier was
not rerun or disabled.

## Costs and reproduction

The four model slots consumed zero provider requests and zero model task-runs.
Their Q/T/D are unknown, not failures. There is no new remotely unknown request;
historical unknown usage remains unchanged. No dollar estimate is made.

Developer preparation is separate: one offline installed diagnostic took
15.291 seconds, including container preparation and cleanup, used five local
scripted HTTP requests including auxiliary requests and one author native Bash
call (101 ms). Baseline project checking is developer work, not author evidence.
Synthetic fixture token fields are not model usage. The resolver did not emit
its cost artifact on this path, so its read/time overhead is unmeasured, not
zero. No evaluator or new calibration run was performed. Developer-agent token
usage is unavailable in this ledger.

With the already prepared inputs/toolchain, reproduce locally with:

```sh
node development/native-command-hints-comparison/check-permissions.mjs
```

The adapter derives a bounded eligibility case from the existing installed
fixture, asserts every substitution, and saves its generated script and raw log
under ignored `local/native-command-hints-comparison/`. Docker runs without
network, credentials, privileges or writable host mounts. It does not add a
scheduler, relay, provider probe or product mechanism. The local scripted model
is deliberately used only for eligibility; this check does not validate a
Luna-configured full-task launcher. Historical fixtures and evidence are intact.

**Decision:** keep command hints experimental, with no further campaign
automatically scheduled. There is no positive delivery signal to preserve.
The requested measurement remains blocked on a separately resolved permission
compatibility decision; it is not completed by this report. Defaults, runtime,
transport and permissions are unchanged.
