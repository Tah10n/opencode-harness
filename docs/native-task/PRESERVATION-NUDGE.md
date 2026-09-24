# Preservation advisory — revision 2 (experimental, default off)

`HARNESS_TASK_PRESERVATION_NUDGE=1` adds at most one short advisory to a native
Bash receipt in a direct author session. It follows a confirmed, nonempty,
successful selected test run after production changes. The author considers
whether an appropriate existing behavioral scenario has already run on the
current build, and chooses a check if needed. A prior suitable check needs no
repeat. This intervention timing is a hypothesis; autonomous model improvement
has not been measured for revision 2.

Materialize a fresh bundle with the normal `--native --profile core --task`
installation, then enable the existing flag for a fresh task:

```sh
HARNESS_TASK_FILE=/absolute/original-task.txt \
HARNESS_TASK_STRATEGY=direct \
HARNESS_TASK_PRESERVATION_NUDGE=1 \
HARNESS_TASK_TIMEOUT_MS=900000 \
OPENCODE_CONFIG_DIR=/absolute/task-config opencode run --command harness-task
```

This example is not authorization for a model experiment. Default remains `0`:
no advisory module loading, additional reads, scans, state file or changed prompt.
Invalid flag values and enabling it outside direct are rejected before author
work. No new flag, tool, command, turn, acknowledgement or reporting obligation
is introduced. TYPE_COMPAT and other optional components remain independent.

## Trigger and supported observations

Eligibility requires an active author session, matched admitted Bash arguments
and callID, completed exit 0 without signal, timeout, cancellation, denial or
scope violation, production changes from the captured task baseline, stable
controlled state during the command, a contiguous event chain, a full consistent
nonempty supported report, no earlier attachment and at least 120 seconds left.
Permitted uncommitted user work belongs to the baseline, not to new author work.
JS/TS production detection retains its conservative diff-path exclusions for
tests and configuration; ambiguous paths remain unknown.

Revision 2 replaces the old trigger. It does not analyze test bodies, imports,
dynamic suite registration, sample directories, test origins or inferred
consumer coverage. New, changed and unchanged existing cases are treated alike.
No claim is made that a test exercised a new feature or that old coverage is
missing. Only observed names and totals identify the selected run.

Supported root-cwd forms use the existing conservative tokenizer:

- `node --test relative/file.test.js` (also `.mjs`/`.cjs`), with baseline
  `scripts.test: "node --test"` and no lifecycle hooks. A complete single-case
  TAP or Node spec report is required. Names need not match source literals.
- `./node_modules/.bin/mocha --opts project.opts [file.js ...] [--grep 'filter']`.
  At least one explicit file or a filter is required. The baseline test script
  must identify the same opts file as `mocha --opts project.opts`. Configuration
  must remain unchanged; the report, not positional files, describes execution.
  An opts file can load additional suites even when a positional file is given.
- The previously supported `npm test -- --grep 'filter'` route retains its
  unchanged configuration and observed lifecycle/build-banner checks: pretest
  `npm run build`, build `node file && rollup -c [config]` with optional further
  Rollup steps. This does not certify current compiled output freshness.

Command text is capped at 4096 characters, paths at 180 characters, and direct
Mocha selection at 32 explicit files. Each form optionally accepts exactly `. /usr/local/nvm/nvm.sh && nvm use X.Y.Z &&`
or `source /usr/local/nvm/nvm.sh && nvm use X.Y.Z &&`, with a matching observed
version banner. Filters are bounded strings (120 characters), never executed as
regular expressions by the host. The shared tokenizer conservatively rejects
substitution syntax, including dollar signs even inside quotes. Pipelines,
trailing commands, masked exits, unsupported options and ambiguous cwd remain
unknown; this is not a general shell or runner parser.

Mocha accepts complete flat named spec sections with unique case rows and an
exact matching positive final passing total. Node keeps the strict single-case
TAP/spec totals grammar. Zero, pending/skipped-only, failure, duplicate totals,
truncated reports and unsupported reporter output do not qualify. `echo`, build,
formatting or arbitrary stdout containing “passing” does not qualify.

## Advice, trust and cost

The block says, for example:

> Preservation advisory: After production changes, a selected test run passed:
> "arithmetic: public arithmetic". This result alone does not establish
> preservation of other behavior. Before further expectation or snapshot updates,
> consider whether an appropriate existing behavioral scenario for the affected
> path has run on the current build. If not, choose and run one; if already
> checked, no repeat is needed. Prefer a check taking at most 120 seconds including
> preparation. This advice does not certify build freshness or replace task
> requirements and final checks. Further edits may require repeating tests.

Project-controlled names are restricted, JSON-quoted and bounded to 20 words /
180 characters. Raw observed output is bounded to 128 KiB. Configuration reads
use the existing observer's permissions, symlink refusal and per-file limits.
No project JavaScript executes on the host for discovery. No spill-file tail is
read or inserted into a receipt automatically.

The 120-second suggestion includes preparation, costs real time and remains
inside the existing total deadline. It grants no extra budget. The author may
ignore the advice or repeat tests after later changes without creating a new
workflow obligation.

Raw native output is persisted first; advice is attached separately and never
parsed as stdout. `successful`, requirements, unresolved failures, repair
authority, permission continuations and workflow success are unchanged. A
passing portable Mocha patch can coexist with the observer's `incomplete` status.
Active/cancellation/deadline/state checks precede attachment; the existing queue
holds the pending ticket and releases it in `finally`. Optional advisory errors
skip; native boundary violations retain their normal stop behavior.

`preservation-nudge.json` has `version: 2`, considered/eligible counts, skip
reasons, classification time, additional read attempts, block bytes, and one
candidate linked to callID and snapshots. Old origin/coverage fields are absent.
`eligible`, `attached_to_receipt`, and presence in an actual subsequent provider
request are separate facts. Full outputs, receipts and request captures remain
separate evidence sources.

## Evidence and local checks

[Revision 2 report](../../development/preservation-nudge/revision-2/REPORT.md)
records the bounded ON replay and OpenCode 1.18.26 installed scripted path,
including changed existing Mocha/Node cases, red→repair→green, portable patches,
OFF and irrelevant-test controls, output retention, overhead and failed attempts.
Scripted choices and repairs are predetermined, not autonomous model behavior.

```sh
node scripts/verify-native-preservation-nudge.mjs
node scripts/verify-native-preservation-hooks.mjs
node development/preservation-nudge/revision-2/replay.mjs
node scripts/run-native-preservation-installed.mjs
```

Replay requires retained private ON events; missing intermediate snapshots remain
unknown. Installed checks require the existing local toolchain, dependency
archive and pinned Docker image; no network installation or host credentials.
Private raw captures stay under ignored `local/native-preservation-integration/`.
The repaired common output collector is reused unchanged.

[Revision 1 evidence](../../development/preservation-nudge/REPORT.md) and
[historical model pair](../../development/preservation-nudge/model-pair/REPORT.md)
remain unchanged. Revision 1 runtime is available in Git history; two competing
nudges are not installed together. No new model pair or benchmark is scheduled.
